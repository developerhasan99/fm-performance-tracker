"use client";

import { useEffect, useRef, useState } from "react";

type Point = { date: string; count: number };

const HEIGHT = 150;
const TOP = 10;
const LEFT = 34;
const BOTTOM = 22;
const PLOT = HEIGHT - TOP - BOTTOM;

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso));
// Rounds up to 1, 2 or 5 × a power of ten.
const niceCeil = (value: number) => {
  const power = 10 ** Math.floor(Math.log10(value));
  const n = value / power;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power;
};
const compact = (value: number) => new Intl.NumberFormat("en-GB", { notation: "compact" }).format(value);

/** One series per day as thin columns; hover or focus a day for its value. Single series, so no legend. */
export function ColumnChart({ data, unit, label }: { data: Point[]; unit: [singular: string, plural: string]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  // Draw at the container's real width so text and bars keep their pixel sizes in any panel.
  const frame = useRef<HTMLDivElement>(null);
  const [WIDTH, setWidth] = useState(640);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const max = Math.max(2, ...data.map((point) => point.count)); // at least 0 / 1 / 2, never half-ticks
  const niceMax = 2 * niceCeil(max / 2); // ticks at 0, half and max land on clean numbers
  const slot = (WIDTH - LEFT) / data.length;
  const barWidth = Math.min(24, Math.max(2, slot - 2)); // 2px surface gap between neighbours
  const y = (value: number) => TOP + PLOT - (value / niceMax) * PLOT;
  const ticks = [0, niceMax / 2, niceMax];
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(WIDTH / 90))); // a date roughly every 90px
  const point = active === null ? null : data[active];

  return (
    <div className="column-chart" ref={frame}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={label} onPointerLeave={() => setActive(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="chart-grid-line" x1={LEFT} x2={WIDTH} y1={y(tick)} y2={y(tick)} />
            <text className="chart-axis-label" x={LEFT - 6} y={y(tick) + 3} textAnchor="end">{compact(tick)}</text>
          </g>
        ))}
        {data.map((day, index) => {
          const x = LEFT + index * slot + (slot - barWidth) / 2;
          const top = y(day.count);
          const height = TOP + PLOT - top;
          const radius = Math.min(4, barWidth / 2, height);
          return (
            <g
              key={day.date}
              tabIndex={0}
              aria-label={`${dayLabel(day.date)}: ${day.count} ${day.count === 1 ? unit[0] : unit[1]}`}
              onPointerEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className={active === index ? "column active" : "column"}
            >
              {/* Hit target: the whole day slot, not just the painted bar. */}
              <rect x={LEFT + index * slot} y={TOP} width={slot} height={PLOT} fill="transparent" />
              {day.count > 0 && (
                <path
                  className="column-bar"
                  d={`M${x},${TOP + PLOT} V${top + radius} Q${x},${top} ${x + radius},${top} H${x + barWidth - radius} Q${x + barWidth},${top} ${x + barWidth},${top + radius} V${TOP + PLOT} Z`}
                />
              )}
              {index % labelEvery === 0 && <text className="chart-axis-label" x={x + barWidth / 2} y={HEIGHT - 6} textAnchor="middle">{dayLabel(day.date)}</text>}
            </g>
          );
        })}
      </svg>
      {point && active !== null && (
        <div className="chart-tooltip" style={{ left: `${((LEFT + (active + 0.5) * slot) / WIDTH) * 100}%` }} role="status">
          <span><strong>{point.count.toLocaleString("en-GB")}</strong> {point.count === 1 ? unit[0] : unit[1]}</span>
          <span>{dayLabel(point.date)}</span>
        </div>
      )}
      {/* Screen-reader table. Hidden by a block wrapper: tables ignore width/height/overflow and would stretch the page. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead><tr><th>Day</th><th>{unit[1]}</th></tr></thead>
          <tbody>{data.map((day) => <tr key={day.date}><td>{dayLabel(day.date)}</td><td>{day.count}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
