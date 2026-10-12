import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/dashboard";
import type { OrderSummary } from "@/lib/demo-data";

export function OrdersTable({ orders }: { orders: OrderSummary[] }) {
  if (!orders.length) return <div className="empty-state">No orders match these filters.</div>;

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>ORDER</th><th>CUSTOMER</th><th>STORE</th><th>FACTORY</th><th>ORDERED</th><th>STATUS</th><th>SUPPORT</th></tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr className="row-link" key={order.id}>
              <td><Link className="order-reference" href={`/orders/${order.id}`}>{order.shopifyOrderId}</Link></td>
              <td className="customer-cell">{order.customerName}</td>
              <td>{order.store?.name ?? "—"}</td>
              <td>{order.factoryName}</td>
              <td>{formatDate(order.orderDate, { day: "numeric", month: "short" })}</td>
              <td><StatusBadge status={order.status} /></td>
              <td>{order.contacts.length ? <span className="contact-indicator"><AlertCircle size={11} />{order.contacts.length} {order.contacts.length === 1 ? "issue" : "issues"}</span> : <span className="no-contact">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
