"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";

export type OccupancyDateRow = {
  date: string;
  totalAvailable: number;
  totalBooked: number;
  occupancyPercent: number | null;
};

export function OccupancyMinutesChart({ rows }: { rows: OccupancyDateRow[] }) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        label: format(parseISO(r.date), "MMM d"),
        Available: r.totalAvailable,
        Booked: r.totalBooked,
      })),
    [rows],
  );

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No days in range.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
        <YAxis tick={{ fontSize: 11 }} stroke="#64748b" label={{ value: "Minutes", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }} />
        <Tooltip
          formatter={(value: number, name: string) => [`${value} min`, name]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Available" fill="#e2e8f0" radius={[4, 4, 0, 0]} maxBarSize={48} />
        <Bar dataKey="Booked" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OccupancyPercentChart({ rows }: { rows: OccupancyDateRow[] }) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        label: format(parseISO(r.date), "MMM d"),
        pct: r.occupancyPercent === null ? undefined : r.occupancyPercent,
      })),
    [rows],
  );

  const hasAny = data.some((d) => d.pct !== undefined);
  if (!hasAny) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        Occupancy % is not shown when there is no scheduled availability in this range.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
        <YAxis
          domain={[0, "auto"]}
          tick={{ fontSize: 11 }}
          stroke="#64748b"
          tickFormatter={(v) => `${v}%`}
          label={{ value: "Occupancy", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
        />
        <Tooltip
          formatter={(value: number | undefined) => [
            value === undefined ? "—" : `${value}%`,
            "Occupancy",
          ]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="pct" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} name="Occupancy %" />
      </LineChart>
    </ResponsiveContainer>
  );
}
