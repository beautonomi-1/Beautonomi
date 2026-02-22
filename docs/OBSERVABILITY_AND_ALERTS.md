# Observability and Alerts

Minimal, vendor-agnostic patterns for logging and monitoring in the Beautonomi monorepo. No mandatory vendor lock-in; integrate with your preferred log aggregation and alerting (e.g. Vercel Logs, Datadog, Sentry, Slack, email).

## 1. What to log

### Web API routes (Next.js)

- **Request id:** Generate or use `x-request-id` if present; include in all log lines for the request.
- **Route and method:** e.g. `POST /api/public/bookings`, `GET /api/provider/bookings`.
- **Duration:** Time from handler start to response (ms).
- **Status:** HTTP status code.
- **Errors:** Log stack or message for 5xx and caught exceptions; avoid logging full request bodies (PII).

Example pattern (add to critical routes as needed):

```ts
const start = Date.now();
const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
try {
  // ... handler
  console.info(JSON.stringify({
    request_id: requestId,
    route: request.nextUrl?.pathname,
    method: request.method,
    status: 200,
    duration_ms: Date.now() - start,
  }));
  return response;
} catch (e) {
  console.error(JSON.stringify({
    request_id: requestId,
    route: request.nextUrl?.pathname,
    method: request.method,
    status: 500,
    duration_ms: Date.now() - start,
    error: e instanceof Error ? e.message : String(e),
  }));
  throw e;
}
```

### Webhooks

- **Event id and source:** e.g. `event_id`, `source: "paystack"`.
- **Idempotency result:** `duplicate`, `processing`, or `processed`.
- **Failure:** Log error and event id when handler fails; do not log full payload (may contain PII).

Example (already partially in place in `apps/web/src/app/api/payments/webhook/route.ts`):

- Log: `Event ${eventId} already processed, skipping` / `Invalid webhook signature` / `Error processing webhook`.

### Auth and payments

- **Auth failures:** Log route and "unauthorized" / "forbidden" (no user ids or tokens).
- **Payment failures:** Log route, idempotency key or reference if safe, and high-level reason (e.g. "refund failed") in server logs; avoid logging full card or customer data.

## 2. What to monitor

| Area | Metrics / signals | Action |
|------|-------------------|--------|
| Payments | Paystack webhook 4xx/5xx, refund failures | Alert on repeated failures; dashboard for success rate |
| Webhooks | Retries, duplicate events, processing errors | Alert on spike in failures or retries |
| Auth | 401/403 rate per route (optional) | Alert on unusual spike (possible abuse or misconfiguration) |
| API health | 5xx rate, latency p95 | Alert on threshold breach |
| Cron | /api/cron/* non-200 or timeout | Alert on failure |
| Build / deploy | EAS build failure, Next.js build failure | Notify in Slack/email |

## 3. How to alert

- **Email:** Configure in your host (e.g. Vercel notifications) or log aggregation (e.g. Sentry alerts).
- **Slack:** Use incoming webhook or Slack app; send on payment failure, webhook failure, or cron failure. Example placeholder: `SLACK_ALERT_WEBHOOK_URL` (server-only).
- **Sentry:** Already used in apps; configure alert rules for unhandled errors and high error rate.

No mandatory vendor; use placeholders (e.g. "Configure in Vercel" / "Add Slack webhook in env") until you wire a specific provider.

## 4. Suggested dashboards

- **Amplitude (or product analytics):** Funnel for booking flow, search → profile → book; track errors or drop-off steps.
- **Server logs (Vercel / host):** Filter by `route`, `status`, `duration_ms`; aggregate 5xx and webhook errors by route and hour.
- **Payments:** Count of successful charges vs failures; webhook events received vs processed vs duplicate.

## 5. Structured logging format

Prefer one JSON object per log line for easier parsing:

- `request_id`, `route`, `method`, `status`, `duration_ms`, `error` (optional).
- For webhooks: `event_id`, `source`, `result` (processed | duplicate | processing | error).

This allows log aggregators to index and alert without requiring a specific vendor.
