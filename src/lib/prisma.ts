import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when DASHBOARD_DEMO_MODE is not true.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export function getPrisma() {
  if (!globalThis.prisma) globalThis.prisma = createPrismaClient();
  return globalThis.prisma;
}

/**
 * Runs independent writes a few at a time. Used instead of one big $transaction, which times out (5 s)
 * over a slow connection; each write here is safe to repeat, so no transaction is needed.
 */
export async function runInBatches<T>(items: T[], write: (item: T) => Promise<unknown>, concurrency = 10) {
  for (let start = 0; start < items.length; start += concurrency) {
    await Promise.all(items.slice(start, start + concurrency).map(write));
  }
}
