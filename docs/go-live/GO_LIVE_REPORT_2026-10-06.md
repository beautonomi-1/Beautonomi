# Go-live readiness report — 2026-10-06

**Verdict:** No-Go

**Mode:** quick (skip-live)

**Git HEAD:** `ab0c132`

## Automated checks

| Area | ID | Sev | Status | Evidence |
|------|-----|-----|--------|----------|
| repo | git.tracked_clean | blocker | fail | M .npmrc;  M apps/customer/app.config.js;  M apps/customer/app/(app)/(tabs)/_layout.tsx;  M apps/customer/app/(app)/(tab |
| repo | git.head_origin_main | blocker | fail | HEAD ab0c132 != origin/main 108de9b |
| repo | repo.migrations | blocker | pass | Migration hygiene OK — canonical=975, allowedDuplicates=0, allowedGaps=11 |
| repo | repo.audit_deps | blocker | pass | audit:deps pass. |
| repo | repo.audit_expo_doctor | blocker | pass | audit:expo-doctor pass. |
| repo | repo.typecheck_lint | blocker | fail | • turbo 2.9.6  ERROR  web#typecheck: command (C:\Users\NoloSehlolo\Documents\Beautonomi\apps\web) C:\Users\NoloSehlolo\A |
| repo | repo.multi_tenant | blocker | pass | audit:multi-tenant:strict pass. |
| repo | repo.cron_schedule | blocker | pass | verify:cron-schedule pass. |
| repo | repo.observability | blocker | pass | verify-observability-gates pass. |
| repo | repo.upstash_auth | warning | warn | UPSTASH_REDIS_REST_URL/TOKEN not visible to go-live runner — confirm in Vercel Production. |
| ci | ci.main | blocker | fail | CI: no run on this SHA; E2E: success; Finance drift (latest on main branch): success |
| ci | ci.e2e_warning | warning | pass | E2E (Preview + Staging) success. |
| ci | ci.finance_drift | warning | pass | Latest finance drift: success (2026-10-06T08:29:27Z). |
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
- **repo.typecheck_lint**: Fix typecheck/lint errors.
- **ci.main**: Wait for CI success on main or fix failing jobs.