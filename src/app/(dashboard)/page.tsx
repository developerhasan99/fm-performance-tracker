import Link from "next/link";
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CheckCircle2, Clock3, Hourglass, Inbox, LifeBuoy, MapPinned, Route, ScanLine, Timer, TriangleAlert, Truck } from "lucide-react";
import { ColumnChart } from "@/components/column-chart";
import { StoreSwitcher } from "@/components/store-switcher";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dashboard";
import { PERIODS, getOverview, type Period } from "@/lib/overview";

export const dynamic = "force-dynamic";

const number = (value: number) => value.toLocaleString("en-GB");
const pct = (value: number | null) => (value === null ? "—" : `${value}%`);
const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const duration = (hours: number | null) => (hours === null ? "—" : hours < 48 ? `${Math.round(hours)} h` : `${(hours / 24).toFixed(1)} days`);
const days1 = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)} days`);

/** Signed change vs the previous period, coloured by whether that direction is good. Arrow + sign, never colour alone. */
function Delta({ value, unit = "%", goodWhen }: { value: number | null; unit?: string; goodWhen: "up" | "down" }) {
  if (value === null) return null;
  if (Math.round(value) === 0) return <span className="delta flat">No change</span>;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const shown = unit === "h" ? duration(Math.abs(value)) : `${Math.abs(Math.round(value))}${unit}`;
  return <span className={`delta ${up === (goodWhen === "up") ? "good" : "bad"}`}><Icon size={11} />{up ? "+" : "−"}{shown}</span>;
}

function MetricCard({ title, value, footnote, icon: Icon, delta }: { title: string; value: string; footnote: string; icon: typeof Boxes; delta?: React.ReactNode }) {
  return (
    <section className="metric-card">
      <div className="metric-top">{title}<span className="metric-icon"><Icon size={14} strokeWidth={1.7} /></span></div>
      <div className="metric-value">{value}{delta}</div>
      <div className="metric-footnote">{footnote}</div>
    </section>
  );
}

function BarList({ rows, empty }: { rows: { label: string; count: number }[]; empty: string }) {
  if (!rows.some((row) => row.count)) return <p className="panel-description">{empty}</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return <div className="issue-list metric-bars">{rows.map((row) => <div className="issue-row" key={row.label}><span className="issue-name">{row.label}</span><div className="issue-track"><div className="issue-fill" style={{ width: `${row.count / max * 100}%` }} /></div><span className="issue-count">{number(row.count)}</span></div>)}</div>;
}

function SectionHeading({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Boxes }) {
  return <div className="team-heading"><span className="team-icon"><Icon size={15} strokeWidth={1.8} /></span><div><h2>{title}</h2><p>{description}</p></div></div>;
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ days?: string; store?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const days = PERIODS.find((period) => String(period) === params.days) ?? 30;
  const overview = await getOverview({ days, storeId: params.store || undefined });
  const storeId = overview.stores.find((store) => store.id === params.store)?.id;
  const { metrics, support, changes } = overview;
  const periodHref = (period: Period) => `/?${new URLSearchParams({ days: String(period), ...(storeId && { store: storeId }) })}`;
  const scope = storeId ? overview.stores.find((store) => store.id === storeId)!.name : "All stores";
  const toChart = (rows: { date: Date; count: number }[]) => rows.map((row) => ({ date: row.date.toISOString(), count: row.count }));

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Team performance</p><h1>Overview</h1><p className="page-subtitle">How the warehouse, carriers and support team are doing · {scope}, last {days} days.</p></div>
        {/* Period and store scope every number below. */}
        <div className="heading-controls">
          <nav className="segmented" aria-label="Period">
            {PERIODS.map((period) => <Link key={period} href={periodHref(period)} className={period === days ? "active" : undefined} aria-current={period === days ? "true" : undefined}>{period} days</Link>)}
          </nav>
          {overview.stores.length > 0 && <StoreSwitcher stores={overview.stores} storeId={storeId} days={days} />}
        </div>
      </div>

      {overview.hasSampleData && <div className="sample-banner" role="status"><AlertCircle size={14} /><span><strong>Sample data included</strong> — seeded rows are illustrative; connect your systems for live reporting.</span></div>}

      {/* ---------------- Warehouse ---------------- */}
      <SectionHeading title="Warehouse" description="Getting orders out of the door on time" icon={Boxes} />
      <div className="metrics-grid">
        <MetricCard title="Dispatch SLA" value={pct(metrics.dispatchRate)} delta={<Delta value={changes.dispatchRate} unit=" pts" goodWhen="up" />} footnote={`${number(metrics.dispatchOnTime)} of ${number(metrics.dispatchDue)} due orders dispatched on time`} icon={Clock3} />
        <MetricCard title="Median time to dispatch" value={duration(metrics.medianDispatchHours)} delta={<Delta value={changes.medianDispatchHours} unit="h" goodWhen="down" />} footnote="From order to carrier hand-over" icon={Timer} />
        <MetricCard title="Orders dispatched" value={number(overview.dispatchedCount)} footnote={`Handed to carriers in the last ${days} days`} icon={Truck} />
        <MetricCard title="Overdue, not dispatched" value={number(overview.overdueCount)} footnote="Past the dispatch due date right now" icon={TriangleAlert} />
      </div>
      <div className="lower-grid even-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Orders dispatched per day</h2><p className="panel-description">Warehouse throughput · hover a day for its count</p></div></div>
          <ColumnChart data={toChart(overview.dailyDispatched)} unit={["order dispatched", "orders dispatched"]} label={`Orders dispatched per day, last ${days} days`} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Dispatch speed</h2><p className="panel-description">Order to carrier, for orders due for dispatch</p></div><Timer size={14} color="#9aa29e" /></div>
          <BarList rows={metrics.dispatchBuckets} empty="No orders due for dispatch in this period." />
        </section>
      </div>
      <section className="panel table-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Needs attention</h2><p className="panel-description">{overview.overdueCount ? `${number(overview.overdueCount)} orders past their dispatch due date and not dispatched · oldest first` : "No overdue orders. Everything due has been dispatched."}</p></div><Link className="table-link" href={`/orders${storeId ? `?store=${storeId}` : ""}`}>All orders <ArrowRight size={12} /></Link></div>
        {overview.overdue.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>ORDER</th><th>CUSTOMER</th><th>STORE</th><th>PLACED</th><th>DISPATCH DUE</th><th>OVERDUE BY</th></tr></thead>
              <tbody>{overview.overdue.map((order) => (
                <tr className="row-link" key={order.id}>
                  <td><Link className="order-reference" href={`/orders/${order.id}`}>{order.shopifyOrderId}</Link></td>
                  <td className="customer-cell">{order.customerName}</td>
                  <td>{order.store?.name ?? "—"}</td>
                  <td>{formatDate(order.orderDate, { day: "numeric", month: "short" })}</td>
                  <td>{formatDate(order.dispatchDueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="overdue">{duration(order.overdueHours)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- Carriers ---------------- */}
      <SectionHeading title="Carriers" description="From hand-over to the customer's door" icon={Truck} />
      <div className="metrics-grid">
        <MetricCard title="Shipped with tracking" value={pct(metrics.trackingRate)} footnote={`${number(metrics.shipped)} orders shipped this period`} icon={ScanLine} />
        <MetricCard title="Delivery confirmed" value={pct(metrics.deliveryCoverage)} footnote={`${number(metrics.deliveryConfirmed)} deliveries reported back`} icon={CheckCircle2} />
        <MetricCard title="Delivered on time" value={pct(metrics.onTimeDeliveryRate)} footnote={`OTIF ${pct(metrics.otifRate)} · of confirmed deliveries`} icon={Route} />
        <MetricCard title="Median transit time" value={days1(metrics.medianTransitDays)} footnote="Hand-over to confirmed delivery" icon={Hourglass} />
      </div>
      {metrics.deliveryCoverage !== null && metrics.deliveryCoverage < 50 && <p className="panel-note section-note">Carriers have confirmed only {pct(metrics.deliveryCoverage)} of deliveries, so on-time, OTIF and transit time cover few orders. Delivery dates come from Shopify, so they only appear when the store&apos;s shipping app marks orders delivered.</p>}
      <section className="panel table-panel">
        <div className="panel-heading"><div><h2 className="panel-title">By carrier</h2><p className="panel-description">Orders shipped this period</p></div></div>
        {overview.carrierRows.length ? (
          <div className="table-scroll">
            <table className="data-table numeric-table">
              <thead><tr><th>CARRIER</th><th>SHIPPED</th><th>TRACKING</th><th>DELIVERY CONFIRMED</th><th>ON TIME</th><th>MEDIAN TRANSIT</th><th>WISMO PER 100 SHIPPED</th></tr></thead>
              <tbody>{overview.carrierRows.map((row) => <tr key={row.name}><td className="customer-cell">{row.name}</td><td>{number(row.shipped)}</td><td>{pct(row.trackingRate)}</td><td>{pct(row.deliveryCoverage)}</td><td>{pct(row.onTimeDeliveryRate)}</td><td>{days1(row.medianTransitDays)}</td><td>{row.wismoPer100 ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="panel-description panel-pad">No shipped orders in this period.</p>}
      </section>

      {/* ---------------- Support ---------------- */}
      <SectionHeading title="Support" description="Customer contacts and how fast they're handled" icon={LifeBuoy} />
      {support ? <>
        <div className="metrics-grid">
          <MetricCard title="Tickets" value={number(support.total)} delta={<Delta value={support.totalChange} goodWhen="down" />} footnote={`${pct(support.linkedRate)} linked to an order · ${support.per100Orders ?? "—"} linked per 100 orders`} icon={LifeBuoy} />
          <MetricCard title="Open backlog" value={number(support.open)} footnote="Open, pending or snoozed" icon={Inbox} />
          <MetricCard title="Resolved" value={pct(support.resolvedRate)} footnote="Of this period's tickets" icon={CheckCircle2} />
          <MetricCard title="Median time to resolve" value={duration(support.medianResolutionHours)} footnote="Created to last activity, resolved tickets" icon={Timer} />
        </div>
        <div className="lower-grid even-grid">
          <section className="panel">
            <div className="panel-heading"><div><h2 className="panel-title">Tickets per day</h2><p className="panel-description">Incoming volume · hover a day for its count</p></div></div>
            <ColumnChart data={toChart(support.daily)} unit={["ticket", "tickets"]} label={`Support tickets per day, last ${days} days`} />
          </section>
          <section className="panel">
            <div className="panel-heading"><div><h2 className="panel-title">Ticket reasons</h2><p className="panel-description">{number(support.total)} tickets · last {days} days</p></div><Link className="table-link" href="/tickets">All tickets <ArrowRight size={12} /></Link></div>
            <BarList rows={support.categories} empty="No tickets in this period." />
            <dl className="fact-list">
              <div><dt>Refund requests</dt><dd>{number(support.refund)} · {share(support.refund, support.total)}</dd></div>
              <div><dt>Where is my order</dt><dd>{number(support.wismo)} · {share(support.wismo, support.total)}</dd></div>
            </dl>
          </section>
        </div>
      </> : (
        <section className="panel"><p className="panel-description"><MapPinned size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />No support account connected. <Link className="table-link" href="/support-accounts">Add a Commslayer account <ArrowRight size={12} /></Link></p></section>
      )}
    </>
  );
}
