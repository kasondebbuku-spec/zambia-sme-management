import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { hashPassword, newPassword } from "./accounts";
import { db } from "./db";
import { DomainError, requireRole, type Ctx } from "./errors";

// The owner manages the shop's logins. Staff are managers or cashiers; there is one owner,
// and nothing here can change, lock out or take over an owner's account.

const staffRole = z.enum(["MANAGER", "CASHIER"], { message: "Choose manager or cashier" });

export const staffInput = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: staffRole,
  password: newPassword,
});

const staffSelect = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } satisfies Prisma.UserSelect;

export async function listStaff(ctx: Ctx) {
  requireRole(ctx, "OWNER");
  return db.user.findMany({ where: { businessId: ctx.businessId }, select: staffSelect, orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }] });
}

/** Adds a manager or cashier with a starting password the owner tells them. */
export async function addStaff(ctx: Ctx, input: z.input<typeof staffInput>) {
  requireRole(ctx, "OWNER");
  const data = staffInput.parse(input);
  try {
    return await db.user.create({
      data: { businessId: ctx.businessId, name: data.name, email: data.email, role: data.role, passwordHash: await hashPassword(data.password) },
      select: staffSelect,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DomainError("Someone already uses that email on Kantemba. Use a different one.", "conflict");
    throw e;
  }
}

/** The password rules, reported as a plain message. */
function checkNewPassword(password: string) {
  const r = newPassword.safeParse(password);
  if (!r.success) throw new DomainError(r.error.issues[0]?.message ?? "Choose a longer password", "invalid");
  return r.data;
}

/** Finds a staff member the owner may change: in this shop, not an owner, not themselves. */
async function staffMember(ctx: Ctx, userId: string) {
  requireRole(ctx, "OWNER");
  const user = await db.user.findFirst({ where: { id: userId, businessId: ctx.businessId } });
  if (!user) throw new DomainError("Staff member not found", "not_found");
  if (user.id === ctx.userId) throw new DomainError("You can't change your own access here.", "forbidden");
  if (user.role === "OWNER") throw new DomainError("An owner's account can't be changed here.", "forbidden");
  return user;
}

export async function setStaffRole(ctx: Ctx, userId: string, role: "MANAGER" | "CASHIER") {
  const r = staffRole.parse(role);
  await staffMember(ctx, userId);
  await db.user.update({ where: { id: userId }, data: { role: r } });
}

/** Switching a login off signs that person out at once (the session reloads the user on every request). */
export async function setStaffActive(ctx: Ctx, userId: string, isActive: boolean) {
  await staffMember(ctx, userId);
  await db.user.update({ where: { id: userId }, data: { isActive } });
}

/** For a forgotten password. Signs them out everywhere; they sign in with the new one. */
export async function resetStaffPassword(ctx: Ctx, userId: string, password: string) {
  await staffMember(ctx, userId);
  const pw = checkNewPassword(password);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw), passwordChangedAt: new Date() } });
}

/** Anyone can change their own password, after giving the current one. Other phones are signed out. */
export async function changeOwnPassword(ctx: Ctx, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw new DomainError("Your current password isn't right.", "invalid");
  const pw = checkNewPassword(next);
  if (pw === current) throw new DomainError("Choose a password different from the current one.", "invalid");
  await db.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(pw), passwordChangedAt: new Date() } });
}

/** A session token is refused if it was issued before the password last changed. Times are in whole seconds, like the token's. */
export function sessionStillValid(issuedAtSeconds: number | undefined, passwordChangedAt: Date | null) {
  if (!passwordChangedAt) return true;
  if (issuedAtSeconds === undefined) return false;
  return issuedAtSeconds >= Math.floor(passwordChangedAt.getTime() / 1000);
}
