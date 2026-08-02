# App Store Connect age rating — declaration record

This document records every App Store Connect age-rating question, the answer we submit, the code or product path that justifies it, and suggested review-notes text. Update it whenever product behaviour or declarations change.

**Public age suitability URL:** `https://www.beautonomi.com/age-suitability` (also seeded in CMS slug `age-suitability`).

**Related docs:** [IOS_RELEASE_SUBMIT.md](./IOS_RELEASE_SUBMIT.md) · CMS page `/age-suitability` · migration `829_age_suitability_page_content.sql`

---

## Customer app (`com.beautonomi`)

| Question | Answer | Justification |
|----------|--------|---------------|
| **Parental Controls** | **Yes** | Account Settings → **Content & Safety Controls** (`apps/customer/app/(app)/account-settings/content-and-safety-controls.tsx`). Device auth (Face ID / Touch ID / passcode) gates changes when `require_device_auth` is on. Defaults for 13–17 band are locked server-side (`apps/web/src/lib/age-assurance/safety-settings.ts`). |
| **Age Assurance** | **Yes** | DOB at onboarding; server resolves age band from verified KYC DOB → declared DOB → device signal (`apps/web/src/lib/age-assurance/age-band.ts`). Social writes guarded by `requireSocialAccess()` (`apps/web/src/lib/safety/require-social-access.ts`). |
| **Social Media Disabled for Users Under 13** | **No** (Phase 1–2) | Apple’s Declared Age Range API requires `expo-age-range` (Expo SDK 55+ / Xcode 26). Both apps remain on Expo SDK 54. We block under-13 via DOB + server enforcement instead. Flip to **Yes** after Phase 3 SDK upgrade + adapter. |
| **Unrestricted Web Access** | **No** | In-app browser allowlist (`apps/customer/src/lib/webview-allowlist.ts`); unknown origins open in system browser. Legal pages use first-party URLs only. |
| **User-Generated Content** | **Yes** | Reviews, Explore posts, comments, profile photos, chat attachments. In-app report flows: Explore post menu + comment flag (`explore-post.tsx`), chat long-press → Report (`chat.tsx`), `POST /api/reports/content`. |
| **Social Media** | **Yes** | Explore feed, collections, likes/saves, social discovery. |
| **Messaging and Chat** | **Yes** | Customer ↔ provider messaging (`apps/customer/app/(app)/chat.tsx`). Can be disabled via safety settings. |
| **Advertising** | **Yes** | Sponsored placement in search/home; labelled in UI. |
| **Medical or Treatment Information** | **Infrequent** | Most content is beauty/wellness listings; medical-aesthetic treatments appear on some provider profiles. In-app “not medical advice” notes on treatment text. |
| **Health or Wellness Topics** | **Yes** | Marketplace for beauty, wellness, and self-care services. |
| **Age Suitability URL** | `https://www.beautonomi.com/age-suitability` | Public CMS page at `apps/web/src/app/age-suitability/`. |

### Suggested App Review notes (Customer)

> Beautonomi is a beauty and wellness marketplace. Minimum age for social features is 13, enforced server-side using declared and verified date of birth. Account Settings includes Content & Safety Controls (restricted mode, hide social feed, disable comments/likes/messaging, sensitive content filter) protected by device authentication. In-app web views are limited to approved origins; there is no unrestricted browser. UGC can be reported in-app. Age suitability details: https://www.beautonomi.com/age-suitability

---

## Provider app (`com.beautonomi.partner`)

| Question | Answer | Justification |
|----------|--------|---------------|
| **Parental Controls** | **No** | Business tool for providers 18+; no guardian controls surface. |
| **Age Assurance** | **Yes** | Provider onboarding + KYC/KYB verification; business accounts only. |
| **Unrestricted Web Access** | **No** | Provider portal WebView allowlist. |
| **User-Generated Content** | **Yes** | Listings, portfolio content, reviews received. |
| **Social Media** | **No** | No consumer-style social feed in provider app. |
| **Messaging and Chat** | **Yes** | Provider ↔ customer conversations. |
| **Advertising** | **No** | Providers purchase placement on customer surfaces, not in provider app. |
| **Medical or Treatment Information** | **Infrequent** | Service descriptions may reference treatments; not medical advice. |
| **Health or Wellness Topics** | **Yes** | Business management for beauty/wellness providers. |

---

## Code map (enforcement)

| Layer | Path |
|-------|------|
| Age band resolution | `apps/web/src/lib/age-assurance/age-band.ts` |
| Policy / feature flags | `apps/web/src/lib/age-assurance/age-policy.ts` |
| Effective + locked settings | `apps/web/src/lib/age-assurance/safety-settings.ts` |
| Social write guard | `apps/web/src/lib/safety/require-social-access.ts` |
| Block / mute | `apps/web/src/lib/safety/user-blocks.ts`, migration 836 |
| Content moderation | `apps/web/src/lib/safety/moderation-actions.ts` |
| Safety Hub (mobile) | `apps/customer/app/(app)/safety/`, `apps/provider/app/(app)/(tabs)/more/safety/` |
| Trust & Safety runbook | `docs/TRUST_SAFETY_RUNBOOK.md` |
| Safety settings API | `apps/web/src/app/api/me/safety-settings/route.ts` |
| Feature flags (seed) | `supabase/migrations/828_age_assurance_and_safety_settings.sql` |
| Public policy page | `apps/web/src/app/age-suitability/` |

Feature flag keys (Admin → Settings → Feature flags):

- `safety.social_min_age` — metadata `{ "min_age": 13 }`
- `safety.social_age_gate_mode` — `off` \| `log` \| `enforce`
- `safety.restricted_mode_defaults` — forced defaults for 13–17 band

---

## Rollout: `log` → `enforce`

The social age gate ships in **`log`** mode so deploy does not block existing users.

1. **Deploy** migrations 828 + 829 and application code with `safety.social_age_gate_mode` = `log` (default in DB seed).
2. **Monitor** server logs for `[safety] social access would block` entries (`require-social-access.ts`). Review volume for `under_13`, `safety_settings`, and `unknown` bands.
3. **Validate** Content & Safety Controls in the customer app (13–17 test accounts, locked toggles, device auth).
4. **Confirm** `/age-suitability` and App Store declarations match live behaviour.
5. **Flip enforcement** in Admin → Feature flags: set `safety.social_age_gate_mode` metadata to `{ "mode": "enforce" }`. No redeploy required; takes effect on next request.
6. **Rollback** instantly by setting mode back to `log` or `off` if unexpected blocks occur.

Do **not** enable `enforce` until unknown-DOB legacy users have been reviewed in log output and support is briefed on `SOCIAL_RESTRICTED` / `SAFETY_SETTING_LOCKED` responses.

---

## Phase 3 follow-up (Declared Age Range API)

When upgrading to Expo SDK 56+ and installing `expo-age-range`:

1. Implement device adapter in `apps/customer/src/lib/age-assurance/device-age-range.ts`
2. Add `POST /api/me/age-signal` to store lowest-precedence device signal
3. Add iOS entitlement `com.apple.developer.declared-age-range`
4. Flip **Social Media Disabled for Users Under 13** to **Yes** in App Store Connect
5. Update this document and `/age-suitability` CMS copy

---

## Change log

| Date | Change |
|------|--------|
| July 2026 | Initial record: Phase 4 page, safety layer, log-mode rollout plan |
