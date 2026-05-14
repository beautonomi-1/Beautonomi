/**
 * Route-level performance monitoring.
 *
 * Measures navigation timing, hydration duration, and API waterfall per
 * provider-portal route.  Collected metrics are batched and sent to the
 * analytics endpoint (or logged in development).
 *
 * Usage:
 *   import { routeMetrics } from "@/lib/performance/route-metrics";
 *   routeMetrics.mark("calendar", "data-loaded");
 *   routeMetrics.measure("calendar", "navigation-to-data", "nav-start", "data-loaded");
 */

type MetricEntry = {
  route: string;
  name: string;
  value: number;
  timestamp: number;
  type: "timing" | "count" | "size";
};

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUFFER_SIZE = 50;

class RouteMetrics {
  private buffer: MetricEntry[] = [];
  private marks = new Map<string, number>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.flush();
      });
    }
  }

  /** Store a named timestamp for a route. */
  mark(route: string, label: string): void {
    this.marks.set(`${route}::${label}`, performance.now());
  }

  /** Measure duration between two marks for a route. */
  measure(
    route: string,
    name: string,
    startLabel: string,
    endLabel: string,
  ): number | null {
    const start = this.marks.get(`${route}::${startLabel}`);
    const end = this.marks.get(`${route}::${endLabel}`);
    if (start == null || end == null) return null;
    const duration = end - start;
    this.record(route, name, duration, "timing");
    return duration;
  }

  /** Record a raw metric value. */
  record(
    route: string,
    name: string,
    value: number,
    type: MetricEntry["type"] = "timing",
  ): void {
    this.buffer.push({ route, name, value, timestamp: Date.now(), type });
    if (this.buffer.length >= MAX_BUFFER_SIZE) this.flush();
  }

  /** Measure API call duration (wraps a fetch promise). */
  async measureApi<T>(route: string, label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.record(route, `api:${label}`, performance.now() - start, "timing");
    }
  }

  /** Flush buffered metrics. In dev: console.table. In prod: POST to endpoint. */
  flush(): void {
    if (this.buffer.length === 0) return;
    const entries = [...this.buffer];
    this.buffer = [];

    if (process.env.NODE_ENV === "development") {
      const summary = entries.map((e) => ({
        route: e.route,
        metric: e.name,
        value: `${e.value.toFixed(1)}${e.type === "timing" ? "ms" : ""}`,
      }));
       
      console.groupCollapsed(
        `%c[perf] ${entries.length} metrics`,
        "color:#888",
      );
       
      console.table(summary);
       
      console.groupEnd();
      return;
    }

    try {
      const body = JSON.stringify({ metrics: entries });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/public/metrics", body);
      }
    } catch {
      // swallow — metrics are best-effort
    }
  }

  /** Clean up marks for a route (call on unmount). */
  clearRoute(route: string): void {
    for (const key of this.marks.keys()) {
      if (key.startsWith(`${route}::`)) this.marks.delete(key);
    }
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }
}

export const routeMetrics = new RouteMetrics();
