# Scale SLO Gates

This document defines hard go/no-go criteria for high-scale production readiness.

## Scope

- Web API and webhooks
- Provider mobile app
- Customer mobile app
- Database and background processing (cron/queue-like jobs)

## Release Decision Rule

- `GO`: all Tier-1 gates pass for two consecutive runs (or two consecutive 24h windows in staging/canary).
- `NO-GO`: any Tier-1 gate fails.
- `CONDITIONAL`: Tier-2 fails but Tier-1 passes; requires explicit waiver owner and mitigation date.

## Tier-1 Gates (Hard)

### API Latency (staging load + canary)

- `POST /api/public/booking-holds`: p95 <= 700 ms, p99 <= 1200 ms
- `POST /api/public/bookings`: p95 <= 1200 ms, p99 <= 2000 ms
- `GET /api/provider/bookings` and calendar reads: p95 <= 800 ms, p99 <= 1500 ms
- `GET /api/provider/dashboard`: p95 <= 900 ms, p99 <= 1600 ms
- Auth routes (`/api/me/*`, login/session bootstrap): p95 <= 600 ms, p99 <= 1200 ms

### Error Budget

- Platform-wide 5xx rate: <= 0.30%
- Tier-1 route 5xx rate: <= 0.50%
- Timeout rate: <= 0.20%
- Webhook processing failure rate (`/api/payments/webhook`): <= 0.10%

### Payment Integrity

- Duplicate webhook side effects: 0
- Stuck `processing` webhook events > 10 min: 0
- Reconciliation queue growth trend: non-increasing over 60 min during steady state

### Saturation

- DB CPU (sustained 15 min): <= 70%
- DB connection utilization (sustained): <= 75%
- Any critical cron backlog older than one schedule interval: 0

### Mobile Reliability

- Crash-free sessions (provider and customer release candidates): >= 99.5%
- Core flow success:
  - provider login -> calendar -> booking detail -> settings: >= 99%
  - customer search -> book -> checkout -> booking detail: >= 99%

## Tier-2 Gates (Soft, but tracked)

- p95 cold-start API latency in canary <= 2.5 s
- Client-side screen TTI (critical screens) p95 <= 2.0 s
- Push delivery success >= 98%
- Analytics ingestion lag <= 5 min

## Test Window Requirements

- Burst test: 10-minute spike profile
- Soak test: minimum 60 minutes, preferred 180 minutes
- Canary window: minimum 24 hours after deploy before full rollout

## Ownership Matrix

- API SLO owner: Backend lead
- DB saturation owner: Data/platform lead
- Mobile crash-free owner: Mobile lead
- Webhook/payment owner: Payments lead
- Rollout gatekeeper: Release manager

## Evidence Required For Go

- Latest k6 run reports (burst + soak)
- Route-level latency and error dashboard screenshots/links
- Webhook idempotency and reconciliation status output
- Mobile crash-free and key-flow pass report
- Signed release checklist with named approvers

---

## k6 Load Test Runbook

### Workflow

The gated `workflow_dispatch` load test workflow lives at `.github/workflows/load-test.yml`.

**Trigger via GitHub UI:**
1. Go to **Actions → Load Test (k6)** → **Run workflow**
2. Fill in:
   - `base_url`: e.g. `https://staging.beautonomi.com`
   - `suite`: `booking-flow` | `auth-burst` | `provider-calendar` | `webhook-storm` | `soak-mixed` | `all`
   - Optionally override `k6_vus` and `k6_duration`
3. Click **Run workflow**

The workflow is **not** triggered on push/PR — it is intentionally manual to avoid accidental load against staging.

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `LOAD_TEST_AUTH_TOKEN` | Customer JWT for booking-flow, auth-burst, soak-mixed suites |
| `LOAD_TEST_PROVIDER_AUTH_TOKEN` | Provider JWT for provider-calendar suite |
| `LOAD_TEST_PAYSTACK_SECRET_KEY` | Paystack secret for webhook-storm suite (use test-mode key) |

Generate a test-user JWT via the Supabase dashboard or `service_role` RPC; rotate after each release cycle.

### Recommended Execution Order (Pre-Launch Gate)

1. `auth-burst` — validates auth/session resilience under spike
2. `provider-calendar` — validates provider read path under sustained pressure
3. `booking-flow` — validates the core booking transaction path (p95 <= 1.2 s)
4. `webhook-storm` — validates Paystack webhook processing resilience
5. `soak-mixed` — 60+ minutes steady-state mixed traffic

All suites must pass their built-in thresholds (see `tooling/load-test/README.md`) before marking `Tier-1 API Latency` and `Error Budget` gates as GO.

### Interpreting Results

- k6 exits non-zero when any threshold is breached — the CI step will fail and block the workflow.
- Summary JSON and HTML artifacts are uploaded under `k6-results-<run-id>` for archival.
- Compare p95/p99 latencies against Tier-1 gate values in the table above.
- A `CONDITIONAL` result (Tier-1 pass, Tier-2 fail) still requires a named waiver owner and mitigation date before cut-over.
