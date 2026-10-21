"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const INK_MUTED = "#868fa0";
const GRID = "#eceef2";

/** The Recharts plot — loaded lazily so the charting library isn't part of every page's bundle. */
export default function TrendPlot({ data, series, colors }: { data: Record<string, string | number>[]; series: { key: string; label: string }[]; colors: readonly string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colors[i]} stopOpacity={0} />
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
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i]} strokeWidth={2.5} animationDuration={900} animationEasing="ease-out" fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
