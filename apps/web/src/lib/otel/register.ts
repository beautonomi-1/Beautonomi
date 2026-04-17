/**
 * F26 — OpenTelemetry registration for the Node.js runtime.
 *
 * Deliberately isolated from instrumentation.ts so it can be safely imported
 * conditionally — the @opentelemetry/* packages are heavy and edge-unfriendly.
 *
 * Activation:
 *   - Set OTEL_ENABLED=1 (and OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME)
 *     in Vercel env.
 *   - instrumentation.ts dynamically imports this module only when enabled.
 *
 * What we instrument:
 *   - HTTP (auto-instrumentation)
 *   - fetch (undici)
 *   - supabase-js outgoing HTTP (covered by HTTP auto-instrumentation)
 *   - A custom wrapper `wrapSupabaseWithSpan` that opens a span around any
 *     `.from(...)` / `.rpc(...)` call and records table name + duration.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function registerOtel(): Promise<void> {
  if (process.env.OTEL_ENABLED !== "1") return;

  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import(
      "@opentelemetry/exporter-trace-otlp-http"
    );
    const { getNodeAutoInstrumentations } = await import(
      "@opentelemetry/auto-instrumentations-node"
    );

    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? "beautonomi-web",
      traceExporter: new OTLPTraceExporter({
        url:
          process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
          "http://localhost:4318/v1/traces",
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    await sdk.start();

    process.on("SIGTERM", () => {
      sdk.shutdown().catch(() => undefined);
    });

    // eslint-disable-next-line no-console
    console.info("[otel] OpenTelemetry SDK started");
  } catch (error) {
    console.warn("[otel] failed to start SDK — skipping", error);
  }
}

/** Wrap a supabase-js client so every `from(...)`/`rpc(...)` opens an OTel span. */
export function wrapSupabaseWithSpan<T extends AnyClient>(client: T, label: string): T {
  if (process.env.OTEL_ENABLED !== "1") return client;

  let tracer: ReturnType<typeof import("@opentelemetry/api").trace.getTracer> | null = null;
  try {
     
    const api = require("@opentelemetry/api");
    tracer = api.trace.getTracer("beautonomi.supabase");
  } catch {
    return client;
  }

  const wrap = (table: string, builder: any) => {
    const then = builder.then?.bind(builder);
    if (typeof then !== "function") return builder;
    builder.then = (resolve: unknown, reject: unknown) =>
      tracer!.startActiveSpan(`supabase.${table}`, (span: { setAttribute: (k: string, v: string) => void; end: () => void }) => {
        span.setAttribute("supabase.label", label);
        span.setAttribute("supabase.table", table);
        return then(
          (res: unknown) => {
            span.end();
            return typeof resolve === "function" ? (resolve as (r: unknown) => unknown)(res) : res;
          },
          (err: unknown) => {
            span.end();
            if (typeof reject === "function") return (reject as (e: unknown) => unknown)(err);
            throw err;
          },
        );
      });
    return builder;
  };

  // Supabase clients have `.from` and `.rpc` at runtime, but the generic
  // `T extends AnyClient` can't be proved by TS to expose them. The cast
  // is strictly internal; the public signature still returns `T`.
  const mutableClient = client as unknown as {
    from: (table: string) => unknown;
    rpc?: (name: string, args?: unknown) => unknown;
  };

  const origFrom = mutableClient.from.bind(mutableClient);
  mutableClient.from = (table: string) => wrap(table, origFrom(table));

  if (typeof mutableClient.rpc === "function") {
    const origRpc = mutableClient.rpc.bind(mutableClient);
    mutableClient.rpc = (name: string, args?: unknown) =>
      wrap(`rpc:${name}`, origRpc(name, args));
  }

  return client;
}
