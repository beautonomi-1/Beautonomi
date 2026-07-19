# Country rollout (Global Readiness Phase 9)

## Wave 1 — Paystack multi-currency validation

1. Provision tenant + region (data only) for target Paystack country (e.g. NG).
2. Run `GET /api/admin/regions/{tenantId}/launch-checklist` — all items must pass.
3. Enable feature flag `market.{slug}.checkout` at 5% canary.
4. Monitor: ledger drift (`finance-drift.yml`), webhook lease failures, `tenant_resolution_fallback` logs.

## Wave 2 — Stripe UK/EU

Prerequisites: legal/licensing sign-off, Stripe Connect platform entity, residency already met (Frankfurt).

1. Set `region_payment_gateways.config.settlement_model` = `connected_mor_destination`.
2. Ship **native** customer/provider apps with Stripe SDK (`minVersion` in `app_version_settings`).
3. Canary one Stripe country; enable three-way reconciliation dashboards.

## Rollback

- Disable `market.{slug}.*` flags.
- Keep tenant active for existing bookings; block new checkout via gateway config `is_active=false`.
- Document data-exit in counsel-approved runbook before decommissioning tenant.
