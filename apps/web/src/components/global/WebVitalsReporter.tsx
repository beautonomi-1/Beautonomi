"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { onLCP, onCLS, onTTFB, onFCP, onINP } from "web-vitals";
import type { Metric } from "web-vitals";

function sendVital(metric: Metric, route: string) {
  const payload = {
    name: metric.name,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    rating: metric.rating,
    route,
    id: metric.id,
    navigationType: metric.navigationType,
    timestamp: Date.now(),
  };

  if (process.env.NODE_ENV === "development") {
    const color =
      metric.rating === "good"
        ? "color: #0cce6b"
        : metric.rating === "needs-improvement"
          ? "color: #ffa400"
          : "color: #ff4e42";

    console.log(
      `%c[Web Vital] ${metric.name}: ${metric.value.toFixed(metric.name === "CLS" ? 4 : 0)} (${metric.rating}) — ${route}`,
      color,
    );
    return;
  }

  const endpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT;
  if (!endpoint) return;

  if (typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(endpoint, JSON.stringify(payload));
  } else {
    fetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  }
}

export default function WebVitalsReporter() {
  const pathname = usePathname();

  useEffect(() => {
    const route = pathname || "/";
    onLCP((m) => sendVital(m, route));
    onCLS((m) => sendVital(m, route));
    onTTFB((m) => sendVital(m, route));
    onFCP((m) => sendVital(m, route));
    onINP((m) => sendVital(m, route));
  }, [pathname]);

  return null;
}
