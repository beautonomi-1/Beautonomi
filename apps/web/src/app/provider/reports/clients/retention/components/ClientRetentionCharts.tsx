"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import type { ClientRetentionPeriodRow } from "@/app/api/provider/reports/clients/retention/route";

export function ClientRetentionTrendChart({
  rows,
  formatPeriodLabel,
}: {
  rows: ClientRetentionPeriodRow[];
  formatPeriodLabel: (periodKey: string) => string;
}) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        label: formatPeriodLabel(r.period),
        retention: r.retentionRate,
        inPeriod: r.clients,
        returned: r.returnedFromPriorPeriod,
        prior: r.clientsInPriorPeriod,
      })),
    [rows, formatPeriodLabel],
  );

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        Need at least two time buckets to show period-over-period retention (first bucket has no prior).
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#64748b" interval={0} angle={-28} textAnchor="end" height={72} />
        <YAxis
          domain={[0, "auto"]}
          tick={{ fontSize: 11 }}
          stroke="#64748b"
          tickFormatter={(v) => `${v}%`}
          label={{ value: "Retention vs prior bucket", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
        />
        <Tooltip
          formatter={(value: number) => [`${value}%`, "Retention vs prior bucket"]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", maxWidth: 320 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="retention" name="Retention %" stroke="#e11d48" strokeWidth={2} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ClientRetentionVolumeChart({
  rows,
  formatPeriodLabel,
}: {
  rows: ClientRetentionPeriodRow[];
  formatPeriodLabel: (periodKey: string) => string;
}) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        label: formatPeriodLabel(r.period),
        inThisPeriod: r.clients,
        returnedFromPrior: r.returnedFromPriorPeriod,
        inPriorBucket: r.clientsInPriorPeriod,
      })),
    [rows, formatPeriodLabel],
  );

  if (data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#64748b" interval={0} angle={-28} textAnchor="end" height={72} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }}
          formatter={(v: number, name: string) => {
            if (name === "inPriorBucket") return [v, "Clients in prior bucket"];
            if (name === "returnedFromPrior") return [v, "Returned from prior"];
            return [v, name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="inPriorBucket" fill="#cbd5e1" name="Prior bucket size" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="returnedFromPrior" fill="#fb7185" name="Returned from prior" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
