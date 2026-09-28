# Business Continuity and Disaster Recovery Plan

## 1. Objectives

| Service | RTO (max downtime) | RPO (max data loss) |
|---|---|---|
| Bookings and payments (web + API) | [4 hours] | [15 minutes] |
| Mobile apps (depend on API) | [4 hours] | [15 minutes] |
| Admin portal | [1 working day] | [15 minutes] |
| Payouts | [2 working days] | [0 — reconcile from provider records] |

## 2. Scenarios and responses

| Scenario | Response |
|---|---|
| Supabase region outage | Follow Supabase status; communicate to users; if prolonged, restore latest backup to a new project and update environment variables in Vercel |
| Data corruption or bad migration | Stop writes where possible; restore with point-in-time recovery (if enabled) or latest backup to a new project; verify; switch over |
| Vercel outage | Communicate; wait for provider recovery; mobile apps show maintenance messaging |
| Payment provider outage | Switch to an alternate enabled provider where configured; queue payouts |
| Compromised secrets | Rotate keys (Supabase, payment, messaging), redeploy, invalidate sessions |
| Loss of key staff | Documented runbooks; at least two people with production admin access |

## 3. Security during disruption

Security controls stay in place during recovery: MFA, least privilege, change review (emergency changes are reviewed after the fact within 2 working days).

## 4. Testing

- Restore test to a non-production Supabase project at least **twice a year**; record achieved RTO/RPO in the hub.
- Tabletop exercise of a major scenario at least **yearly**.

## 5. Communication

Owner: [name]. Templates for customers, providers and partners are kept in [location]. Status updates at least every [2] hours during SEV-1 incidents.
