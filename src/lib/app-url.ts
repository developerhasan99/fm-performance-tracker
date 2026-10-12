import { headers } from "next/headers";

/** Public base URL, used for the Shopify redirect URI. Set APP_URL in production (e.g. https://parcel.up.railway.app). */
export async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = (await headers()).get("host");
  return `${host?.startsWith("localhost") ? "http" : "https"}://${host}`;
}

export const SHOPIFY_OAUTH_COOKIE = "shopify_oauth";
