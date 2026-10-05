# Go-live readiness report — 2026-10-05

**Verdict:** No-Go

**Mode:** quick (skip-live)

**Git HEAD:** `d2bcfc6`

## Automated checks

| Area | ID | Sev | Status | Evidence |
|------|-----|-----|--------|----------|
| repo | git.tracked_clean | blocker | fail | M apps/customer/app/(app)/book-checkout.tsx;  M apps/customer/app/(app)/book/index.tsx;  M apps/web/src/app/api/admin/se |
| repo | git.head_origin_main | blocker | fail | HEAD d2bcfc6 != origin/main bd44aa1 |
| repo | repo.migrations | blocker | pass | Migration hygiene OK — canonical=975, allowedDuplicates=0, allowedGaps=11 |
| repo | repo.audit_deps | blocker | pass | audit:deps pass. |
| repo | repo.typecheck_lint | blocker | pass | web + admin-web typecheck/lint OK. |
| repo | repo.multi_tenant | blocker | pass | audit:multi-tenant:strict pass. |
| repo | repo.cron_schedule | blocker | pass | verify:cron-schedule pass. |
| repo | repo.observability | blocker | pass | verify-observability-gates pass. |
| ci | ci.main | blocker | fail | CI: no run on this SHA; E2E: success; Finance drift (latest on main branch): success |
| ci | ci.e2e_warning | warning | pass | E2E (Preview + Staging) success. |
| ci | ci.finance_drift | warning | pass | Latest finance drift: success (2026-10-05T08:12:07Z). |
| supabase | db.readiness | blocker | pass | readiness:supabase:check pass. |
| supabase | db.compare | warning | pass | compare:supabase gaps empty. |
| supabase | db.handle_new_user | blocker | pass | handle_new_user proconfig includes search_path=public. |
| supabase | db.za_domains | blocker | pass | za tenant active; domains: www.beautonomi.com, beautonomi.co.za, admin.beautonomi.com |
| supabase | db.paystack_no_test | blocker | pass | No sk_test in platform_secrets/region_secrets (sampled). |
| supabase | db.staging_signup | blocker | pass | Staging auth.admin.createUser + delete succeeded. |
| supabase | db.staging_seed | warning | pass | Seed stdout slug: e2e-test-provider-beautonomi |
| mobile | mobile.release_check | warning | pass | release:check:mobile pass. |
| mobile | mobile.expo_config | warning | pass | customer + provider expo config OK. |

## Manual checklist (not automated)

- [ ] Vercel Production: PAYSTACK_SECRET_KEY (sk_live_…), public Paystack key, CRON_SECRET, CSRF_SECRET, NEXT_PUBLIC_SENTRY_DSN
- [ ] Supabase Production: Pro plan + point-in-time recovery enabled
- [ ] Paystack dashboard: live webhook URL registered and reachable
- [ ] DNS/TLS: apex → www, admin host, provider hosts
- [ ] Rotate VERCEL_AUTOMATION_BYPASS_SECRET if ever exposed; store only in GitHub Actions
- [ ] On-call / rollback: docs/PLAYBOOKS/secret-rotation.md and deploy rollback owner

## Failed blockers — suggested fixes

- **git.tracked_clean**: Commit or stash tracked changes before go-live.
- **git.head_origin_main**: Push and merge to main, then re-run from updated main.
- **ci.main**: Wait for CI success on main or fix failing jobs.