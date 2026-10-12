import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after, type NextRequest } from "next/server";
import { SHOPIFY_OAUTH_COOKIE } from "@/lib/app-url";
import { requireAdmin } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { getPrisma } from "@/lib/prisma";
import { connectStore, isValidCallbackHmac, normalizeShopDomain, syncStore } from "@/lib/shopify";

// Shopify redirects here after the merchant approves the app.
export async function GET(request: NextRequest) {
  await requireAdmin();
  const query = request.nextUrl.searchParams;
  const cookieStore = await cookies();
  const [storeId, expectedState] = (cookieStore.get(SHOPIFY_OAUTH_COOKIE)?.value ?? "").split(".");
  cookieStore.delete({ name: SHOPIFY_OAUTH_COOKIE, path: "/api/shopify" });

  const fail: (message: string) => never = (message) => redirect(`/stores?error=${encodeURIComponent(message)}`);
  if (!storeId || !expectedState || query.get("state") !== expectedState) fail("The connection request expired or didn't match. Click Connect again.");

  const store = await getPrisma().shopifyStore.findUnique({ where: { id: storeId } });
  if (!store) fail("Store not found.");
  if (normalizeShopDomain(query.get("shop") ?? "") !== store.shopDomain) fail("Shopify returned a different store than the one being connected.");
  if (!isValidCallbackHmac(query, decrypt(store.clientSecret))) fail("Shopify's signature didn't verify. Check the Client secret.");
  const code = query.get("code");
  if (!code) fail("Shopify didn't return an authorization code.");

  try {
    await connectStore(store, code);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Connecting the store failed.");
  }
  // First import can take a while; run it after the redirect is sent.
  after(() => syncStore(store.id).catch((error) => console.error(`[shopify] ${store.shopDomain}: ${error.message}`)));
  redirect(`/stores?connected=${encodeURIComponent(store.shopDomain)}`);
}
