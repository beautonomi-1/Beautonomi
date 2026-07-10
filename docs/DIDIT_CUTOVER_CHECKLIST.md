# Didit Cutover Checklist — Go-Live Readiness

## Status Legend
- [ ] Not done
- [x] Completed by code change
- [>] Manual step required

---

## Phase 1 — Prerequisites (Manual)

| # | Check | Who |
|---|-------|-----|
| [>] | Create Didit account at https://console.didit.me | Ops |
| [>] | Create a Workflow: "Basic KYC" (ID + liveness/face match) | Ops |
| [>] | Note DIDIT_WORKFLOW_ID from the workflow | Ops |
| [>] | Create API key → note DIDIT_API_KEY | Ops |
| [>] | Configure webhook destination in Didit console → `https://beautonomi.com/api/webhooks/didit` | Ops |
| [>] | Note webhook secret_shared_key → DIDIT_WEBHOOK_SECRET | Ops |
| [>] | (Optional) Set callback URL in Didit console → `https://beautonomi.com` | Ops |

---

## Phase 2 — Staging Deployment

| # | Check | Status |
|---|-------|--------|
| [>] | Set env vars in staging: DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_WEBHOOK_SECRET | Ops |
| [>] | Set DIDIT_BASE_URL=https://verification.didit.me (default, can omit) | Ops |
| [>] | Set DIDIT_ENVIRONMENT=sandbox for staging, production for prod | Ops |
| [>] | Run database migrations 739–744 on staging Supabase | Dev/Ops |
| [>] | Deploy web app to staging | CI/CD |
| [>] | Verify `/api/admin/control-plane/integrations/didit` returns `env_complete: true` | Dev |

---

## Phase 3 — Feature Flag Activation (Staging)

| # | Check | Status |
|---|-------|--------|
| [>] | In Superadmin → Didit page: enable `verification.didit.enabled` | Admin |
| [>] | In Superadmin → Didit page: enable `verification.manual.enabled` | Admin |
| [>] | In Superadmin → Didit page: test webhook → verify "✓ Test webhook received" | Admin |
| [>] | Optional: enable `provider_verification` to require providers to verify | Admin |
| [>] | Optional: enable `verification.didit.required_for_payouts` | Admin |

---

## Phase 4 — Staging Validation

| # | Check | Status |
|---|-------|--------|
| [>] | Customer web: navigate to Account Settings → Verify Identity → confirm Didit UI shown | QA |
| [>] | Customer web: complete full Didit KYC flow end-to-end (use sandbox) | QA |
| [>] | Provider web: navigate to Onboarding → Verify Identity → confirm Didit UI shown | QA |
| [>] | Provider web: complete full Didit KYC flow end-to-end (use sandbox) | QA |
| [>] | Customer mobile (Expo dev build): navigate to identity verification → verify launches | QA |
| [>] | Provider mobile (Expo dev build): navigate to onboarding verify step → verify launches | QA |
| [>] | Webhook: trigger a test event from Didit console → confirm session status updates | QA |
| [>] | Superadmin → Verification Sessions page: confirm session appears with correct status | QA |
| [>] | Superadmin → Verification Sessions: use "Reprocess" on a session → confirm status re-fetched | QA |
| [>] | Superadmin → Verification Sessions: use "Approve" override → confirm legacy status synced | QA |
| [>] | Reconciliation cron: POST /api/cron/identity-verification-reconcile with CRON_SECRET header | Dev |

---

## Phase 5 — Mobile EAS Build

| # | Check | Status |
|---|-------|--------|
| [>] | Run `eas build --profile preview` for apps/provider | Dev |
| [>] | Run `eas build --profile preview` for apps/customer | Dev |
| [>] | Install preview build on test device | QA |
| [>] | Verify Didit flow launches (via expo-web-browser in-app tab) | QA |
| [>] | Verify legal details form appears and validates | QA |
| [>] | Verify status polling after SDK return (status updates via webhook) | QA |

---

## Phase 6 — Production Go-Live

| # | Check | Status |
|---|-------|--------|
| [>] | Run migrations 739–744 on production Supabase | Ops |
| [>] | Set DIDIT_* env vars in Vercel production | Ops |
| [>] | Deploy web app to production | CI/CD |
| [>] | Verify `env_complete: true` in production admin | Admin |
| [>] | Enable `verification.didit.enabled` flag in production | Admin |
| [>] | Send test webhook from production Didit console | Admin |
| [>] | Confirm webhook received and processed | Admin |
| [>] | Smoke test: one real KYC flow end-to-end in production | QA |

