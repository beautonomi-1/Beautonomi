# Compliance & residency (Global Readiness Phase 8)

## Data residency (as-built)

- **Supabase:** `eu-central-1` (Frankfurt)
- **Vercel functions:** `fra1` (Frankfurt)
- **EU/UK launch:** no separate EU project required for data-at-rest residency.
- **ZA/NG/KE data in EU:** document POPIA / NDPA cross-border safeguards with counsel.

## Legal gates (per country — counsel required)

- [ ] GDPR / UK-GDPR DPAs + SCCs
- [ ] VAT/OSS or local VAT registration
- [ ] Consumer refund/cooling-off rules
- [ ] At-home service licensing + insurance
- [ ] Worker classification (provider vs employee)

## Operational reliability

- [ ] Durable queue + DLQ for payment/notification workers (replace cron-at-scale)
- [ ] k6 load test at target volume (`tooling/load-test`)
- [ ] Quarterly restore drill (`docs/GLOBAL_READINESS_PRODUCTION_INFRA.md`)

## Sanctions / AML

- Extend Didit KYC with PEP/sanctions screening vendor before non-ZA launch.
