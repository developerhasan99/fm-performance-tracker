import type { Metadata } from "next";
import type { FulfillmentStatus } from "@prisma/client";
import { Search } from "lucide-react";
import { OrdersTable } from "@/components/orders-table";
import { getOrders } from "@/lib/dashboard";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const statuses: FulfillmentStatus[] = ["placed", "processing", "in_transit", "delivered", "delayed", "cancelled"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = statuses.find((candidate) => candidate === params.status);
  const orders = await getOrders(query, status);

  return (
    <>
      <div className="page-heading"><div><p className="eyebrow">Order management</p><h1>Orders</h1><p className="page-subtitle">Follow each order from checkout through delivery and support.</p></div></div>
      {(process.env.DASHBOARD_DEMO_MODE === "true" || orders.some((order) => order.isSampleData)) && <div className="sample-banner" role="status"><span><strong>Sample data included</strong> — seeded rows are illustrative; connect your systems for live reporting.</span></div>}
      <form className="orders-toolbar" action="/orders" method="get">
        <label className="search-field"><Search size={14} /><input name="q" type="search" placeholder="Search order, customer or partner" defaultValue={query} aria-label="Search orders" /></label>
        <select className="filter-select" name="status" defaultValue={status ?? ""} aria-label="Filter by fulfilment status">
          <option value="">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item === "in_transit" ? "In transit" : item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
        </select>
        <button className="search-button" type="submit">Apply</button>
        <span className="results-count">{orders.length} {orders.length === 1 ? "order" : "orders"}</span>
      </form>
      <section className="panel table-panel"><OrdersTable orders={orders} /></section>
    </>
  );
}
