"use client";

import React from "react";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

interface RevenueChartProps {
  data: Array<{ date: string; revenue: number; bookings: number }>;
  type?: "line" | "bar";
  /** Period format from trends API: "day" | "week" | "month" | "year" */
  period?: string;
  /** Show scheduled visit counts on the right axis (revenue trends). */
  showBookingsSeries?: boolean;
}

function formatYAxisValue(value: number): string {
  if (value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) {
    const k = value / 1_000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function formatChartDate(dateStr: string, period?: string): string {
  if (period === "year") return dateStr.length >= 4 ? dateStr.slice(0, 4) : dateStr;
  if (period === "month" && /^\d{4}-\d{2}$/.test(dateStr)) {
    const [, month] = dateStr.split("-");
    const m = parseInt(month, 10);
    if (!Number.isFinite(m) || m < 1 || m > 12) return dateStr;
    return new Date(2000, m - 1).toLocaleDateString("en-US", { month: "short" }) + " " + dateStr.slice(0, 4);
  }
  if (period === "week" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `Wk ${new Date(dateStr + "T12:00:00.000Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  const d = new Date(dateStr + (dateStr.length <= 10 ? "T12:00:00.000Z" : ""));
  if (!Number.isFinite(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RevenueChart({
  data,
  type = "line",
  period,
  showBookingsSeries = false,
}: RevenueChartProps) {
  const { currencyCode, format: fmt } = useReportCurrency();
  const chartData = data.map((item) => ({
    date: formatChartDate(item.date, period),
    revenue: item.revenue,
    bookings: item.bookings,
  }));

  const chartMargin = { top: 16, right: showBookingsSeries ? 44 : 24, left: 8, bottom: 56 };

  const tooltipFormatter = (value: number, name: string) => {
    if (name === "Ledger net") return [fmt(value), name];
    if (name === "Scheduled visits") return [String(Math.round(value)), name];
    return [String(value), name];
  };

  if (showBookingsSeries && chartData.length > 0) {
    if (type === "bar") {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#6b7280"
              fontSize={11}
              tickLine={false}
              tick={{ fill: "#6b7280" }}
              interval="preserveStartEnd"
              angle={-32}
              textAnchor="end"
              height={56}
            />
            <YAxis
              yAxisId="rev"
              stroke="#7c3aed"
              fontSize={11}
              tickLine={false}
              tick={{ fill: "#6b7280" }}
              tickFormatter={(value) => `${currencyCode} ${formatYAxisValue(value)}`}
              width={56}
              domain={[0, "auto"]}
            />
            <YAxis
              yAxisId="book"
              orientation="right"
              stroke="#0d9488"
              fontSize={11}
              tickLine={false}
              tick={{ fill: "#6b7280" }}
              allowDecimals={false}
              width={36}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
              }}
              formatter={tooltipFormatter}
            />
            <Legend wrapperStyle={{ paddingTop: 12 }} />
            <Bar
              yAxisId="rev"
              dataKey="revenue"
              name="Ledger net"
              fill="#a78bfa"
              radius={[6, 6, 0, 0]}
              maxBarSize={48}
            />
            <Line
              yAxisId="book"
              type="monotone"
              dataKey="bookings"
              name="Scheduled visits"
              stroke="#0d9488"
              strokeWidth={2}
              dot={{ fill: "#0d9488", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            fontSize={11}
            tickLine={false}
            tick={{ fill: "#6b7280" }}
            interval="preserveStartEnd"
            angle={-32}
            textAnchor="end"
            height={56}
          />
          <YAxis
            yAxisId="rev"
            stroke="#7c3aed"
            fontSize={11}
            tickLine={false}
            tick={{ fill: "#6b7280" }}
            tickFormatter={(value) => `${currencyCode} ${formatYAxisValue(value)}`}
            width={56}
            domain={[0, "auto"]}
          />
          <YAxis
            yAxisId="book"
            orientation="right"
            stroke="#0d9488"
            fontSize={11}
            tickLine={false}
            tick={{ fill: "#6b7280" }}
            allowDecimals={false}
            width={36}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
            }}
            formatter={tooltipFormatter}
          />
          <Legend wrapperStyle={{ paddingTop: 12 }} />
          <Line
            yAxisId="rev"
            type="monotone"
            dataKey="revenue"
            name="Ledger net"
            stroke="#7c3aed"
            strokeWidth={2.5}
            dot={{ fill: "#7c3aed", r: 3 }}
            activeDot={{ r: 6 }}
          />
          <Line
            yAxisId="book"
            type="monotone"
            dataKey="bookings"
            name="Scheduled visits"
            stroke="#0d9488"
            strokeWidth={2}
            dot={{ fill: "#0d9488", r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 55, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            fontSize={12}
            tickLine={false}
            tick={{ fill: "#6b7280" }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tickLine={false}
            tick={{ fill: "#6b7280" }}
            tickFormatter={(value) => `${currencyCode} ${formatYAxisValue(value)}`}
            width={50}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number) => [fmt(value), "Ledger net"]}
          />
          <Legend />
          <Bar dataKey="revenue" fill="#7c3aed" radius={[8, 8, 0, 0]} name="Ledger net" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 55, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          stroke="#6b7280"
          fontSize={12}
          tickLine={false}
          tick={{ fill: "#6b7280" }}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#6b7280"
          fontSize={12}
          tickLine={false}
          tick={{ fill: "#6b7280" }}
          tickFormatter={(value) => `${currencyCode} ${formatYAxisValue(value)}`}
          width={50}
          domain={[0, "auto"]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
          formatter={(value: number) => [fmt(value), "Ledger net"]}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={{ fill: "#7c3aed", r: 4 }}
          activeDot={{ r: 6 }}
          name="Ledger net"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
