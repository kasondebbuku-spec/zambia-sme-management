import { PrismaClient, type Prisma } from "@prisma/client";

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** A Prisma client or a transaction, so services can join a caller's transaction. */
export type Tx = Prisma.TransactionClient;
