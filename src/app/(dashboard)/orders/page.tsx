import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Boxes, CheckCircle2, ChevronLeft, ChevronRight, Download, Euro, PackageX, Search, X } from "lucide-react";
import { MetricCard } from "@/components/metrics";
import { OrdersTable } from "@/components/orders-table";
import { ORDERS_PAGE_SIZE, formatEuro, getOrderStats, getOrders, getStoreOptions, orderStatuses, parseOrderParams, type OrderParams } from "@/lib/dashboard";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrderParams & { page?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const stores = await getStoreOptions();
  const { query, status, fulfilment, storeId, noShipping, from, to, drill, filters, search } = parseOrderParams(params, stores);
  const { includeNoShipping } = filters;
  const [{ orders, total }, stats] = await Promise.all([getOrders({ ...filters, page }), getOrderStats(filters)]);
  const hasFilters = Boolean(query || status || fulfilment || storeId || includeNoShipping || from || to || drill.length);
  const without = (key: string) => {
    const rest = new URLSearchParams(search);
    rest.delete(key);
    return `/orders${rest.size ? `?${rest}` : ""}`;
  };
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
      {total > 0 && (
        <div className="metrics-grid">
          <MetricCard title="Orders" value={total.toLocaleString("en-GB")} footnote={`${stats.cancelled.toLocaleString("en-GB")} cancelled`} icon={Boxes} />
          <MetricCard title="Revenue" value={formatEuro(stats.revenueCents)} footnote={stats.missingRate ? `Excludes cancelled and ${stats.missingRate.toLocaleString("en-GB")} without an exchange rate` : "Excludes cancelled orders"} icon={Euro} />
          <MetricCard title="Delivered on time" value={stats.delivered ? `${Math.round((stats.deliveredOnTime / stats.delivered) * 100)}%` : "—"} footnote={`${stats.deliveredOnTime.toLocaleString("en-GB")} of ${stats.delivered.toLocaleString("en-GB")} delivered orders`} icon={CheckCircle2} />
          <MetricCard title="Cost of failure" value={formatEuro(stats.failureCostCents)} footnote={stats.revenueCents ? `${((stats.failureCostCents / stats.revenueCents) * 100).toFixed(1)}% of revenue` : "Refunds, chargebacks and reships"} icon={PackageX} />
        </div>
      )}
      <section className="panel table-panel">
      <Form className="filter-bar" action="/orders" key={search.toString()}>
        {/* Drill-down filters from the dashboard ride along when the visible filters are applied. */}
        {drill.map((filter) => <input key={filter.key} type="hidden" name={filter.key} value={filter.value} />)}
        <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search order, customer or partner" defaultValue={query} aria-label="Search orders" /></label>
        <select className="filter-select" name="status" defaultValue={status ?? ""} aria-label="Filter by fulfilment status">
          <option value="">All statuses</option>
          {orderStatuses.map((item) => <option key={item} value={item}>{item === "in_transit" ? "In transit" : item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
        </select>
        <select className="filter-select" name="fulfilment" defaultValue={fulfilment ?? ""} aria-label="Filter by fulfilled or unfulfilled">
          <option value="">Fulfillment</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="unfulfilled">Unfulfilled</option>
        </select>
        {stores.length > 0 && (
          <select className="filter-select" name="store" defaultValue={storeId ?? ""} aria-label="Filter by store">
            <option value="">All stores</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        )}
        <div className="date-range" role="group" aria-label="Order date">
          <input name="from" type="date" defaultValue={from} max={to} aria-label="Ordered from" />
          <span aria-hidden="true">–</span>
          <input name="to" type="date" defaultValue={to} min={from} aria-label="Ordered to" />
        </div>
        <label className="check-chip"><input type="checkbox" name="noShipping" value="1" defaultChecked={noShipping} />No-shipping orders</label>
        <button className="search-button filter-apply" type="submit">Apply</button>
      </Form>
      {drill.length > 0 && <div className="filter-chips" aria-label="Dashboard filters">{drill.map((filter) => <Link key={filter.key} className="filter-chip" href={without(filter.key)} aria-label={`Remove filter ${filter.label}`}>{filter.label}<X size={12} /></Link>)}</div>}
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
