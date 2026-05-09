"use client";

import React, { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PALETTE = [
  "#7c3aed",
  "#0d9488",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#10b981",
  "#6366f1",
  "#14b8a6",
  "#d97706",
  "#8b5cf6",
  "#64748b",
];

function labelForStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function BookingStatusPieChart({
  rows,
}: {
  rows: Array<{ status: string; count: number; percentage: number }>;
}) {
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.count > 0)
        .map((r) => ({
          name: labelForStatus(r.status),
          value: r.count,
          pct: r.percentage,
          key: r.status,
        })),
    [rows],
  );

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No distribution to chart</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={56}
          outerRadius={96}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={data[i].key} fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth={1} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as { name?: string; value?: number; pct?: number };
            const v = row?.value ?? 0;
            const pct = typeof row?.pct === "number" ? row.pct.toFixed(1) : "0";
            return (
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
                <div className="font-medium text-gray-900">{row?.name ?? ""}</div>
                <div className="tabular-nums text-gray-700">
                  {v} appointments ({pct}%)
                </div>
              </div>
            );
          }}
        />
        <Legend
          layout="horizontal"
          verticalAlign="bottom"
          formatter={(value) => <span className="text-xs text-gray-700">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
