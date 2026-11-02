import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const number = (value: number) => value.toLocaleString("en-GB");

export function MetricCard({ title, value, footnote, icon: Icon, delta, href }: { title: string; value: string; footnote: string; icon: LucideIcon; delta?: React.ReactNode; href?: string }) {
  const body = <>
    <div className="metric-top">{title}<span className="metric-icon"><Icon size={14} strokeWidth={1.7} /></span></div>
    <div className="metric-value">{value}{delta}</div>
    <div className="metric-footnote">{footnote}</div>
  </>;
  return href ? <Link className="metric-card metric-link" href={href}>{body}</Link> : <section className="metric-card">{body}</section>;
}

/** Horizontal bars; a row with an href opens the matching orders or tickets. */
export function BarList({ rows, empty, format = number }: { rows: { label: string; count: number; href?: string }[]; empty: string; format?: (value: number) => string }) {
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
