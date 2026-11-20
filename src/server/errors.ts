import type { Role } from "@prisma/client";

/** An expected problem with a message that's safe to show the user. */
export class DomainError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "forbidden" | "invalid" | "conflict" | "insufficient_stock",
  ) {
    super(message);
  }
}

export class InsufficientStockError extends DomainError {
  constructor(
    public productName: string,
    public available: number,
    public requested: number,
  ) {
    super(`Only ${available} ${productName} in stock, but ${requested} needed`, "insufficient_stock");
  }
}

/** Who is acting, and for which business. Every service takes one. */
export type Ctx = { businessId: string; userId: string; role: Role };

export function requireRole(ctx: Ctx, ...roles: Role[]) {
  if (!roles.includes(ctx.role)) throw new DomainError("Your role doesn't allow this", "forbidden");
}
