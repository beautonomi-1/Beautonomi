# Sumsub Native SDK — Ops Configuration Checklist

This document captures the operations steps required to activate end-to-end
Sumsub KYC after the native SDK migration has been deployed via a new EAS build.

## 1. Web environment variable

| Variable | Required | Description |
|---|---|---|
| `SUMSUB_EMBED_REFRESH_SECRET` | Yes (web embed) | 32-byte hex secret used to sign the embed refresh token for the **web** embed pages. Still needed by `apps/web/src/app/account-settings/verification/embed` and `apps/web/src/app/provider/verification/embed`. Generate with `openssl rand -hex 32`. Set in Vercel → Project → Environment Variables. |

> The native mobile SDK does NOT use `SUMSUB_EMBED_REFRESH_SECRET`. The mobile
> apps call the token endpoints directly over Bearer auth.

---

## 2. Database — `sumsub_integration_config`

Populate via **Admin Control Plane → Integrations → Sumsub**
(`PUT /api/admin/control-plane/integrations/sumsub`).

| Column | Example value | Notes |
|---|---|---|
| `enabled` | `true` | Master switch. Set `false` to fall back to manual-upload. |
| `environment` | `production` | Must match the `?environment=` query param sent by the apps. |
| `level_name` | `basic-kyc-level` | Sumsub verification level name configured in your Sumsub dashboard. |
| `app_token_secret` | `_YOUR_SUMSUB_APP_TOKEN_` | Found in Sumsub dashboard → API Keys. |
| `secret_key_secret` | `_YOUR_SUMSUB_SECRET_KEY_` | Found in Sumsub dashboard → API Keys. |
| `webhook_secret_secret` | `_YOUR_SUMSUB_WEBHOOK_SECRET_` | Set this to match the secret you enter in step 3 below. |
| `tenant_id` | `null` or a specific tenant UUID | `null` = global (all tenants). Set to a UUID for per-tenant overrides. |

Run for every environment you support (e.g. `production`, `development`).

---

## 3. Sumsub dashboard — Webhook

1. Go to **Sumsub dashboard → Developers → Webhooks**.
2. Add a new webhook:
   - **URL**: `https://yourdomain.com/api/webhooks/sumsub`
   - **Secret**: must match `webhook_secret_secret` you stored in step 2.
   - **Algorithm**: SHA256 (default) or SHA512 — both work after the A1 fix.
   - **Events to enable** (at minimum):
     - `applicantReviewed`
     - `applicantWorkflowCompleted` (if using workflows)
3. Save and use "Test webhook" to verify a 200 response.

---

## 4. Native build requirement

The `@sumsub/react-native-mobilesdk-module` is a **native binary** change.
It cannot ship via Expo Updates (OTA). New EAS builds are required:

```bash
# Provider
eas build --profile preview --platform all --filter=provider

# Customer
eas build --profile preview --platform all --filter=customer
```

See `docs/DEPLOYMENT_EAS.md` for the full EAS build and submission workflow.

---

## 5. Post-deploy QA (sandbox)

See `docs/DEPLOYMENT_EAS.md` Part H for the full QA matrix. Key items:

- [ ] Launch SDK → camera + mic permission prompts appear on iOS and Android
- [ ] Document capture + liveness check completes
- [ ] `onStatusChanged` fires with the correct status
- [ ] Webhook received at `/api/webhooks/sumsub` → DB updated
- [ ] `provider_verification_status` / `users.identity_verified` flip correctly
- [ ] App status UI updates on next poll (within 30 s)
- [ ] Token expiration mid-flow: short-lived token triggers `onTokenExpiration` → new token → flow continues
- [ ] New Architecture (`newArchEnabled: true`) — verify the module loads without TurboModule error

---

## References

- [Sumsub API docs](https://docs.sumsub.com/reference/about-sumsub-api)
- [Sumsub React Native Module docs](https://docs.sumsub.com/docs/react-native-module)
- Admin route: `apps/web/src/app/api/admin/control-plane/integrations/sumsub/route.ts`
- Token helper: `apps/web/src/lib/verification/sumsub-token.ts`
- Webhook handler: `apps/web/src/app/api/webhooks/sumsub/route.ts`
- Provider launch helper: `apps/provider/src/lib/sumsub/launchSumsub.ts`
- Customer launch helper: `apps/customer/src/lib/sumsub/launchSumsub.ts`
