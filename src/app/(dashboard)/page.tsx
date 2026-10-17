import Link from "next/link";
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CheckCircle2, Clock3, Euro, Hourglass, Inbox, LifeBuoy, MapPinned, PackageX, Route, ScanLine, Target, Timer, TriangleAlert, Truck } from "lucide-react";
import { ColumnChart } from "@/components/column-chart";
import { StoreSwitcher } from "@/components/store-switcher";
import { requireUser } from "@/lib/auth";
import { formatDate, formatEuro } from "@/lib/dashboard";
import { COST_TYPES, type CostType } from "@/lib/failure";
import { getFailureReport, type FailureReport } from "@/lib/failure-report";
import { PERIODS, changePercent, getOverview, type Period } from "@/lib/overview";

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

function MetricCard({ title, value, footnote, icon: Icon, delta, href }: { title: string; value: string; footnote: string; icon: typeof Boxes; delta?: React.ReactNode; href?: string }) {
  const body = <>
    <div className="metric-top">{title}<span className="metric-icon"><Icon size={14} strokeWidth={1.7} /></span></div>
    <div className="metric-value">{value}{delta}</div>
    <div className="metric-footnote">{footnote}</div>
  </>;
  return href ? <Link className="metric-card metric-link" href={href}>{body}</Link> : <section className="metric-card">{body}</section>;
}

/** Horizontal bars; a row with an href opens the matching orders or tickets. */
function BarList({ rows, empty, format = number }: { rows: { label: string; count: number; href?: string }[]; empty: string; format?: (value: number) => string }) {
  if (!rows.some((row) => row.count)) return <p className="panel-description">{empty}</p>;
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="issue-list metric-bars">
      {rows.map((row) => {
        const content = <><span className="issue-name">{row.label}</span><div className="issue-track"><div className="issue-fill" style={{ width: `${row.count / max * 100}%` }} /></div><span className="issue-count">{format(row.count)}</span></>;
        return row.href && row.count ? <Link className="issue-row bar-link" key={row.label} href={row.href}>{content}</Link> : <div className="issue-row" key={row.label}>{content}</div>;
      })}
    </div>
  );
}

function SectionHeading({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Boxes }) {
  return <div className="team-heading"><span className="team-icon"><Icon size={15} strokeWidth={1.8} /></span><div><h2>{title}</h2><p>{description}</p></div></div>;
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ days?: string; store?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const days = PERIODS.find((period) => String(period) === params.days) ?? 30;
  const [overview, failure] = await Promise.all([getOverview({ days, storeId: params.store || undefined }), getFailureReport({ days, storeId: params.store || undefined })]);
  const storeId = overview.stores.find((store) => store.id === params.store)?.id;
  const { metrics, support, changes } = overview;
  const periodHref = (period: Period) => `/?${new URLSearchParams({ days: String(period), ...(storeId && { store: storeId }) })}`;
  const scope = storeId ? overview.stores.find((store) => store.id === storeId)!.name : "All stores";
  const toChart = (rows: { date: Date; count: number }[]) => rows.map((row) => ({ date: row.date.toISOString(), count: row.count }));
  // Drill-down links: the same store, from the first day of the period.
  const fromDay = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ordersHref = (extra: Record<string, string>) => `/orders?${new URLSearchParams({ ...(storeId && { store: storeId }), ...extra })}`;
  const notDispatchedHref = ordersHref({ stage: "not_dispatched" });

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

      {failure && <FailureSection report={failure} storeId={storeId} days={days} />}

      {/* ---------------- Warehouse ---------------- */}
      <SectionHeading title="Warehouse" description="Getting orders out of the door on time" icon={Boxes} />
      <div className="metrics-grid">
        <MetricCard title="Dispatch SLA" value={pct(metrics.dispatchRate)} delta={<Delta value={changes.dispatchRate} unit=" pts" goodWhen="up" />} footnote={`${number(metrics.dispatchOnTime)} of ${number(metrics.dispatchDue)} due orders dispatched on time`} icon={Clock3} />
        <MetricCard title="Median time to dispatch" value={duration(metrics.medianDispatchHours)} delta={<Delta value={changes.medianDispatchHours} unit="h" goodWhen="down" />} footnote="From order to carrier hand-over" icon={Timer} />
        <MetricCard title="Orders dispatched" value={number(overview.dispatchedCount)} footnote={`Handed to carriers in the last ${days} days`} icon={Truck} />
        <MetricCard title="Overdue, not dispatched" value={number(overview.overdueCount)} footnote="Past the dispatch due date right now" icon={TriangleAlert} href={notDispatchedHref} />
      </div>
      <div className="lower-grid even-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Orders dispatched per day</h2><p className="panel-description">Warehouse throughput · hover a day for its count</p></div></div>
          <ColumnChart data={toChart(overview.dailyDispatched)} unit={["order dispatched", "orders dispatched"]} label={`Orders dispatched per day, last ${days} days`} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Dispatch speed</h2><p className="panel-description">Order to carrier, for orders due for dispatch</p></div><Timer size={14} color="#9aa29e" /></div>
          <BarList rows={metrics.dispatchBuckets.map((row) => (row.label === "Overdue, not dispatched" ? { ...row, href: ordersHref({ stage: "not_dispatched", from: fromDay }) } : row))} empty="No orders due for dispatch in this period." />
        </section>
      </div>
      <section className="panel table-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Needs attention</h2><p className="panel-description">{overview.overdueCount ? `${number(overview.overdueCount)} orders past their dispatch due date and not dispatched · oldest first` : "No overdue orders. Everything due has been dispatched."}</p></div><Link className="table-link" href={notDispatchedHref}>All {number(overview.overdueCount)} overdue orders <ArrowRight size={12} /></Link></div>
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
              <tbody>{overview.carrierRows.map((row) => <tr key={row.name}><td className="customer-cell"><Link className="cell-link" href={ordersHref({ carrier: row.name, from: fromDay })}>{row.name}</Link></td><td>{number(row.shipped)}</td><td>{pct(row.trackingRate)}</td><td>{pct(row.deliveryCoverage)}</td><td>{pct(row.onTimeDeliveryRate)}</td><td>{days1(row.medianTransitDays)}</td><td>{row.wismoPer100 ?? "—"}</td></tr>)}</tbody>
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
            <BarList rows={support.categories.map((row) => ({ ...row, href: `/tickets?${new URLSearchParams({ category: row.key, ...(storeId && { store: storeId }) })}` }))} empty="No tickets in this period." />
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

const ratePct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);

