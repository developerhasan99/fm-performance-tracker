import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 7;

export type CurrentUser = { id: string; name: string; email: string; role: Role; sessionId: string };

// Sample mode has no database, so there is nothing to log in against. It never shows real data.
const DEMO_USER: CurrentUser = { id: "demo", name: "Sample preview", email: "", role: "admin", sessionId: "demo" };
export const isDemoMode = () => process.env.DASHBOARD_DEMO_MODE === "true";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getPrisma().session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await getPrisma().session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (isDemoMode()) return DEMO_USER;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getPrisma().session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, user: { select: { id: true, name: true, email: true, role: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { ...session.user, sessionId: session.id };
});

/** Call at the top of every protected page and server action. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
