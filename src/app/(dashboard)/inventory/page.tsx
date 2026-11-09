import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { isDemoMode, requireUser } from "@/lib/auth";
import { ORDERS_PAGE_SIZE as PAGE_SIZE, formatDate } from "@/lib/dashboard";
import { getInventory, type InventoryParams } from "@/lib/inventory";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<InventoryParams & { page?: string }> }) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const { query, status, stock, search, stores, rows, total, anySynced, syncedAt } = await getInventory(params, { number: page, size: PAGE_SIZE });
  const updated = (date?: Date) => (date ? formatDate(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not synced");

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const pageSearch = new URLSearchParams(search);
    if (target > 1) pageSearch.set("page", String(target));
    return `/inventory${pageSearch.size ? `?${pageSearch}` : ""}`;
  };
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Stock</p><h1>Inventory</h1><p className="page-subtitle">Sellable stock per SKU in each store, from Shopify. Refreshed with every order sync; each column shows when. Grey numbers: the product isn&apos;t active in that store.</p></div>
        <div className="heading-controls"><span className="results-count">{total.toLocaleString("en-GB")} {total === 1 ? "SKU" : "SKUs"}{search.size > 0 && <> · <Link className="clear-link" href="/inventory">Clear filters</Link></>}</span>
          {total > 0 && <a className="secondary-button" href={`/inventory/export${search.size ? `?${search}` : ""}`} download title="Download every SKU matching the applied filters"><Download size={13} />Export CSV</a>}
        </div>
      </div>
      <section className="panel table-panel">
        <Form className="filter-bar" action="/inventory" key={search.toString()}>
          <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search SKU" defaultValue={query} aria-label="Search SKU" /></label>
          <select className="filter-select" name="status" defaultValue={status === "everywhere" ? "" : status} aria-label="Filter by product status">
            <option value="">Active in all stores</option>
            <option value="any">Active in at least one store</option>
            <option value="all">All products</option>
          </select>
          <select className="filter-select" name="stock" defaultValue={stock ?? ""} aria-label="Filter by stock">
            <option value="">All stock levels</option>
            <option value="in">In stock in all stores</option>
            <option value="some">Out of stock in some stores</option>
            <option value="out">Out of stock in all stores</option>
          </select>
          <button className="search-button filter-apply" type="submit">Apply</button>
        </Form>
        {total ? (
          <div className="table-scroll">
            <table className="data-table inventory-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  {stores.map((store) => <th key={store.id} className="numeric">{store.name}<span className="th-note">{updated(syncedAt.get(store.id))}</span></th>)}
                  <th className="numeric">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([sku, row]) => (
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
        ) : <div className="empty-state">{anySynced ? "No SKUs match these filters." : "No inventory yet. It appears after the next sync of a store connected with the inventory scopes."}</div>}
      </section>
      {total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Inventory pages">
          <span>{first}–{first + rows.length - 1} of {total}</span>
          {page > 1 ? <Link className="secondary-button" href={pageHref(page - 1)}><ChevronLeft size={12} />Previous</Link> : <span className="secondary-button" aria-disabled="true"><ChevronLeft size={12} />Previous</span>}
          <span>Page {page} of {pageCount}</span>
          {page < pageCount ? <Link className="secondary-button" href={pageHref(page + 1)}>Next<ChevronRight size={12} /></Link> : <span className="secondary-button" aria-disabled="true">Next<ChevronRight size={12} /></span>}
        </nav>
      )}
    </>
  );
}
