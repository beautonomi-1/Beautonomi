# Support structure per country (Global Readiness Phase 10)

## Tiering

| Tier | Scope | Authority |
|------|-------|-----------|
| L1 | Front-line, local language, business hours | Credits ≤ configured per currency |
| L2 | Payments, bookings, safety | Refunds ≤ tier limit; escalate disputes |
| L3 | Engineering on-call | P0/P1 incidents |

## Tenant-scoped tooling

Migration **792** scopes `support_agent` ticket visibility to assigned tenant(s).  
Superadmin retains global access.

## Refund authority matrix

Wire refund/credit limits to true PSP refunds via `PaymentProvider.refund()` (Paystack + Stripe), not wallet-only admin paths.

## KPIs (control plane)

- First response / resolution SLA by tenant
- CSAT by market
- Escalation rate L1→L2→L3

## Safety

At-home incidents: dedicated escalation lane with local emergency contacts per `region_settings`.
