# SLO Alert Policy

Defines alert rules for burn-rate, booking health, payment callbacks, and background lag.

## Alert Severity

- `P1`: immediate user-impacting outage, page on-call now
- `P2`: degraded core journey or fast error-budget burn, acknowledge within 10 minutes
- `P3`: non-critical degradation or trend warning

## Required Alert Rules

### 1) API Error-Budget Burn

- Metric: 5xx rate on Tier-1 routes
- Trigger:
  - `P1`: burn-rate >= 14x over 5 minutes
  - `P2`: burn-rate >= 6x over 30 minutes
- Scope:
  - `/api/public/booking-holds`
  - `/api/public/bookings`
  - `/api/provider/bookings`
  - `/api/provider/dashboard`

### 2) Booking Failure Spike

- Metric: booking create failures / attempts
- Trigger:
  - `P1`: failure rate > 5% for 10 minutes
  - `P2`: failure rate > 2% for 30 minutes

### 3) Payment/Webhook Failures

- Metric: webhook failed events and reconciliation queue growth
- Trigger:
  - `P1`: webhook failure rate > 1% over 10 minutes
  - `P2`: queue lag > 15 minutes sustained for 20 minutes

### 4) Background/Cron Lag

- Metric: oldest pending job age, cron endpoint failures
- Trigger:
  - `P2`: oldest pending > one schedule interval for two consecutive checks
  - `P3`: cron route timeout/error ratio > 1% over 30 minutes

## Correlation Requirements

- Every critical API response should expose `x-request-id`.
- Route logs should include: `request_id`, `route`, `method`, `status`, `duration_ms`.
- Incident tickets must include:
  - first failing `request_id`
  - impacted route(s)
  - affected tenant/region (if applicable)

## Escalation

1. Detect alert and acknowledge in incident channel.
2. Confirm impact using dashboards and logs.
3. If Tier-1 SLO at risk, freeze rollout and apply rollback policy.
4. Publish timeline and mitigation.
5. Add postmortem and preventive action item.
