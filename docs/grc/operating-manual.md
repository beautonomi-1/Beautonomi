# GRC operating manual

## Purpose
The Security & Compliance hub supports ISO 27001:2022, NIST CSF 2.0, POPIA and GDPR with evidence collection, role-based access, segregation of duties, and tamper-evident audit packs.

## RACI (summary)
| Activity | GRC admin | Security lead | Risk manager | Privacy officer | IT ops | Architecture | Management | Contributor |
|----------|-----------|---------------|--------------|-----------------|--------|--------------|------------|-------------|
| ISMS scope & policies | A | R | C | C | I | C | A | I |
| Control ownership | A | R | C | I | R | R | I | R |
| Evidence collection | A | R | I | I | R | R | I | R |
| Risk treatment | C | C | A | C | I | I | A | I |
| Privacy records / DPIA | C | I | C | A | I | I | I | I |
| Access reviews | A | R | I | I | R | I | I | I |
| Audit packs | A | C | C | C | I | I | C | I |

## Rollout (staging first, then production)
1. Apply migrations `949`–`959` in order. `959` adds the workflows, guards and storage policies; nothing works correctly without it.
2. Run `pnpm grc:seed` against the environment (idempotent; loads frameworks, requirements, controls, policy templates, vendors, assets).
3. Before deploying, run the SQL harness: `pnpm --filter ./tooling/grc-sql-harness test`. It applies the GRC migrations to an in-process PGlite database (no external DB needed) and checks RLS, segregation of duties, append-only rules and module/schema parity. Every check must pass.
4. Set env vars on the web app: `GRC_GITHUB_TOKEN` (read-only fine-grained token: Administration, Actions, Dependabot alerts, Metadata) and `GRC_GITHUB_REPOSITORY` (`owner/repo`). Without them the three GitHub collectors report *skipped*.
5. Confirm the crons are deployed from `apps/web/vercel.json`: `/api/cron/grc-tick` (daily 06:30 UTC: collectors, expiries, evidence requests, reminders) and `/api/cron/grc-audit-packs` (every 10 minutes: builds queued packs).
6. Enable `grc_hub_enabled` (global, `tenant_id` null). Both crons are no-ops while it is off.
7. Give each GRC person an admin portal role first (**Settings → Admin team**; `admin_grc` = Security & Compliance only). Everyone needs MFA: every GRC permission requires an AAL2 session.
8. A **superadmin** grants `grc_admin` to the ISMS manager in **Security & Compliance → Settings → Role assignments**. Nobody can grant roles to themselves, so the ISMS manager then grants the rest (at least one `management_approver` who is not the ISMS manager).
9. Work through **Security & Compliance → Setup checklist** until every step is green, then run at least one internal audit and management review before external Stage 2.

## Segregation of duties (enforced by the database)
- Evidence cannot be reviewed by its submitter; policy versions cannot be approved by their author; the SoA cannot be published by the person who prepared it.
- Risks above appetite need a management approver other than the risk manager who proposed the acceptance. Acceptances expire and the risk reopens.
- Access-review items cannot be decided by the person being reviewed. *Modify* / *revoke* decisions raise a follow-up finding; the change itself is made in Admin team / Role assignments.
- Critical and high findings cannot be closed without retest evidence.

## Offboarding
GRC records are never deleted (append-only evidence, hash-chained activity log, no-delete triggers), so a person who has GRC history **cannot be deleted** from `users`. Offboard by revoking their GRC role assignments (with a reason) and demoting their admin role. Their name stays on historical records, which is what auditors expect.

## Troubleshooting
- *"MFA required"* on every GRC call: the session is AAL1. Sign out and back in with the authenticator.
- Audit pack stuck in *building* for more than 30 minutes: the next `grc-audit-packs` run marks it *failed* with the error; request a new one.
- A collector shows *fail*: it opened a finding (`collector:{key}:{date}`) assigned for triage; fixing the underlying issue makes the next run pass.
- Manual collector re-run: `GET /api/cron/grc-tick?collectors=admin-mfa-coverage,branch-protection` with the cron secret.

See also: [branch-protection.md](./branch-protection.md), [quarterly-calendar.md](./quarterly-calendar.md), [audit-day-runbook.md](./audit-day-runbook.md), [pentest-runbook.md](./pentest-runbook.md).
