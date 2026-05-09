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
import { format, parseISO } from "date-fns";

const REASON_PALETTE = ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#0d9488", "#2563eb", "#7c3aed", "#64748b"];

export function CancellationsDailyChart({
  rows,
}: {
  rows: Array<{ date: string; count: number }>;
}) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        label: format(parseISO(r.date), "MMM d"),
        count: r.count,
      })),
    [rows],
  );

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No cancellations to chart for this range.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
        <Tooltip
          formatter={(v: number) => [`${v} cancellations`, "Count"]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <Bar dataKey="count" fill="#f87171" radius={[6, 6, 0, 0]} name="Cancellations" maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CancellationsReasonsChart({
  rows,
}: {
  rows: Array<{ reason: string; count: number; percentage: number }>;
}) {
  const data = useMemo(
    () =>
      rows.slice(0, 10).map((r) => ({
        label:
          r.reason.length > 36
            ? `${r.reason.slice(0, 34)}…`
            : r.reason,
        fullReason: r.reason,
        count: r.count,
        pct: r.percentage,
      })),
    [rows],
  );

  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">No reasons recorded.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.min(420, 56 + data.length * 36)}>
      <BarChart layout="vertical" data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tick={{ fontSize: 10 }}
          stroke="#64748b"
          interval={0}
        />
        <Tooltip
          formatter={(value: number, _n, item) => {
            const row = item?.payload as { fullReason?: string; pct?: number };
            return [`${value} (${typeof row?.pct === "number" ? row.pct.toFixed(1) : "0"}%)`, row?.fullReason ?? "Reason"];
          }}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", maxWidth: 320 }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={REASON_PALETTE[i % REASON_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
