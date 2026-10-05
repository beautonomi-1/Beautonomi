# End-to-End Flow Audit — 2026-10-04

**Scope:** `apps/web` + `apps/admin-web`, local dev against staging Supabase (`.env.local`).  
**Method:** Code trace → automated suites → local browser/API smoke. No push to remote.

## Phase 0 — Baseline

| Check | Result |
|--------|--------|
| Uncommitted diff | 77 tracked files changed (~110 paths incl. untracked); large `/book` → `/booking` migration on `develop` @ `bd44aa1b` |
| `pnpm typecheck` (monorepo) | **Fixed:** `step-service-selection.tsx` `lastModeRef` typing |
| `pnpm --filter web test` | **3567 passed** (723 files) |
| `pnpm --filter admin-web test` | **613 passed** after Slack label parity fix |
| `pnpm --filter @beautonomi/utils test` | **394 passed** |
| `booking-status-enum-contract` | **Pass** (2 tests) |

## Phase 1 — Code audit (summary)

Full traces covered auth, booking, ecommerce, provider portal, and admin SPA. Defects fixed in this pass are listed under **Fixes applied**. Remaining known gaps (not fixed in this pass):

- Admin SPA edge gate: cookie-only check without `ALL_ADMIN_ROLES` before rewrite (`proxy.ts`).
- Login modal still uses direct Supabase OTP in places (should use `/api/auth/otp/*`).
- Shop checkout UI totals do not preview promotion/gift-card discounts (server POST applies them).
- `yourInfo` step skipped for any logged-in user even with incomplete profile.
- Role lookup 3s timeout in proxy can false-lock provider/admin routes.

## Fixes applied (local)

| Area | Change |
|------|--------|
| Proxy | Public `/auth/callback`; guest `/checkout` legacy entry; tests in `book-shim-redirect.test.ts` |
| Auth callback | Allow `next` return to `/shop`, `/cart`, `/orders` |
| OTP verify API | Normalize digit-only tokens |
| Booking flow | Keep forms/resources steps while loading (`null`); create hold when leaving calendar for resources |
| Paystack verify | Expected amount includes `gift_card_amount`; fail closed if `recordProductOrderPayment` not OK / ledger incomplete |
| Shop checkout | Guest sign-in gate (401 + empty cart + provider_id); login links use `/login?next=` |
| Shop product page | Sign-in CTAs use `/login?next=` |
| Account status | Block suspended users on `/shop/checkout` |
| Admin Slack UI | Label for `finance.product_order.ledger_incomplete` |
| Types | `BookingState["mode"]` ref in service selection step |

## Phase 2 — Local environment

- **Web:** `http://localhost:3000` (`pnpm dev:web`, `.env.local` loaded).
- **Admin:** `http://localhost:5173/admin/` (`pnpm dev:admin`).
- **Tenant:** `verify-preview-tenant.mjs` expects deploy-meta (404 locally); booking API chain uses ZA/staging fallback and **passed** for seeded E2E provider.

## Phase 3 — Live verification (local)

| Flow | Code | Live / automated |
|------|------|------------------|
| Auth pages + sign-out API | Reviewed | `verify-auth-smoke.mjs` ✓; Playwright `auth.spec.ts` 5/5 ✓ |
| Signup / login UI | Reviewed | Browser: `/signup`, `/login` render ✓ |
| Legacy `/book` → `/booking` | Reviewed | API script ✓; Playwright redirect test ✓ |
| Public booking API chain | Reviewed | `verify-booking-e2e-chain.mjs` ✓ |
| `/booking` UI | Reviewed | Browser: flow shell loads for E2E slug (services empty in UI — tenant/catalog UX) |
| Guest shop checkout | Fixed | Browser: sign-in banner ✓ |
| Admin login shell | Reviewed | Browser: `/admin/login` form ✓ |
| Paystack pay-in-full | Reviewed | Not run (needs test card + logged-in customer); verify route fix covered by code + webhook parity |
| Provider onboarding + admin approval | Reviewed | **Not run** — requires admin credentials and fresh provider signup |
| Full booking payment + lifecycle | Reviewed | Playwright payment step **skipped** (no `E2E_PROVIDER_SLUG` gate / env) |
| Ecommerce order + fulfilment | Reviewed | **Not run** — requires authenticated customer + catalog |
| Wallet / gift cards / loyalty | Reviewed | **Not run** — requires authenticated sessions |

## Automated commands (repro)

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter admin-web test
node apps/web/scripts/verify-auth-smoke.mjs http://localhost:3000
node apps/web/scripts/verify-booking-e2e-chain.mjs http://localhost:3000
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm --filter web exec playwright test e2e/auth.spec.ts
```

## Follow-up (human)

1. Provide admin login to complete provider approval, payouts, and order admin flows in browser.
2. Run full Paystack test-card paths on local with a signed-in customer.
3. Consider fixing admin SPA edge role gate and login-modal OTP parity.
4. Push commits when ready (local commits only in this audit).

## Test data cleanup

No dedicated QA accounts were created in this pass (smoke used existing E2E seed provider). No cleanup required.
