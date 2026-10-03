# Go-live readiness report — 2026-10-03

**Verdict:** No-Go

**Mode:** quick

**Git HEAD:** `007eae7`

## Automated checks

| Area | ID | Sev | Status | Evidence |
|------|-----|-----|--------|----------|
| repo | git.tracked_clean | blocker | fail | M docs/GO_LIVE_BLOCKERS_STATUS.md;  M docs/STAGING_E2E_READINESS.md;  M docs/STAGING_VERCEL_PREVIEW_ENV.md;  M docs/go-l |
| repo | git.head_origin_main | blocker | pass | HEAD 007eae7 matches origin/main. |
| repo | repo.migrations | blocker | pass | Migration hygiene OK — canonical=974, allowedDuplicates=0, allowedGaps=11 |
| repo | repo.audit_deps | blocker | pass | audit:deps pass. |
| repo | repo.typecheck_lint | blocker | pass | web + admin-web typecheck/lint OK. |
| repo | repo.multi_tenant | blocker | pass | audit:multi-tenant:strict pass. |
| repo | repo.cron_schedule | blocker | pass | verify:cron-schedule pass. |
| repo | repo.observability | blocker | pass | verify-observability-gates pass. |
| ci | ci.main | blocker | pass | CI: success; E2E: success; Finance drift (latest on main branch): success |
| ci | ci.e2e_warning | warning | pass | E2E (Preview + Staging) success. |
| ci | ci.finance_drift | warning | pass | Latest finance drift: success (2026-10-03T14:06:24Z). |
| supabase | db.readiness | blocker | pass | readiness:supabase:check pass. |
| supabase | db.compare | warning | pass | compare:supabase gaps empty. |
| supabase | db.handle_new_user | blocker | pass | handle_new_user proconfig includes search_path=public. |
| supabase | db.za_domains | blocker | pass | za tenant active; domains: www.beautonomi.com, beautonomi.co.za, admin.beautonomi.com |
| supabase | db.paystack_no_test | blocker | pass | No sk_test in platform_secrets/region_secrets (sampled). |
| supabase | db.staging_signup | blocker | pass | Staging auth.admin.createUser + delete succeeded. |
| supabase | db.staging_seed | warning | pass | Seed stdout slug: e2e-test-provider-beautonomi |
| mobile | mobile.release_check | warning | pass | release:check:mobile pass. |
| mobile | mobile.expo_config | warning | pass | customer + provider expo config OK. |
| production | live.health | blocker | pass | GET /api/health → 200, status ok, paystack ok. |
| production | live.public_tenant | blocker | pass | home 200, config-bundle tenant_id=c43f7511-ca1b-4ccd-a0b9-27056531c65b |
| production | live.public_secrets | blocker | pass | verify-public-endpoints pass on production. |
| production | live.security_headers | blocker | pass | CSP, XCTO, frame policy present; HSTS=yes. |
| production | live.cron_auth | blocker | pass | /api/cron/recognize-period-revenue → 401 without auth. |
| production | live.tls_redirect | warning | pass | beautonomi.com → 308 Location: https://www.beautonomi.com/ |
| staging | staging.e2e_hosts | warning | skip | VERCEL_AUTOMATION_BYPASS_SECRET not set — skip staging host verify. |

## Manual checklist (not automated)

- [ ] Vercel Production: PAYSTACK_SECRET_KEY (sk_live_…), public Paystack key, CRON_SECRET, CSRF_SECRET, NEXT_PUBLIC_SENTRY_DSN
- [ ] Supabase Production: Pro plan + point-in-time recovery enabled
- [ ] Paystack dashboard: live webhook URL registered and reachable
- [ ] DNS/TLS: apex → www, admin host, provider hosts
- [ ] Rotate VERCEL_AUTOMATION_BYPASS_SECRET if ever exposed; store only in GitHub Actions
- [ ] On-call / rollback: docs/PLAYBOOKS/secret-rotation.md and deploy rollback owner

## Failed blockers — suggested fixes

- **git.tracked_clean**: Commit or stash tracked changes before go-live.