# Regional incident response (Global Readiness Phase 13)

Per-region on-call, dependency outage playbooks, and breach notification timelines.

## Severity model

| Sev | Definition | Example |
|-----|------------|---------|
| P0 | Money movement or safety blocked | Paystack/Stripe webhook outage >15m |
| P1 | Core booking/checkout degraded | Supabase connection exhaustion |
| P2 | Non-critical feature degraded | Mapbox geocode slow |
| P3 | Cosmetic / internal tooling | Admin report delay |

## Regional paging

- **ZA (SAST):** primary on-call during 08:00–20:00 SAST; EU engineering backup overnight.
- **UK/EU (GMT/CET):** primary on-call during 09:00–18:00 local; overlap with EU infra (Frankfurt).

## Dependency playbooks

| Dependency | Degradation | Customer comms |
|------------|-------------|----------------|
| Paystack | Queue webhooks; pause new ZA card checkout banner | ZA status only |
| Stripe | Same for Stripe regions | UK/EU status only |
| Supabase EU | Read-only mode if replica available; pause writes | Global technical banner |
| Vercel fra1 | CDN static OK; API retries | Per affected market |

## Breach notification (counsel to finalize)

- **GDPR/UK-GDPR:** 72h to supervisory authority
- **POPIA (ZA):** Information Regulator without undue delay
- **Kenya NDPA / Ghana DPA:** follow local counsel templates in `docs/legal/`

## DR drills

Quarterly: restore drill per `docs/GLOBAL_READINESS_PRODUCTION_INFRA.md`.  
Blameless PIR within 5 business days of P0/P1.
