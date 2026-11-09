import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { isDemoMode, requireUser } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { getInventory } from "@/lib/inventory";

// Every SKU matching the page's filters, one column per store, as CSV.
export async function GET(request: NextRequest) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const { stores, rows } = await getInventory(Object.fromEntries(request.nextUrl.searchParams), null);
  return csvResponse("inventory", [
    ["SKU", ...stores.map((store) => store.name), "Total"],
    ...rows.map(([sku, row]) => [sku, ...stores.map((store) => row.byStore.get(store.id)?.quantity), row.total]),
  ]);
}
