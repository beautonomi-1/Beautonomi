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
