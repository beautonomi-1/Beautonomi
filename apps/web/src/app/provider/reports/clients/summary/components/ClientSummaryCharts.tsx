"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

const PALETTE = ["#db2777", "#e11d48", "#ec4899", "#f472b6", "#f9a8d4", "#fbcfe8", "#fce7f3", "#fdf2f8", "#f43f5e", "#be185d"];

type Row = { clientName: string; totalSpent: number };

export function ClientSpendBarChart({ rows, formatMoney }: { rows: Row[]; formatMoney: (n: number) => string }) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        label: r.clientName.length > 22 ? `${r.clientName.slice(0, 20)}…` : r.clientName,
        fullName: r.clientName,
        spent: Math.round(r.totalSpent * 100) / 100,
      })),
    [rows],
  );

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No clients to chart.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.min(380, 48 + data.length * 40)}>
      <BarChart layout="vertical" data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#64748b" tickFormatter={(v) => formatMoney(Number(v))} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 10 }} stroke="#64748b" interval={0} />
        <Tooltip
          formatter={(value: number) => [formatMoney(value), "Sum of booking totals"]}
          labelFormatter={(_, payload) => (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ""}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", maxWidth: 280 }}
        />
        <Bar dataKey="spent" radius={[0, 6, 6, 0]} maxBarSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
