"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Validated categorical order (reference palette, light surface #fff): blue, orange.
export const SERIES = ["#2a78d6", "#eb6834"] as const;
const INK_MUTED = "#868fa0";
const GRID = "#eceef2";

type TrendPoint = Record<string, string | number>;

/** Two-series area trend with crosshair tooltip and an always-present legend. */
export function TrendChart({
  data,
  series,
  height = 260,
}: {
  data: TrendPoint[];
  series: { key: string; label: string }[];
  height?: number;
}) {
  const total = (k: string) => data.reduce((a, d) => a + Number(d[k] ?? 0), 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-600" aria-hidden>
        {series.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm" style={{ background: SERIES[i] }} />
            {s.label} <b className="text-ink-900 tabular-nums">{total(s.key)}</b>
          </span>
        ))}
      </div>
      <div style={{ height }} role="img" aria-label={`Trend of ${series.map((s) => s.label).join(" and ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[i]} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={SERIES[i]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={{ stroke: "#d6dae1" }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ stroke: "#b1b8c4", strokeDasharray: "3 3" }}
              contentStyle={{ borderRadius: 10, border: "1px solid #d6dae1", fontSize: 12, boxShadow: "0 8px 24px -8px rgb(16 24 40 / .2)" }}
              labelStyle={{ color: "#111418", fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: "#363e4d", padding: 0 }}
            />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={SERIES[i]}
                strokeWidth={2}
                fill={`url(#g-${s.key})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal bar list — single series, values always labeled; colour may follow the entity. */
export function BarList({
  data,
  color = "#f07400",
  empty = "No data for this period",
  format = (n: number) => String(n),
}: {
  data: { name: string; value: number; color?: string }[];
  color?: string;
  empty?: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length || data.every((d) => d.value === 0)) return <p className="py-8 text-center text-sm text-ink-400">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.name} className="group" title={`${d.name}: ${format(d.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-ink-700">{d.name}</span>
            <span className="font-semibold text-ink-900 tabular-nums">{format(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-ink-100">
            <div
              className="h-2 rounded-full transition-all duration-500 group-hover:brightness-110"
              style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: d.color ?? color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Two-part share bar (e.g. company-assigned vs walk-in) with labels — clearer than a donut for 2 values. */
export function SplitBar({ parts }: { parts: { name: string; value: number }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return <p className="py-6 text-center text-sm text-ink-400">No leads in this period</p>;
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <div key={p.name} title={`${p.name}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: SERIES[i % 2] }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        {parts.map((p, i) => (
          <span key={p.name} className="inline-flex items-center gap-2 text-ink-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i % 2] }} />
            {p.name}
            <b className="text-ink-900 tabular-nums">{p.value}</b>
            <span className="text-ink-400">({Math.round((p.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
