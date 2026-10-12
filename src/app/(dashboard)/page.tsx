import Link from "next/link";
import { AlertCircle, ArrowDownRight, ArrowRight, Boxes, CalendarDays, Clock3, PackageCheck } from "lucide-react";
import { OrdersTable } from "@/components/orders-table";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function DeliveryChart({ data }: { data: { day: string; date: string; total: number; late: number }[] }) {
  const width = 600;
  const height = 146;
  const top = 11;
  const chartHeight = 105;
  const max = Math.max(4, ...data.map((item) => item.total));
  const barWidth = 31;
  const gap = (width - data.length * barWidth) / (data.length + 1);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily deliveries for the past seven days">
        {[0, 1, 2, 3].map((line) => <line className="chart-grid-line" key={line} x1="0" y1={top + chartHeight / 3 * line} x2={width} y2={top + chartHeight / 3 * line} />)}
        {data.map((item, index) => {
          const x = gap + index * (barWidth + gap);
          const totalHeight = item.total / max * chartHeight;
          const lateHeight = item.late / max * chartHeight;
          return (
            <g key={item.date}>
              {item.total > item.late && <rect className="chart-bar" x={x} y={top + chartHeight - totalHeight} width={barWidth} height={Math.max(2, totalHeight - lateHeight)} rx="2" />}
              {item.late > 0 && <rect className="chart-bar-late" x={x} y={top + chartHeight - lateHeight} width={barWidth} height={lateHeight} rx="2" />}
              {item.total === 0 && <rect x={x} y={top + chartHeight - 2} width={barWidth} height="2" rx="1" fill="#e3e8e4" />}
              <text className="chart-axis-label" x={x + barWidth / 2} y={height - 6} textAnchor="middle">{item.day}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MetricCard({ title, value, footnote, icon: Icon }: { title: string; value: string; footnote: string; icon: typeof Boxes }) {
  return (
    <section className="metric-card">
      <div className="metric-top">{title}<span className="metric-icon"><Icon size={14} strokeWidth={1.7} /></span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-footnote">{footnote}</div>
    </section>
  );
}

export default async function OverviewPage() {
  await requireUser();
  const snapshot = await getDashboardSnapshot();
  const maxStage = Math.max(1, ...snapshot.stages.map((stage) => stage.count));
  const maxIssue = Math.max(1, ...snapshot.issueBreakdown.map((issue) => issue.count));
  const today = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Performance overview</p><h1>Good morning</h1><p className="page-subtitle">A clear picture of every order, from checkout to doorstep.</p></div>
        <div className="date-chip"><CalendarDays size={13} />Last 30 days <span>·</span> {today}</div>
      </div>
      {snapshot.hasSampleData && <div className="sample-banner" role="status"><AlertCircle size={14} /><span><strong>Sample data included</strong> — seeded rows are illustrative; connect your systems for live reporting.</span></div>}

      <div className="metrics-grid">
        <MetricCard title="Orders" value={snapshot.totalOrders.toLocaleString("en-GB")} footnote="Placed in the last 30 days" icon={Boxes} />
        <MetricCard title="OTIF" value={`${snapshot.otifRate}%`} footnote={`${snapshot.otifNumerator} of ${snapshot.deliveredCount} delivered on time & in full`} icon={PackageCheck} />
        <MetricCard title="Dispatch SLA" value={`${snapshot.dispatchRate}%`} footnote={`${snapshot.dispatchNumerator} of ${snapshot.dispatchEligibleCount} due orders handed over on time`} icon={Clock3} />
        <MetricCard title="Orders with an issue" value={`${snapshot.issueRate}%`} footnote={`${snapshot.issueOrders} orders generated a support contact`} icon={AlertCircle} />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Delivery pace</h2><p className="panel-description">Orders reaching customers · last 7 days</p></div><div className="legend"><span className="legend-item"><span className="legend-dot" />On time</span><span className="legend-item"><span className="legend-dot late" />Late</span></div></div>
          <DeliveryChart data={snapshot.dailyDeliveries} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Order journey</h2><p className="panel-description">Progress through fulfilment · last 30 days</p></div><ArrowRight size={14} color="#9aa29e" /></div>
          <div className="stage-list">{snapshot.stages.map((stage, index) => <div className="stage-row" key={stage.label}><span className="stage-label">{stage.label}</span><div className="stage-track"><div className="stage-fill" style={{ width: `${stage.count / maxStage * 100}%`, opacity: 1 - index * 0.1 }} /></div><span className="stage-count">{stage.count}</span></div>)}</div>
          <div className="stage-summary"><ArrowDownRight size={12} />Average transit time <strong>{snapshot.avgTransitDays.toFixed(1)} days</strong></div>
        </section>
      </div>

      <div className="lower-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Partner scorecard</h2><p className="panel-description">Factory-controlled vs carrier-controlled outcomes</p></div></div>
          <div className="scorecard-row">
            {snapshot.factoryScorecards.map((factory) => <article className="scorecard" key={factory.name}><div className="scorecard-name">{factory.name}</div><div className="scorecard-value">{factory.dispatchRate === null ? "—" : `${factory.dispatchRate}%`}</div><div className="scorecard-caption">Orders dispatched within SLA</div><hr className="scorecard-rule" /><div className="scorecard-value">{factory.pickAccuracy === null ? "—" : `${factory.pickAccuracy}%`}</div><div className="scorecard-caption">Pick & pack accuracy</div></article>)}
            {snapshot.carrierScorecards.map((carrier) => <article className="scorecard" key={carrier.name}><div className="scorecard-name">{carrier.name}</div><div className="scorecard-value">{carrier.onTimeRate}%</div><div className="scorecard-caption">Deliveries on time</div><hr className="scorecard-rule" /><div className="scorecard-caption">Carrier delivery performance</div></article>)}
            {!snapshot.factoryScorecards.length && !snapshot.carrierScorecards.length && <p className="panel-description">Partner metrics will appear when order events are available.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2 className="panel-title">Customer impact</h2><p className="panel-description">Support contacts linked to fulfilment</p></div></div>
          {snapshot.issueBreakdown.length ? <>
            <div className="issue-list">{snapshot.issueBreakdown.map((issue) => <div className="issue-row" key={issue.label}><span className="issue-name">{issue.label}</span><div className="issue-track"><div className="issue-fill" style={{ width: `${issue.count / maxIssue * 100}%` }} /></div><span className="issue-count">{issue.count}</span></div>)}</div>
            <div className="cost-summary"><span>Known refunds & replacements</span><strong>{snapshot.failureCosts.map((cost) => cost.formatted).join(" · ")}</strong></div>
            <div className="cost-summary" style={{ marginTop: 8, borderTop: 0, paddingTop: 0 }}><span>Support handling time</span><strong>{(snapshot.totalHandlingMinutes / 60).toFixed(1)} hrs</strong></div>
          </> : <p className="panel-description">No linked support contacts in this period.</p>}
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading"><div><h2 className="panel-title">Recent orders</h2><p className="panel-description">Latest orders across your fulfilment network</p></div><Link className="table-link" href="/orders">All orders <ArrowRight size={12} /></Link></div>
        <OrdersTable orders={snapshot.recentOrders} />
      </section>
    </>
  );
}
