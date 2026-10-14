"use server";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { SHOPIFY_OAUTH_COOKIE, appUrl } from "@/lib/app-url";
import { requireAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import { getPrisma } from "@/lib/prisma";
import { authorizeUrl, getSyncProgress, normalizeCustomDomain, normalizeShopDomain, syncStore } from "@/lib/shopify";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const fail = (message: string): ActionResult => ({ ok: false, message });

function slaDays(value: string, fallback: number) {
  const days = value === "" ? fallback : Number(value);
  return Number.isInteger(days) && days >= 0 && days <= 60 ? days : null;
}

export async function addStore(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = field(formData, "name");
  const shopDomain = normalizeShopDomain(field(formData, "shopDomain"));
  const customInput = field(formData, "customDomain");
  const customDomain = customInput ? normalizeCustomDomain(customInput) : null;
  const clientId = field(formData, "clientId");
  const clientSecret = field(formData, "clientSecret");
  const importInput = field(formData, "importOrdersFrom");
  // <input type="date"> gives YYYY-MM-DD; stored as midnight UTC.
  const importOrdersFrom = /^\d{4}-\d{2}-\d{2}$/.test(importInput) ? new Date(`${importInput}T00:00:00Z`) : null;
  const dispatchSlaDays = slaDays(field(formData, "dispatchSlaDays"), 2);
  const deliverySlaDays = slaDays(field(formData, "deliverySlaDays"), 5);

  if (!name || name.length > 100) return fail("Enter a store name (up to 100 characters).");
  if (!shopDomain) return fail("Enter the store's myshopify.com domain, e.g. acme.myshopify.com.");
  if (customInput && !customDomain) return fail("Enter the custom domain without a path, e.g. acme.com.");
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(clientId) || clientSecret.length < 8 || clientSecret.length > 200) return fail("Paste the app's Client ID and Client secret from the Shopify Dev Dashboard.");
  if (importInput && (!importOrdersFrom || Number.isNaN(importOrdersFrom.getTime()))) return fail("Enter a valid import start date.");
  if (dispatchSlaDays === null || deliverySlaDays === null) return fail("SLA days must be whole numbers between 0 and 60.");

  try {
    await getPrisma().shopifyStore.create({
      data: { name, shopDomain, customDomain, clientId, clientSecret: encrypt(clientSecret), importOrdersFrom, dispatchSlaDays, deliverySlaDays },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("That store has already been added.");
    throw error;
  }
  revalidatePath("/stores");
  return { ok: true, message: `Added ${shopDomain}. Click Connect to authorize it.` };
}

export async function connectStore(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const store = await getPrisma().shopifyStore.findUnique({ where: { id: field(formData, "storeId") } });
  if (!store) return fail("Store not found.");
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(SHOPIFY_OAUTH_COOKIE, `${store.id}.${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/shopify",
    maxAge: 10 * 60,
  });
  redirect(authorizeUrl(store, `${await appUrl()}/api/shopify/callback`, state));
}

export async function syncNow(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const storeId = field(formData, "storeId");
  if (getSyncProgress(storeId)) return { ok: true, message: "A sync is already running." };
  // Runs in the background (the server is long-lived); progress and any error show on the store row.
  // syncStore registers its progress synchronously, so the re-render below already shows "Syncing…".
  void syncStore(storeId).catch((error) => console.error(`[shopify] sync ${storeId}: ${error instanceof Error ? error.message : error}`));
  revalidatePath("/stores");
  return undefined;
}

export async function deleteStore(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    await getPrisma().shopifyStore.deleteMany({ where: { id: field(formData, "storeId") } });
  } catch (error) {
    // Order.storeId is ON DELETE RESTRICT: imported orders are never deleted along with a store.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return fail("This store has imported orders, so it can't be deleted. Uninstall the app in Shopify to stop syncing.");
    throw error;
  }
  revalidatePath("/stores");
  return { ok: true, message: "Store deleted." };
}