---

## Phase 7 — Legacy Data Handling

| # | Check | Status |
|---|-------|--------|
| [x] | Legacy `user_verifications` rows: marked `is_legacy_sumsub=true` in migration 742 | Done |
| [x] | Legacy Sumsub routes remain functional for existing sessions (soft-deprecated) | Done |
| [>] | Supabase: mark all existing Sumsub sessions as legacy in `provider_verification_status` | Ops SQL |
| [>] | Set `SUMSUB_EMBED_REFRESH_SECRET=` in deprecated env comment (stop generating new tokens) | Ops |

### Mark legacy Sumsub records SQL:
```sql
UPDATE provider_verification_status
SET verification_provider = 'sumsub', is_legacy_sumsub = true
WHERE didit_session_id IS NULL AND verification_provider IS NULL;
```

---

## Phase 7b — Webhook 401 recovery (stuck sessions)

Didit **does not retry** webhook deliveries that return `401`. If the Business Console Deliveries tab shows `401` for `status.updated`, Beautonomi never updates session status — provider UI stays unverified and **Last webhook received** stays **Never**.

| # | Check | Who |
|---|-------|-----|
| [>] | In Didit Console → API & Webhooks → destination → copy `secret_shared_key` into Vercel `DIDIT_WEBHOOK_SECRET` (not `DIDIT_API_KEY`) | Ops |
| [>] | Redeploy web app after updating secret | CI/CD |
| [>] | Cloudflare/WAF: allow Didit webhook IP `18.203.201.92`; do not strip `X-Signature*` / `X-Timestamp` headers | Ops |
| [>] | Webhook URL must be `https://www.beautonomi.com/api/webhooks/didit` (www, HTTPS, no redirect) | Ops |
| [>] | Control Plane → Didit → **Send test webhook** → expect HTTP 200 | Admin |
| [>] | Didit Console → Deliveries → new events show 200 | Ops |
| [>] | For sessions already **Approved** in Didit but still pending in Beautonomi: Superadmin → **Identity & Trust → Verification Sessions** → **Reprocess** on each stuck row (or run reconciliation cron) | Admin |

Ops note: auto-Approved Didit sessions do **not** appear in legacy **Identity Verifications** (`/admin/verifications`). Use **Verification Sessions** (`/admin/identity-trust/sessions`) for Didit ops.

---

## Phase 8 — Monitoring & Rollback

| # | Check | Status |
|---|-------|--------|
| [>] | Set up alert: `identity_verification_sessions` rows stuck in `in_progress` > 2h | Ops |
| [>] | Set up alert: webhook 401 rate > 5% | Ops |
| [>] | Set up Sentry filter: `[webhook/didit]` errors | Ops |
| [>] | Configure reconciliation cron to run every 30min (Vercel Cron / external scheduler) | Ops |

### Rollback (if critical issue):
1. In Superadmin → Didit page: disable `verification.didit.enabled`
2. Enable `verification.manual.enabled` so users can still submit documents
3. No migration rollback needed — all changes are additive
4. Legacy Sumsub routes remain functional as fallback

---

## Cron Configuration

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/identity-verification-reconcile",
    "schedule": "*/30 * * * *"
  }]
}
```
Send `Authorization: Bearer <CRON_SECRET>` via Vercel Cron header.

---

## Environment Variable Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `DIDIT_API_KEY` | ✅ Yes | Didit API authentication |
| `DIDIT_WORKFLOW_ID` | ✅ Yes | KYC workflow identifier |
| `DIDIT_WEBHOOK_SECRET` | ✅ Yes | HMAC secret for webhook verification |
| `DIDIT_BASE_URL` | Optional | Defaults to https://verification.didit.me |
| `DIDIT_ENVIRONMENT` | Optional | `production` or `sandbox` |
| `DIDIT_CALLBACK_URL` | Optional | Post-verification redirect URL |
| `SUMSUB_EMBED_REFRESH_SECRET` | Deprecated | Remove from production secrets |

---

*Last updated: 2026-07-04 — Didit hard replace complete.*
