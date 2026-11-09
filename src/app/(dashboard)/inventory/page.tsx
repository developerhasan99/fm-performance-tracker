import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { isDemoMode, requireUser } from "@/lib/auth";
import { ORDERS_PAGE_SIZE as PAGE_SIZE, formatDate } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const activeOnly = params.status === "active";
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const prisma = getPrisma();

  // "Active" = the product is active in at least one store; its other stores still show.
  // ponytail: lists every matching SKU to paginate; fine for thousands, move to SQL DISTINCT + LIMIT beyond that.
  const [stores, matching, syncs] = await Promise.all([
    prisma.shopifyStore.findMany({ where: { accessToken: { not: null } }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.inventoryLevel.groupBy({ by: ["sku"], where: { ...(query && { sku: { contains: query, mode: "insensitive" as const } }), ...(activeOnly && { active: true }) }, orderBy: { sku: "asc" } }),
    prisma.inventoryLevel.groupBy({ by: ["storeId"], _max: { syncedAt: true } }),
  ]);
  const total = matching.length;
  const skus = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row) => row.sku);
  const levels = await prisma.inventoryLevel.findMany({ where: { sku: { in: skus } } });

  const rows = new Map(skus.map((sku) => [sku, { byStore: new Map<string, { quantity: number; active: boolean }>(), total: 0 }]));
  for (const level of levels) {
    const row = rows.get(level.sku)!;
    row.byStore.set(level.storeId, level);
    row.total += level.quantity;
  }
  const syncedAt = new Map(syncs.map((sync) => [sync.storeId, sync._max.syncedAt ?? undefined]));
  const updated = (date?: Date) => (date ? formatDate(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not synced");

  const search = new URLSearchParams({ ...(query && { q: query }), ...(activeOnly && { status: "active" }) });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const pageSearch = new URLSearchParams(search);
    if (target > 1) pageSearch.set("page", String(target));
    return `/inventory${pageSearch.size ? `?${pageSearch}` : ""}`;
  };
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Stock</p><h1>Inventory</h1><p className="page-subtitle">Sellable stock per SKU in each store, from Shopify. Refreshed with every order sync. Grey numbers: the product isn&apos;t active in that store.</p></div>
        <div className="heading-controls"><span className="results-count">{total.toLocaleString("en-GB")} {total === 1 ? "SKU" : "SKUs"}{search.size > 0 && <> · <Link className="clear-link" href="/inventory">Clear filters</Link></>}</span></div>
      </div>
      <section className="panel table-panel">
        <Form className="filter-bar" action="/inventory" key={search.toString()}>
          <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search SKU" defaultValue={query} aria-label="Search SKU" /></label>
          <select className="filter-select" name="status" defaultValue={activeOnly ? "active" : ""} aria-label="Filter by product status">
            <option value="">All products</option>
            <option value="active">Active in at least one store</option>
          </select>
          <button className="search-button filter-apply" type="submit">Apply</button>
        </Form>
        {total ? (
          <div className="table-scroll">
            <table className="data-table inventory-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  {stores.map((store) => <th key={store.id} className="numeric" title={`Updated ${updated(syncedAt.get(store.id))}`}>{store.name}</th>)}
                  <th className="numeric">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].map(([sku, row]) => (
                  <tr key={sku}>
                    <td className="customer-cell">{sku}</td>
                    {stores.map((store) => {
                      const level = row.byStore.get(store.id);
                      return <td key={store.id} className={`numeric${level && !level.active ? " inactive-stock" : ""}`} title={level && !level.active ? "Not active in this store" : undefined}>{level?.quantity ?? ""}</td>;
                    })}
                    <td className="numeric"><strong>{row.total}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">{search.size ? "No SKUs match these filters." : "No inventory yet. It appears after the next sync of a store connected with the inventory scopes."}</div>}
      </section>
      {total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Inventory pages">
          <span>{first}–{first + skus.length - 1} of {total}</span>
          {page > 1 ? <Link className="secondary-button" href={pageHref(page - 1)}><ChevronLeft size={12} />Previous</Link> : <span className="secondary-button" aria-disabled="true"><ChevronLeft size={12} />Previous</span>}
          <span>Page {page} of {pageCount}</span>
          {page < pageCount ? <Link className="secondary-button" href={pageHref(page + 1)}>Next<ChevronRight size={12} /></Link> : <span className="secondary-button" aria-disabled="true">Next<ChevronRight size={12} /></span>}
        </nav>
      )}
      {stores.length > 0 && <p className="page-subtitle">Last updated: {stores.map((store) => `${store.name} ${updated(syncedAt.get(store.id))}`).join(" · ")}</p>}
    </>
  );
}
