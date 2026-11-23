import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Ctx } from "./errors";
import { sessionStillValid } from "./staff";

// Signed-in users carry a signed JWT in an httpOnly cookie, valid for 7 days.
// The user is reloaded on every request, so a deactivated account, or one whose password
// changed since this sign-in, is locked out at once.
const COOKIE = "kantemba_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function startSession(userId: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await db.user.findUnique({ where: { id: payload.sub }, include: { business: true } });
    // Locked out at once if switched off, or if the password changed after this sign-in.
    return user?.isActive && sessionStillValid(payload.iat, user.passwordChangedAt) ? user : null;
  } catch {
    return null;
  }
}

/** For pages and actions that need a signed-in user: returns the user and their service context. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const ctx: Ctx = { businessId: user.businessId, userId: user.id, role: user.role };
  return { user, ctx };
}
