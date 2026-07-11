# Launch Readiness — Audit-Backed Status

**Audit:** [AUDIT-2026-07-11](audit/go-live-2026-07/EXECUTIVE_REPORT.md)  
**Last updated:** 11 July 2026  
**Source of truth:** `docs/audit/go-live-2026-07/` registers (findings, journeys, evidence)

This document replaces the prior self-declared **100 / 100** scorecard. Engineering waves 1–5 remain shipped; **go-live readiness is measured against the July 2026 audit**, not internal parity claims alone.

---

## Executive summary

| Metric | Audit (original) | Post-remediation sprint |
|--------|-----------------:|------------------------:|
| Overall readiness | **72%** | **~84%** |
| Overall confidence | Medium | Medium |
| P0 blockers | 7 | 2 (partial, staging-gated) |
| P1 issues | 19 | 21 |

**Recommendation:** **No-go** for multi-market day-one launch until staging verification closes the remaining P0s.  
**Pilot:** Controlled pilot (single tenant, ZA, web-first, limited provider cohort) is feasible **after** Wave 0–1 remediation **and** staging runtime proof — not yet confirmed.

---

## What is ready (evidence-backed)

| Area | Status | Notes |
|------|--------|-------|
| Core booking + Paystack checkout | Full (code) | Runtime webhook/payout E2E unverified |
| Admin SPA + section RBAC | Full | 422 admin API routes; edge HTML exposure noted |
| Customer mobile parity | 74% | 32/32 parity screens; 213 Jest tests pass |
| Provider mobile | 70% | 335 Jest tests pass |
| Notification queue + DLQ | Full (code) | Delivery unverified in prod |
| Finance ledger + drift tests | Full (unit) | 7-day staging observation unsigned |
| CSRF | Active (prod verified) | Dedicated `CSRF_SECRET` still recommended |
| Launch runbooks | Documented | Game-day / DR drills not executed |

Waves 1–5 artefacts (ledger allowlist, idempotency, notification durability, parity matrix, observability) remain valid — see historical table in git history of this file.

---

## Open blockers (must close before launch)

### P0 — staging-gated

| ID | Title | Remediation |
|----|-------|-------------|
| FND-P0-002 | Money-path E2E coverage critically thin | REM-006 |
| FND-P0-003 | Multi-tenant isolation unverified at runtime | REM-007 |

### P0 — resolved in 2026-07-11 sprint

| ID | Title | Status |
|----|-------|--------|
| FND-P0-001 | CSRF without secret | Mitigated / downgraded |
| FND-P0-004 | Search map fake coordinates | Fixed (REM-003) |
| FND-P0-005 | Shipping stub | Gated (REM-005) |
| FND-P0-006 | POS unpersisted clients | Fixed (REM-004) |
| FND-P0-007 | Time-clock fake success | Fixed (REM-002) |

### Selected P1 (launch-relevant)

| ID | Title |
|----|-------|
| FND-P1-008 | 7-day finance drift gate unsigned |
| FND-P1-009 | Game-day drills unverified |
| FND-P1-015 | This doc previously contradicted audit evidence |
| FND-P1-020 | Paystack live-key swap in production region settings |

Full registers: [findings-register.json](audit/go-live-2026-07/findings-register.json), [remediation-backlog.json](audit/go-live-2026-07/remediation-backlog.json).

---

## Journey coverage (56 journeys)

| Result | Count |
|--------|------:|
| Pass | 18 |
| Partial pass | 25 |
| Fail | 2 |
| Cannot verify | 11 |

Critical money and isolation journeys (checkout, payout, cross-tenant) remain **Cannot verify** without staging credentials. See [journey-register.json](audit/go-live-2026-07/journey-register.json).

---

## Safe pilot scope (after staging verification)

- Single tenant (ZA), web-first
- Core booking + Paystack online payments
- Limited provider cohort with manual ops oversight
- **Exclude:** ecommerce shipping, multi-market domains, PayCloud same-terminal native

---

## Human gates (unchanged)

Per `docs/LAUNCH_RUNBOOK.md` §G and finance drift policy:

- [ ] 7 consecutive days of zero reconciliation drift on production-shape **staging** with launch SHA deployed
- [ ] `docs/LAUNCH_E2E_DRY_RUN.md` sign-off table filled
- [ ] Release captain + finance watchdog co-sign below
- [ ] Staging Phase 3b closes 11 "Cannot verify" journeys

### Sign-off

| Role | Name | Date |
|------|------|------|
| Release captain | _ _ _ _ _ | _ _ _ _ _ |
| Finance watchdog | _ _ _ _ _ | _ _ _ _ _ |
| SRE on-call | _ _ _ _ _ | _ _ _ _ _ |

---

## References

- [Executive report](audit/go-live-2026-07/EXECUTIVE_REPORT.md)
- [Launch runbook](LAUNCH_RUNBOOK.md)
- [E2E dry-run](LAUNCH_E2E_DRY_RUN.md)
- [Backup & DR runbook](BACKUP_AND_DR_RUNBOOK.md)
- [Parity matrix](PARITY_MATRIX.md)
