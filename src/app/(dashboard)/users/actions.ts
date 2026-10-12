"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";
import { hashPassword, normalizeEmail, passwordProblem } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";


const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const fail = (message: string): ActionResult => ({ ok: false, message });

export async function createUser(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = field(formData, "name");
  const email = normalizeEmail(field(formData, "email"));
  const password = String(formData.get("password") ?? "");
  if (!name || name.length > 100) return fail("Enter a name (up to 100 characters).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
  const problem = passwordProblem(password);
  if (problem) return fail(problem);

  try {
    await getPrisma().user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("A user with that email already exists.");
    throw error;
  }
  revalidatePath("/users");
  return { ok: true, message: `Added ${email}.` };
}

export async function resetPassword(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = field(formData, "userId");
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return fail(problem);

  const prisma = getPrisma();
  const { count } = await prisma.user.updateMany({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  if (!count) return fail("User not found.");
  // Sign the user out everywhere, except the admin's own current session.
  await prisma.session.deleteMany({ where: { userId, id: { not: admin.sessionId } } });
  return { ok: true, message: "Password updated." };
}

export async function deleteUser(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const userId = field(formData, "userId");
  if (userId === admin.id) return fail("You can't delete your own account.");
  await getPrisma().user.deleteMany({ where: { id: userId } });
  revalidatePath("/users");
  return { ok: true, message: "User deleted." };
}
