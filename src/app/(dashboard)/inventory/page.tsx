import type { Metadata } from "next";
import Form from "next/form";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { isDemoMode, requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const query = ((await searchParams).q ?? "").trim();
  const prisma = getPrisma();
  const [stores, levels, syncs] = await Promise.all([
    prisma.shopifyStore.findMany({ where: { accessToken: { not: null } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.inventoryLevel.findMany({
      where: query ? { OR: [{ sku: { contains: query, mode: "insensitive" } }, { productName: { contains: query, mode: "insensitive" } }] } : {},
      orderBy: { sku: "asc" },
    }),
    prisma.inventoryLevel.groupBy({ by: ["storeId"], _max: { syncedAt: true } }),
  ]);

  // One row per SKU, one column per store. The name comes from the first store that has the SKU.
  const rows = new Map<string, { sku: string; productName: string; byStore: Map<string, number>; total: number }>();
  const syncedAt = new Map(syncs.map((sync) => [sync.storeId, sync._max.syncedAt ?? undefined]));
  for (const level of levels) {
    const row = rows.get(level.sku) ?? { sku: level.sku, productName: level.productName, byStore: new Map(), total: 0 };
    row.byStore.set(level.storeId, level.quantity);
    row.total += level.quantity;
    rows.set(level.sku, row);
  }
  const updated = (date?: Date) => (date ? formatDate(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not synced");

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Stock</p><h1>Inventory</h1><p className="page-subtitle">Sellable stock per SKU in each store, from Shopify. Refreshed with every order sync.</p></div>
        <div className="heading-controls"><span className="results-count">{rows.size.toLocaleString("en-GB")} {rows.size === 1 ? "SKU" : "SKUs"}</span></div>
      </div>
      <section className="panel table-panel">
        <Form className="filter-bar" action="/inventory" key={query}>
          <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search SKU or product name" defaultValue={query} aria-label="Search inventory" /></label>
          <button className="search-button filter-apply" type="submit">Search</button>
        </Form>
        {rows.size ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th><th>Product</th>
                  {stores.map((store) => <th key={store.id} className="numeric" title={`Updated ${updated(syncedAt.get(store.id))}`}>{store.name}</th>)}
                  <th className="numeric">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...rows.values()].map((row) => (
                  <tr key={row.sku}>
                    <td className="customer-cell">{row.sku}</td>
                    <td>{row.productName}</td>
                    {stores.map((store) => <td key={store.id} className="numeric">{row.byStore.get(store.id) ?? ""}</td>)}
                    <td className="numeric"><strong>{row.total}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">{query ? "No SKUs match that search." : "No inventory yet. It appears after the next sync of a store connected with the inventory scopes."}</div>}
      </section>
      {stores.length > 0 && <p className="page-subtitle">Last updated: {stores.map((store) => `${store.name} ${updated(syncedAt.get(store.id))}`).join(" · ")}</p>}
    </>
  );
}
