"use client";

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { formatIDR, formatNumber } from "@/lib/format";

export const CHART_COLORS = ["#1e6fd9", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899"];

const axisProps = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

function TooltipBox({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{money ? formatIDR(p.value) : formatNumber(p.value, 0)}</span>
        </p>
      ))}
    </div>
  );
}

export function ShipmentBarChart({ data, keys }: { data: any[]; keys: { key: string; label: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} name={k.label} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === keys.length - 1 ? [3, 3, 0, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueCostChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} width={48} />
        <Tooltip content={<TooltipBox money />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="cost" name="Cost" stroke={CHART_COLORS[4]} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="profit" name="Gross Profit" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TopCustomerChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} />
        <YAxis type="category" dataKey="label" {...axisProps} width={150} />
        <Tooltip content={<TooltipBox money />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
        <Bar dataKey="value" name="Revenue" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ModePieChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipBox />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
