import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, Download, Euro, MessageSquareOff, ReceiptText, Scale, Search } from "lucide-react";
import { MetricCard } from "@/components/metrics";
import { NotePopover } from "@/components/note-popover";
import { isDemoMode, requireUser } from "@/lib/auth";
import { ORDERS_PAGE_SIZE as PAGE_SIZE, formatDate, formatEuro, getStoreOptions } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";
import { parseRefundParams, refundSelect, refundStats, refundStatsSelect, shopifyNumericId, type RefundParams } from "@/lib/refunds";

export const metadata: Metadata = { title: "Refunds" };
export const dynamic = "force-dynamic";

// formatCurrency rounds to whole units; a refund needs its exact amount.
const formatAmount = (cents: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);

export default async function RefundsPage({ searchParams }: { searchParams: Promise<RefundParams & { page?: string }> }) {
  if (isDemoMode()) redirect("/");
  await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const stores = await getStoreOptions();
  const { query, storeId, from, to, where, search } = parseRefundParams(params, stores);
  const prisma = getPrisma();
  const [refunds, total, statsRows] = await Promise.all([
    prisma.refund.findMany({ where, select: refundSelect, orderBy: [{ refundedAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.refund.count({ where }),
    // ponytail: aggregates in JS, like the orders stats; move to SQL if the page gets slow at this volume.
    prisma.refund.findMany({ where, select: refundStatsSelect }),
  ]);
  const stats = refundStats(statsRows);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const pageSearch = new URLSearchParams(search);
    if (target > 1) pageSearch.set("page", String(target));
    return `/orders/refunds${pageSearch.size ? `?${pageSearch}` : ""}`;
  };
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Order management</p><h1>Refunds</h1><p className="page-subtitle">What was refunded in Shopify, when, by whom and why.</p></div>
        <div className="heading-controls">
          <span className="results-count">{total.toLocaleString("en-GB")} {total === 1 ? "refund" : "refunds"}{search.size > 0 && <> · <Link className="clear-link" href="/orders/refunds">Clear filters</Link></>}</span>
          {total > 0 && <a className="secondary-button" href={`/orders/refunds/export${search.size ? `?${search}` : ""}`} download title="Download every refund matching the applied filters"><Download size={13} />Export CSV</a>}
        </div>
      </div>
      {total > 0 && (
        <div className="metrics-grid">
          <MetricCard title="Refunds" value={total.toLocaleString("en-GB")} footnote={`Across ${stats.orders.toLocaleString("en-GB")} ${stats.orders === 1 ? "order" : "orders"}`} icon={ReceiptText} />
          <MetricCard title="Amount refunded" value={formatEuro(stats.refundedCents)} footnote={stats.missingRate ? `Excludes ${stats.missingRate.toLocaleString("en-GB")} without an exchange rate` : "At order-date exchange rates"} icon={Euro} />
          <MetricCard title="Average refund" value={formatEuro(stats.averageCents)} footnote="Per refund" icon={Scale} />
          <MetricCard title="Without a note" value={stats.withoutNote.toLocaleString("en-GB")} footnote={`${Math.round((stats.withoutNote / total) * 100)}% of refunds`} icon={MessageSquareOff} />
        </div>
      )}
      <section className="panel table-panel">
      <Form className="filter-bar" action="/orders/refunds" key={search.toString()}>
        <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search order, staff member or note" defaultValue={query} aria-label="Search refunds" /></label>
        {stores.length > 0 && (
          <select className="filter-select" name="store" defaultValue={storeId ?? ""} aria-label="Filter by store">
            <option value="">All stores</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        )}
        <div className="date-range" role="group" aria-label="Refund date">
          <Calendar size={13} />
          <input name="from" type="date" defaultValue={from} max={to} aria-label="Refunded from" />
          <span aria-hidden="true">–</span>
          <input name="to" type="date" defaultValue={to} min={from} aria-label="Refunded to" />
        </div>
        <button className="search-button filter-apply" type="submit">Apply</button>
      </Form>
        {refunds.length ? (
          <div className="table-scroll">
            <table className="data-table refunds-table">
              <thead><tr><th>STORE</th><th>ORDER ID</th><th>ORDER NUMBER</th><th>AMOUNT</th><th>REFUNDED</th><th>REFUNDED BY</th><th>NOTE</th></tr></thead>
              <tbody>
                {refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td data-label="Store">{refund.order.store?.name ?? "—"}</td>
                    <td data-label="Order ID">{shopifyNumericId(refund.order.shopifyGid) ?? "—"}</td>
                    <td className="refund-order"><Link className="order-reference" href={`/orders/${refund.order.id}`}>{refund.order.shopifyOrderId}</Link></td>
                    <td className="refund-amount">{formatAmount(refund.amountCents, refund.order.currency)}</td>
                    <td data-label="Refunded">{formatDate(refund.refundedAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td data-label="Refunded by">{refund.refundedBy ?? <span className="no-contact">—</span>}</td>
                    <td className="refund-note">{refund.note ? <NotePopover note={refund.note} /> : <span className="no-contact">No note</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No refunds match these filters.</div>}
      </section>
      {total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Refund pages">
          <span>{first}–{first + refunds.length - 1} of {total}</span>
          {page > 1 ? <Link className="secondary-button" href={pageHref(page - 1)}><ChevronLeft size={12} />Previous</Link> : <span className="secondary-button" aria-disabled="true"><ChevronLeft size={12} />Previous</span>}
          <span>Page {page} of {pageCount}</span>
          {page < pageCount ? <Link className="secondary-button" href={pageHref(page + 1)}>Next<ChevronRight size={12} /></Link> : <span className="secondary-button" aria-disabled="true">Next<ChevronRight size={12} /></span>}
        </nav>
      )}
    </>
  );
}
