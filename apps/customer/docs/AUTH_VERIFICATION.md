# Customer App — Auth & Onboarding Verification Checklist

## Prerequisites

- Supabase project with the relevant auth providers enabled (Auth → Providers):
  - **Phone** — SMS OTP (Twilio / MessageBird / Vonage / TextLocal)
  - **Email** — magic-link / OTP (for email-OTP and password-reset flows)
  - **Google / Apple** — OAuth (configured in Supabase + app OAuth credentials)
- Environment variables in `apps/customer/.env.local`:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_APP_URL` — backend URL (e.g. `http://localhost:3000` in dev)

---

## Sign-in methods

The login screen (`app/(auth)/login.tsx`) supports:

| Method | Notes |
|--------|-------|
| Phone SMS OTP | `shouldCreateUser: true` — creates account on first use |
| Email OTP (magic-link style) | OTP code sent to email, verified inline |
| Email + password | Standard Supabase password auth |
| Google OAuth | `supabase.auth.signInWithOAuth` |
| Apple OAuth | `supabase.auth.signInWithOAuth` |

The signup screen (`app/(auth)/signup.tsx`) supports email + password and OAuth only.
New phone users are created from the **login screen** (`shouldCreateUser: true` on phone OTP).

---

## Auth gate flow (cold start)

```
app/index.tsx
  │
  ├─ No session → /(auth)/login
  │
  └─ Session present
       │
       ├─ GET /api/me/portal
       │    ├─ admin          → WrongAppScreen (go to web admin)
       │    └─ customer / provider / provider_onboarding
       │
       ├─ GET /api/me/onboarding/complete
       │    ├─ completed=false → /(app)/onboarding (6-step wizard)
       │    └─ completed=true  → next gate ↓
       │
       └─ GET /api/me/profile-completion
            ├─ required items incomplete → /(app)/account-settings/[screen]
            └─ complete (or error)       → /(app)/(tabs)/home
```

Portal check has a 12 s hard timeout (fail-closed with retry screen, never
fail-open). Onboarding check retries 3× then falls back to AsyncStorage.

---

## Onboarding wizard — 6 steps

| Step | Content | Required? |
|------|---------|-----------|
| 1 | Preferred name | Yes |
| 2 | Profile photo | No (skip button shown) |
| 3 | Date of birth | No (skip button shown) |
| 4 | Phone + SMS OTP | Yes (unless already verified) |
| 5 | Home address | Yes (unless address already exists) |
| 6 | Beauty preferences | No (skip button shown) |

Wizard completes with `POST /api/me/onboarding/complete` → sets
`users.customer_onboarding_completed_at`. Result is cached in AsyncStorage per UID.

---

## Profile-completion gate (post-wizard)

`GET /api/me/profile-completion` returns required checklist items. The gate
redirects if any **required** item is incomplete:

| Item id | Required | Notes |
|---------|----------|-------|
| `photo` | No | Skippable in wizard; not a gate blocker |
| `email` | Only when account has an email | Phone-only signups are never gated on email |
| `phone` | Yes (customers) | Set during wizard step 4 |
| `address` | Yes (customers) | Set during wizard step 5 |

Redirect targets: `address` → `/(app)/account-settings/addresses`; all others → `/(app)/account-settings/personal-info`.

---

## Verification checklist

### 1. Cold start — no session
- [ ] Opens Login screen with no flash of Home

### 2. Phone OTP (new account)
- [ ] Enter phone → "Send code" → SMS received
- [ ] Enter 6-digit code → verified → onboarding wizard starts
- [ ] Complete wizard → lands on Home tab

### 3. Phone OTP (existing account)
- [ ] Enter phone → code → bypasses wizard → direct to Home
- [ ] Profile-completion gate: phone + address already set → no redirect

### 4. Email OTP
- [ ] Enter email on login → OTP email received
- [ ] Enter code → signed in → gate runs

### 5. Email + password (new account)
- [ ] Sign up via signup screen → confirmation email sent
- [ ] Tap link in email → `/auth/callback?token_hash=…&type=signup` → verified
- [ ] Returns to app → wizard runs

### 6. Google / Apple OAuth
- [ ] Tap OAuth button → browser/sheet → consent
- [ ] Callback → `app/auth/callback.tsx` exchanges code
- [ ] OAuth metadata (name, avatar) synced to `users` table
- [ ] Gate runs → wizard if new account, home if returning

### 7. Session persistence
- [ ] Log in → background app → return → still logged in
- [ ] Log in → force-kill app → reopen → still logged in (SecureStore)

### 8. Sign out
- [ ] Sign out → Login screen
- [ ] Reopen app → Login (no cached session)

### 9. Portal error recovery
- [ ] Kill network → open app → error screen with "Try again" button
- [ ] Restore network → tap retry → proceeds normally

### 10. Wrong-app (admin)
- [ ] Admin user opens customer app → `WrongAppScreen` with sign-out

---

## Key files

```
apps/customer/
├── app/
│   ├── _layout.tsx                    # Root stack: AuthProvider, theme, push, permissions
│   ├── index.tsx                      # Central gate (portal → onboarding → profile-completion → home)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx                  # Phone OTP, email OTP, password, OAuth
│   │   ├── signup.tsx                 # Email + password, OAuth
│   │   └── forgot-password.tsx        # Password reset
│   ├── auth/
│   │   └── callback.tsx               # OAuth / magic-link deep-link callback
│   └── (app)/
│       ├── _layout.tsx                # RoleGate, AccountStatusGuard, BiometricGate
│       ├── onboarding/
│       │   └── index.tsx              # 6-step post-signup wizard
│       └── (tabs)/
│           ├── home.tsx
│           └── ...
├── src/
│   ├── providers/
│   │   ├── AuthProvider.tsx           # Supabase session, OTP / OAuth helpers
│   │   └── NativePermissionsOnboardingProvider.tsx
│   ├── lib/
│   │   ├── customer-auth-routing.ts   # Post-login navigation
│   │   ├── portal-cache.ts            # Cache portal role per UID
│   │   ├── post-onboarding-redirect.ts
│   │   └── supabase-sms-otp.ts        # OTP length, cooldowns
│   └── components/
│       ├── RoleGate.tsx
│       ├── AccountStatusGuard.tsx
│       ├── BiometricGate.tsx
│       └── NativePermissionsOnboarding.tsx  # Push/location/photos prompts (separate from wizard)
└── docs/
    └── AUTH_VERIFICATION.md           # This file
```

---

## Dev commands

```bash
# From repo root
pnpm dev:customer

# Or from apps/customer
pnpm dev
```
