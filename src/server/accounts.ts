import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { DomainError } from "./errors";

const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

/** While piloting, SIGNUP_CODE limits sign-up to people given the code. */
export const signUpNeedsCode = () => Boolean(process.env.SIGNUP_CODE);

function codeMatches(given: string | undefined) {
  const expected = process.env.SIGNUP_CODE;
  if (!expected) return true;
  const a = Buffer.from((given ?? "").trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const signUpInput = z.object({
  inviteCode: z.string().optional(),
  businessName: z.string().trim().min(2, "Enter your business name").max(120),
  town: z.string().trim().max(60).optional(),
  ownerName: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

/** Creates a business and its owner together. */
export async function registerBusiness(input: z.input<typeof signUpInput>) {
  const data = signUpInput.parse(input);
  if (!codeMatches(data.inviteCode)) throw new DomainError("That invite code isn't right. Check it with whoever gave it to you.", "forbidden");
  const passwordHash = await bcrypt.hash(data.password, ROUNDS);
  try {
    return await db.$transaction(async (tx) => {
      const business = await tx.business.create({ data: { name: data.businessName, town: data.town || null } });
      return tx.user.create({ data: { businessId: business.id, email: data.email, name: data.ownerName, passwordHash, role: "OWNER" } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DomainError("An account with that email already exists. Sign in instead.", "conflict");
    }
    throw e;
  }
}

// Compared against when the email doesn't exist, so response times don't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

/** Returns the user for a correct email and password, otherwise null. */
export async function checkPassword(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok && user.isActive ? user : null;
}

// A small in-memory limit on sign-in attempts per email: enough for one server.
// A deployment with several servers would keep this in Redis or the database instead.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function tooManyAttempts(key: string, now = Date.now()): boolean {
  const a = attempts.get(key);
  if (!a || a.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  a.count++;
  return a.count > MAX_ATTEMPTS;
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
