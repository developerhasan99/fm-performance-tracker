import { AlertCircle, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/dashboard";
import type { OrderSummary } from "@/lib/demo-data";

export function OrdersTable({ orders, compact = false }: { orders: OrderSummary[]; compact?: boolean }) {
  if (!orders.length) return <div className="empty-state">No orders match these filters.</div>;

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>ORDER</th><th>CUSTOMER</th><th>FACTORY</th><th>ORDERED</th><th>STATUS</th><th>SUPPORT</th>{!compact && <th aria-label="Order details" />}</tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td><Link className="order-reference" href={`/orders/${encodeURIComponent(order.shopifyOrderId)}`}>{order.shopifyOrderId}</Link></td>
              <td className="customer-cell">{order.customerName}</td>
              <td>{order.factoryName}</td>
              <td>{formatDate(order.orderDate, { day: "numeric", month: "short" })}</td>
              <td><StatusBadge status={order.status} /></td>
              <td>{order.contacts.length ? <span className="contact-indicator"><AlertCircle size={11} />{order.contacts.length} {order.contacts.length === 1 ? "issue" : "issues"}</span> : <span className="no-contact">—</span>}</td>
              {!compact && <td><Link href={`/orders/${encodeURIComponent(order.shopifyOrderId)}`} aria-label={`View order ${order.shopifyOrderId}`} className="table-link"><ArrowUpRight size={13} /></Link></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
