"use client";

import React from "react";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

function shortName(name: string, max = 14): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

export function StaffLedgerBarChart({
  rows,
}: {
  rows: Array<{ staffName: string; totalRevenue: number }>;
}) {
  const { currencyCode, format: fmt } = useReportCurrency();
  const data = rows.map((r, i) => ({
    label: shortName(r.staffName),
    fullName: r.staffName,
    revenue: r.totalRevenue,
    idx: i,
  }));

  const maxRev = Math.max(...data.map((d) => d.revenue), 1);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={Math.min(420, 120 + data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
        barCategoryGap={12}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
        <XAxis
          type="number"
          tickFormatter={(v) => `${currencyCode} ${v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : Math.round(v)}`}
          stroke="#6b7280"
          fontSize={11}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={100}
          stroke="#6b7280"
          fontSize={11}
          tickLine={false}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: "rgba(124, 58, 237, 0.06)" }}
          contentStyle={{
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
          }}
          formatter={(value: number) => [fmt(value), "Ledger net"]}
          labelFormatter={(_, payload) => {
            const p = payload?.[0]?.payload as { fullName?: string } | undefined;
            return p?.fullName ?? "";
          }}
        />
        <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.revenue / maxRev > 0.85
                  ? "#6d28d9"
                  : entry.revenue / maxRev > 0.5
                    ? "#7c3aed"
                    : "#a78bfa"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
