import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function MetricCard({ title, value, footnote, icon: Icon, delta, href }: { title: string; value: string; footnote: string; icon: LucideIcon; delta?: React.ReactNode; href?: string }) {
  const body = <>
    <div className="metric-top">{title}<span className="metric-icon"><Icon size={14} strokeWidth={1.7} /></span></div>
    <div className="metric-value">{value}{delta}</div>
    <div className="metric-footnote">{footnote}</div>
  </>;
  return href ? <Link className="metric-card metric-link" href={href}>{body}</Link> : <section className="metric-card">{body}</section>;
}
