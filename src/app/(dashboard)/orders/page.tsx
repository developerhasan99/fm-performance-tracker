import type { Metadata } from "next";
import type { FulfillmentStatus } from "@prisma/client";
import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { OrdersTable } from "@/components/orders-table";
import { ORDERS_PAGE_SIZE, getOrders } from "@/lib/dashboard";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const statuses: FulfillmentStatus[] = ["placed", "processing", "in_transit", "delivered", "delayed", "cancelled"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = statuses.find((candidate) => candidate === params.status);
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const { orders, total } = await getOrders(query, status, page);
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const pageHref = (target: number) => {
    const search = new URLSearchParams({ ...(query && { q: query }), ...(status && { status }), ...(target > 1 && { page: String(target) }) });
    return `/orders${search.size ? `?${search}` : ""}`;
  };
  const first = total ? (page - 1) * ORDERS_PAGE_SIZE + 1 : 0;

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Order management</p><h1>Orders</h1><p className="page-subtitle">Follow each order from checkout through delivery and support.</p></div></div>
      {(process.env.DASHBOARD_DEMO_MODE === "true" || orders.some((order) => order.isSampleData)) && <div className="sample-banner" role="status"><span><strong>Sample data included</strong> — seeded rows are illustrative; connect your systems for live reporting.</span></div>}
      <Form className="orders-toolbar" action="/orders">
        <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search order, customer or partner" defaultValue={query} aria-label="Search orders" /></label>
        <select className="filter-select" name="status" defaultValue={status ?? ""} aria-label="Filter by fulfilment status">
          <option value="">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item === "in_transit" ? "In transit" : item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
        </select>
        <button className="search-button" type="submit">Apply</button>
        <span className="results-count">{total} {total === 1 ? "order" : "orders"}</span>
      </Form>
      <section className="panel table-panel"><OrdersTable orders={orders} /></section>
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