type Breakdown = { key: string; label: string; orders: number; failed: number; failRate: number | null; total: number; revenue?: number };

/** Orders, how many had a failure, the rate and the cost, for one dimension. Each number opens those orders. */
function BreakdownTable({ title, description, rows, href, extra }: {
  title: string; description: string; rows: Breakdown[]; href: (row: Breakdown, failedOnly: boolean) => string;
  extra?: { heading: string; value: (row: Breakdown) => string };
}) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading"><div><h2 className="panel-title">{title}</h2><p className="panel-description">{description}</p></div></div>
      {rows.length ? (
        <div className="table-scroll">
          <table className="data-table numeric-table">
            <thead><tr><th>{title.replace(/^By /, "").toUpperCase()}</th><th>ORDERS</th><th>WITH A FAILURE</th><th>RATE</th><th>COST</th>{extra && <th>{extra.heading}</th>}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.key}>
                <td className="customer-cell" title={row.key !== row.label ? row.key : undefined}>{row.label}</td>
                <td><Link className="cell-link" href={href(row, false)}>{number(row.orders)}</Link></td>
                <td><Link className="cell-link" href={href(row, true)}>{number(row.failed)}</Link></td>
                <td>{ratePct(row.failRate)}</td>
                <td><Link className="cell-link strong" href={href(row, true)}>{formatEuro(row.total)}</Link></td>
                {extra && <td>{extra.value(row)}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="panel-description panel-pad">No orders in this period.</p>}
    </section>
  );
}

const COST_KEYS = Object.keys(COST_TYPES) as CostType[];
const costValue = (row: Record<CostType | "total", number>, key: CostType) => row[key];

