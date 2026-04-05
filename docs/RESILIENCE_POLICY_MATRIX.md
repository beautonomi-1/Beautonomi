# Resilience Policy Matrix

Standard platform behavior for rate limits, retries, idempotency, and backpressure.

## Endpoint Classes

| Class | Examples | Rate Limit | Retry Policy | Idempotency | Backpressure |
|---|---|---|---|---|---|
| Public booking write | `/api/public/booking-holds`, `/api/public/bookings` | strict per-IP + device/fingerprint | client retries only on 5xx/timeout, max 2 | hold and booking conflict guards + DB constraints | return 429/409 quickly; avoid long waits |
| Portal token endpoints | `/api/portal/booking`, `/api/portal/availability`, `/api/portal/request-link` | per-IP minute window | no automatic server retries | token validation + single/multi-use semantics | return 429 with `Retry-After` |
| Provider read endpoints | `/api/provider/bookings`, `/api/provider/dashboard` | moderate tenant-aware limits | client retries once on network failures | N/A (read) | degrade with cached/partial data where available |
| Payment webhooks | `/api/payments/webhook` | provider-controlled (source side) | internal reconciliation queue retries | event id + source uniqueness + payment webhook idempotency keys | reject oversized payload, quickly ack, queue failures |
| Admin export | `/api/admin/export/*` | per-user per-endpoint hourly limits | no auto-retry from server | N/A | return 429 + retry-after hints |

## Header Contract for Rate-Limited APIs

- `x-ratelimit-limit` (optional): max requests in window
- `x-ratelimit-remaining` (optional): remaining in current window
- `retry-after` (for 429): seconds before retry

## Retry Defaults

- Browser/mobile API clients:
  - Retry on: timeout, network error, `503`, `504`
  - Do not retry on: `400`, `401`, `403`, `404`, `409`, `422`
  - Backoff: exponential with jitter (200 ms -> 500 ms -> 1000 ms), max 2 retries
- Webhook reconciliation workers:
  - Exponential backoff with cap and dead-letter/manual review after max attempts

## Idempotency Defaults

- All payment webhooks: dedupe by external event id + source.
- Booking creation transitions: guard duplicate state transitions and honor hold constraints.
- Any new externally-triggered write endpoint must define idempotency key strategy before release.

## Degraded Dependency Strategy

- Database latency spike:
  - reduce concurrency of expensive writes
  - return fail-fast 503 on non-critical operations
- Payment provider degradation:
  - queue reconciliation jobs
  - avoid blocking booking UX with long synchronous waits
- Notification provider outage:
  - persist notification intent
  - async replay once provider recovers
