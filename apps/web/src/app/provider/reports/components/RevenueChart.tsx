"use client";

import React from "react";
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
} from "recharts";

interface RevenueChartProps {
  data: Array<{ date: string; revenue: number; bookings: number }>;
  type?: "line" | "bar";
  /** Period format from trends API: "day" | "week" | "month" | "year" */
  period?: string;
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
  if (period === "year") return dateStr;
  if (period === "month" && /^\d{4}-\d{2}$/.test(dateStr)) {
    const [, month] = dateStr.split("-");
    return new Date(2000, parseInt(month, 10) - 1).toLocaleDateString("en-US", { month: "short" }) + " " + dateStr.slice(0, 4);
  }
  if (period === "week" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `Wk ${new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RevenueChart({ data, type = "line", period }: RevenueChartProps) {
  const chartData = data.map((item) => ({
    date: formatChartDate(item.date, period),
    revenue: item.revenue,
    bookings: item.bookings,
  }));

  const chartMargin = { top: 20, right: 30, left: 55, bottom: 60 };

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={chartMargin}>
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
            tickFormatter={(value) => `ZAR ${formatYAxisValue(value)}`}
            width={50}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number) => [`ZAR ${value.toLocaleString()}`, "Revenue"]}
          />
          <Legend />
          <Bar
            dataKey="revenue"
            fill="#FF0077"
            radius={[8, 8, 0, 0]}
            name="Revenue"
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={chartMargin}>
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
          tickFormatter={(value) => `ZAR ${formatYAxisValue(value)}`}
          width={50}
          domain={[0, "auto"]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
          formatter={(value: number) => [`ZAR ${value.toLocaleString()}`, "Revenue"]}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#FF0077"
          strokeWidth={2}
          dot={{ fill: "#FF0077", r: 4 }}
          activeDot={{ r: 6 }}
          name="Revenue"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
