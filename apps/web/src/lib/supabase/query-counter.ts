/**
 * F24 — Dev-only supabase-js query counter.
 *
 * Usage:
 *   import { withQueryCounter } from "@/lib/supabase/query-counter";
 *   const admin = withQueryCounter(createClient(...), { label: "getProviderDashboard" });
 *
 * When NEXT_PUBLIC_SUPABASE_QUERY_COUNTER=1 (default in NODE_ENV=development),
 * this proxy intercepts every `from(...)` and `rpc(...)` call, timing the
 * promise and emitting a grouped `console.groupCollapsed` summary. Counts
 * are attached to `globalThis.__supabaseQueryCounters` for programmatic
 * access (used by perf profiling).
 */

type AnyClient = any;
type Counter = {
  label: string;
  count: number;
  totalMs: number;
  byTable: Record<string, { count: number; totalMs: number }>;
  startedAt: number;
};

function enabled(): boolean {
  if (process.env.NEXT_PUBLIC_SUPABASE_QUERY_COUNTER === "1") return true;
  return process.env.NODE_ENV === "development";
}

export function withQueryCounter<T extends AnyClient>(client: T, opts: { label: string }): T {
  if (!enabled()) return client;

  const counter: Counter = {
    label: opts.label,
    count: 0,
    totalMs: 0,
    byTable: {},
    startedAt: Date.now(),
  };

  const globalAny = globalThis as unknown as {
    __supabaseQueryCounters?: Record<string, Counter>;
  };
  globalAny.__supabaseQueryCounters ??= {};
  globalAny.__supabaseQueryCounters[opts.label] = counter;

  const wrapBuilder = (table: string, orig: any) => {
    const started = Date.now();
    const then = orig.then?.bind(orig);
    if (typeof then !== "function") return orig;
    orig.then = (resolve: any, reject: any) =>
      then(
        (res: any) => {
          const ms = Date.now() - started;
          counter.count += 1;
          counter.totalMs += ms;
          counter.byTable[table] ??= { count: 0, totalMs: 0 };
          counter.byTable[table].count += 1;
          counter.byTable[table].totalMs += ms;
          return resolve?.(res);
        },
        reject,
      );
    return orig;
  };

  // Supabase clients are typed as a constrained generic here; we know they
  // have `.from` and `.rpc` at runtime but TS can't prove it through the
  // generic `T extends AnyClient`. The cast is strictly internal — the
  // public signature still returns the original `T`.
  const mutableClient = client as unknown as {
    from: (table: string) => unknown;
    rpc?: (name: string, args?: unknown) => unknown;
  };

  const origFrom = mutableClient.from.bind(mutableClient);
  mutableClient.from = (table: string) => {
    const builder = origFrom(table);
    return wrapBuilder(table, builder);
  };

  if (typeof mutableClient.rpc === "function") {
    const origRpc = mutableClient.rpc.bind(mutableClient);
    mutableClient.rpc = (name: string, args?: unknown) => {
      const builder = origRpc(name, args);
      return wrapBuilder(`rpc:${name}`, builder);
    };
  }

  return client;
}

export function reportQueryCounters(): Counter[] {
  const globalAny = globalThis as unknown as {
    __supabaseQueryCounters?: Record<string, Counter>;
  };
  const counters = Object.values(globalAny.__supabaseQueryCounters ?? {});
  if (!counters.length) return [];
  /* eslint-disable no-console */
  console.groupCollapsed(
    `[supabase-query-counter] ${counters.length} labels, ${counters.reduce((s, c) => s + c.count, 0)} queries`,
  );
  for (const c of counters) {
    console.log(
      `${c.label}: ${c.count} queries, ${c.totalMs.toFixed(0)}ms total`,
      c.byTable,
    );
  }
  console.groupEnd();
  /* eslint-enable no-console */
  return counters;
}
