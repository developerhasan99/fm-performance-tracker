"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, isDemoMode } from "@/lib/auth";
import { hashPassword, normalizeEmail, verifyPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
// ponytail: in-memory limiter, resets on restart and isn't shared across instances; move to the DB if you scale out.
const failures = new Map<string, { count: number; firstAt: number }>();
// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const dummyHash = hashPassword("not-a-real-password");

function isLocked(key: string) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string) {
  const entry = failures.get(key);
  if (entry) entry.count += 1;
  else failures.set(key, { count: 1, firstAt: Date.now() });
}

export async function login(_state: string | undefined, formData: FormData) {
  if (isDemoMode()) redirect("/");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return "Enter your email and password.";

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const keys = [`email:${email}`, `ip:${ip}`];
  if (keys.some(isLocked)) return "Too many failed attempts. Try again in 15 minutes.";

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid) {
    keys.forEach(recordFailure);
    return "Incorrect email or password.";
  }

  keys.forEach((key) => failures.delete(key));
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  if (!isDemoMode()) await destroySession();
  redirect("/login");
}