function FailureSection({ report, storeId, days }: { report: FailureReport; storeId?: string; days: number }) {
  const orders = (extra: Record<string, string>) => `/orders?${new URLSearchParams({ from: report.from, ...(storeId && { store: storeId }), ...extra })}`;
  const { total } = report;
  const top = report.causes[0];
  const change = report.previousTotal ? changePercent(total.total, report.previousTotal) : null;
  const shareOf = (value: number) => (total.total ? `${Math.round((value / total.total) * 100)}%` : "—");

  return (
    <>
      <SectionHeading title="Cost of failure" description={`What went wrong after the sale, what it cost and why · orders placed in the last ${days} days, in EUR`} icon={Euro} />
      {report.missingMoney > 0 && <p className="panel-note section-note">{number(report.missingMoney)} of {number(report.orders)} orders haven&apos;t been re-synced since cost tracking was added, so their refunds and order value count as €0 until the next sync finishes.</p>}
      <div className="metrics-grid">
        <MetricCard title="Cost of failure" value={formatEuro(total.total)} delta={<Delta value={change} goodWhen="down" />} footnote={report.missingMoney ? "Share of sales shows once every order is re-synced" : `${ratePct(report.revenue ? total.total / report.revenue : null)} of ${formatEuro(report.revenue)} sales`} icon={Euro} href={orders({ cost: "any" })} />
        <MetricCard title="Orders with a failure" value={number(report.failed)} footnote={`${ratePct(report.orders ? report.failed / report.orders : null)} of ${number(report.orders)} orders`} icon={PackageX} href={orders({ cost: "any" })} />
        <MetricCard title="Cost per failed order" value={report.failed ? formatEuro(total.total / report.failed) : "—"} footnote="Refunds, reships, chargebacks, support and cancellations" icon={Target} />
        <MetricCard title="Biggest cause" value={top ? formatEuro(top.total) : "—"} footnote={top ? `${top.label} · ${shareOf(top.total)} of the cost, ${number(top.failed)} orders` : "No failures in this period"} icon={TriangleAlert} href={top ? orders({ cause: top.cause }) : undefined} />
      </div>
      <div className="lower-grid even-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Where the money goes</h2><p className="panel-description">Cost of failure by type · click a bar for its orders</p></div></div>
          <BarList rows={COST_KEYS.map((key) => ({ label: COST_TYPES[key].label, count: costValue(total, key), href: orders({ cost: key }) }))} format={formatEuro} empty="No failure costs in this period." />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Cost of failure per day</h2><p className="panel-description">By order date · hover a day for its cost</p></div></div>
          <ColumnChart data={report.daily} unit={["euro", "euros"]} label={`Cost of failure per day in euros, last ${days} days`} />
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Root causes</h2><p className="panel-description">Each failed order is filed under one cause: its support ticket first, then Shopify&apos;s cancellation reason, chargebacks and delivery data. Click any amount for those orders.</p></div></div>
        {report.causes.length ? (
          <div className="table-scroll">
            <table className="data-table numeric-table">
              <thead><tr><th>CAUSE</th><th>ORDERS</th>{COST_KEYS.map((key) => <th key={key}>{COST_TYPES[key].label.replace(/ \(.*\)/, "").toUpperCase()}</th>)}<th>TOTAL</th><th>SHARE</th></tr></thead>
              <tbody>
                {report.causes.map((row) => (
                  <tr key={row.cause}>
                    <td className="customer-cell"><Link className="cell-link" href={orders({ cause: row.cause })}>{row.label}</Link></td>
                    <td><Link className="cell-link" href={orders({ cause: row.cause })}>{number(row.failed)}</Link></td>
                    {COST_KEYS.map((key) => <td key={key}>{costValue(row, key) ? <Link className="cell-link" href={orders({ cause: row.cause, cost: key })}>{formatEuro(costValue(row, key))}</Link> : <span className="no-contact">—</span>}</td>)}
                    <td><Link className="cell-link strong" href={orders({ cause: row.cause })}>{formatEuro(row.total)}</Link></td>
                    <td>{shareOf(row.total)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total</td>
                  <td>{number(report.failed)}</td>
                  {COST_KEYS.map((key) => <td key={key}>{formatEuro(costValue(total, key))}</td>)}
                  <td>{formatEuro(total.total)}</td>
                  <td>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <p className="panel-description panel-pad">No failures in this period.</p>}
      </section>

      <div className="lower-grid even-grid">
        {!storeId && <BreakdownTable title="By store" description="Cost of failure and how often it happens" rows={report.stores.map((row) => ({ ...row, key: row.id }))} href={(row, failedOnly) => `/orders?${new URLSearchParams({ from: report.from, store: row.key, ...(failedOnly && { cost: "any" }) })}`} extra={report.missingMoney ? undefined : { heading: "OF SALES", value: (row) => ratePct(row.revenue ? row.total / row.revenue : null) }} />}
        <BreakdownTable title="By carrier" description="Top 10 by cost · all causes, not only delivery" rows={report.carriers} href={(row, failedOnly) => orders({ carrier: row.key, ...(failedOnly && { cost: "any" }) })} />
        <BreakdownTable title="By product" description="Top 10 by cost · an order counts for every product in it" rows={report.products} href={(row, failedOnly) => orders({ sku: row.key, ...(failedOnly && { cost: "any" }) })} />
        <BreakdownTable title="By country" description="Top 10 by cost · shipping country" rows={report.countries} href={(row, failedOnly) => orders({ country: row.key, ...(failedOnly && { cost: "any" }) })} />
      </div>
    </>
  );
}

