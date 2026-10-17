import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Calendar, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { OrdersTable } from "@/components/orders-table";
import { ORDERS_PAGE_SIZE, getOrders, getStoreOptions, orderStatuses, parseOrderParams, type OrderParams } from "@/lib/dashboard";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrderParams & { page?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const stores = await getStoreOptions();
  const { query, status, storeId, noShipping, from, to, filters, search } = parseOrderParams(params, stores);
  const { includeNoShipping } = filters;
  const { orders, total } = await getOrders({ ...filters, page });
  const hasFilters = Boolean(query || status || storeId || includeNoShipping || from || to);
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const pageHref = (target: number) => {
    const pageSearch = new URLSearchParams(search);
    if (target > 1) pageSearch.set("page", String(target));
    return `/orders${pageSearch.size ? `?${pageSearch}` : ""}`;
  };
  const first = total ? (page - 1) * ORDERS_PAGE_SIZE + 1 : 0;

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Order management</p><h1>Orders</h1><p className="page-subtitle">Follow each order from checkout through delivery and support.</p></div>
        <div className="heading-controls">
          <span className="results-count">{total.toLocaleString("en-GB")} {total === 1 ? "order" : "orders"}{hasFilters && <> · <Link className="clear-link" href="/orders">Clear filters</Link></>}</span>
          {total > 0 && <a className="secondary-button" href={`/orders/export${search.size ? `?${search}` : ""}`} download title="Download every order matching the applied filters"><Download size={13} />Export CSV</a>}
        </div>
      </div>
      {(process.env.DASHBOARD_DEMO_MODE === "true" || orders.some((order) => order.isSampleData)) && <div className="sample-banner" role="status"><span><strong>Sample data included</strong> — seeded rows are illustrative; connect your systems for live reporting.</span></div>}
      <section className="panel table-panel">
      <Form className="filter-bar" action="/orders" key={`${query}|${status}|${storeId}|${includeNoShipping}|${from}|${to}`}>
        <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search order, customer or partner" defaultValue={query} aria-label="Search orders" /></label>
        <select className="filter-select" name="status" defaultValue={status ?? ""} aria-label="Filter by fulfilment status">
          <option value="">All statuses</option>
          {orderStatuses.map((item) => <option key={item} value={item}>{item === "in_transit" ? "In transit" : item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
        </select>
        {stores.length > 0 && (
          <select className="filter-select" name="store" defaultValue={storeId ?? ""} aria-label="Filter by store">
            <option value="">All stores</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        )}
        <div className="date-range" role="group" aria-label="Order date">
          <Calendar size={13} />
          <input name="from" type="date" defaultValue={from} max={to} aria-label="Ordered from" />
          <span aria-hidden="true">–</span>
          <input name="to" type="date" defaultValue={to} min={from} aria-label="Ordered to" />
        </div>
        <label className="check-chip"><input type="checkbox" name="noShipping" value="1" defaultChecked={noShipping} />No-shipping orders</label>
        <button className="search-button filter-apply" type="submit">Apply</button>
      </Form>
      <OrdersTable orders={orders} />
      </section>
      {total > ORDERS_PAGE_SIZE && (
        <nav className="pagination" aria-label="Orders pages">
          <span>{first}–{first + orders.length - 1} of {total}</span>
          {page > 1 ? <Link className="secondary-button" href={pageHref(page - 1)}><ChevronLeft size={12} />Previous</Link> : <span className="secondary-button" aria-disabled="true"><ChevronLeft size={12} />Previous</span>}
          <span>Page {page} of {pageCount}</span>
          {page < pageCount ? <Link className="secondary-button" href={pageHref(page + 1)}>Next<ChevronRight size={12} /></Link> : <span className="secondary-button" aria-disabled="true">Next<ChevronRight size={12} /></span>}
        </nav>
      )}
    </>
  );
}
