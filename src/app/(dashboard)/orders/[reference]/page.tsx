import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDollarSign, PackageCheck } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatDate, getOrderByReference, issueLabels } from "@/lib/dashboard";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ reference: string }> }): Promise<Metadata> {
  const { reference } = await params;
  return { title: `Order ${decodeURIComponent(reference)}` };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  await requireUser();
  const { reference } = await params;
  const order = await getOrderByReference(decodeURIComponent(reference));
  if (!order) notFound();
  const itemsOrdered = order.items.reduce((total, item) => total + item.quantity, 0);
  const itemsShipped = order.items.reduce((total, item) => total + item.shippedQuantity, 0);
  const failureCost = order.contacts.reduce((total, contact) => total + contact.refundAmountCents + contact.replacementCostCents, 0);

  return (
    <>
      <Link className="detail-back" href="/orders"><ArrowLeft size={13} />Back to orders</Link>
      {order.isSampleData && <div className="sample-banner" role="status"><span><strong>Sample data</strong> — this order is illustrative, not an imported customer order.</span></div>}
      <div className="detail-summary">
        <section className="panel"><div className="detail-hero"><div><p className="eyebrow">Order timeline</p><h1>{order.shopifyOrderId}</h1><p className="detail-customer">{order.customerName} · {order.customerEmail}</p></div><StatusBadge status={order.status} /></div></section>
        <section className="panel"><div className="detail-stat-grid">
          <div><div className="detail-stat-label">Order date</div><div className="detail-stat-value">{formatDate(order.orderDate)}</div></div>
          <div><div className="detail-stat-label">Delivery due</div><div className="detail-stat-value">{formatDate(order.deliveryDueAt)}</div></div>
          <div><div className="detail-stat-label">Factory</div><div className="detail-stat-value">{order.factoryName}</div></div>
          <div><div className="detail-stat-label">Carrier</div><div className="detail-stat-value">{order.carrier}</div></div>
        </div></section>
      </div>
      <div className="detail-content-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Fulfilment events</h2><p className="panel-description">A traceable record across every source</p></div></div>
          {order.events.length ? <div className="timeline">{order.events.map((event) => <div className="timeline-event" key={event.id}><span className="timeline-point" /><div><div className="timeline-title">{event.eventType}</div>{event.details && <div className="timeline-detail">{event.details}</div>}</div><time className="timeline-date" dateTime={event.occurredAt.toISOString()}>{formatDate(event.occurredAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>)}</div> : <p className="panel-description">No fulfilment events have been recorded yet.</p>}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Order contents</h2><p className="panel-description">{itemsShipped} of {itemsOrdered} items shipped</p></div><PackageCheck size={15} color="#76857b" /></div>
          <table className="items-table"><thead><tr><th>ITEM</th><th>SKU</th><th>QTY</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.sku}</td><td className={item.shippedQuantity >= item.quantity ? "quantity-good" : "quantity-short"}>{item.shippedQuantity} / {item.quantity}</td></tr>)}</tbody></table>
          {order.contacts.length > 0 && <div className="issue-detail"><h3>Customer impact</h3>{order.contacts.map((contact) => <div className="issue-detail-row" key={contact.id}><span>{issueLabels[contact.category]}</span><strong>{contact.resolution}</strong></div>)}<div className="issue-detail-row"><span><CircleDollarSign size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />Known failure cost</span><strong>{formatCurrency(failureCost, order.currency)}</strong></div></div>}
        </section>
      </div>
    </>
  );
}
