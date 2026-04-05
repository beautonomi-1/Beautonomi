# Plan: “How did you hear about us?” + Early language selection

**Goals**
- Add **signup source** (“How did you hear about us?”) for **customer** and **provider** signups so superadmin can see where signups come from.
- Add **default language** selection **early** for customers (e.g. on signup).
- Use a **modern pill/rounded** dropdown UI consistent with existing auth screens.
- **Do not break** existing signup, login, or profile flows.

---

## 1. Data model

### 1.1 New column: `signup_source`

- **Table:** `public.users`
- **Column:** `signup_source TEXT NULL`
- **Migration:** New migration (e.g. `330_add_signup_source_to_users.sql`)
  - `ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_source TEXT;`
  - Optional: `COMMENT ON COLUMN users.signup_source IS 'How the user heard about us (e.g. Google, Friend, Instagram).';`
- **Why nullable:** Existing users and future signups that skip the field stay valid. No change to `handle_new_user` trigger required.

### 1.2 Language

- **Already exists:** `users.preferred_language TEXT DEFAULT 'en'` (migration 002).
- **No schema change.** Use existing column; set it on signup (and optionally from device locale as default).

---

## 2. Allowed values for “How did you hear about us?”

- Define a **single source of truth** (e.g. in code or in platform_settings) so admin and apps stay in sync.
- **Suggested list** (configurable later):
  - `google` – Google search
  - `social_instagram` – Instagram
  - `social_facebook` – Facebook
  - `social_twitter` – Twitter/X
  - `friend_or_family` – Friend or family
  - `blog_or_article` – Blog or article
  - `app_store` – App Store / Play Store
  - `provider_referral` – Referred by a provider
  - `other` – Other
- Store the **code** (e.g. `google`) in `users.signup_source`. Labels are translated or rendered in admin from a shared list.

---

## 3. Customer app

### 3.1 Customer signup screen (`apps/customer/app/(auth)/signup.tsx`)

- **Placement:** After phone (optional) and before the “I agree to the Terms” checkbox (or after Terms, before “Create Account”). Keep referral code logic as-is.
- **“How did you hear about us?”**
  - **UI:** Single dropdown that looks like existing inputs: same border, **borderRadius** (e.g. `RADIUS_INPUT` 16), background, padding. Trigger: one row with label + selected value + chevron (pill/rounded container).
  - **Behaviour:** Tap opens a **modal or bottom sheet** with a scrollable list of options (same rounded list items). Select one → close modal, show selected label in the trigger. Optional: “Prefer not to say” or “Skip” so the field stays optional.
  - **State:** `signupSource: string | null` (e.g. `null` or `"google"`). Optional field: do **not** block submit if empty.
- **“Preferred language”**
  - **Placement:** Near the top (e.g. after “or sign up with email” divider) or immediately after “Full name” so it’s “early” and visible.
  - **UI:** Same pill/rounded style as above: one row with “Language” + selected language name + chevron; tap opens modal with supported languages (reuse `supportedLanguages` from `@beautonomi/i18n` or account-settings language list).
  - **State:** `preferredLanguage: string` (e.g. `'en'`). Default: `preferred_language` from device locale (e.g. `Localization.getLocales()[0]?.languageCode`) or `'en'`.
- **After successful signup (session exists):**
  - Already: `api.patch("/api/me/profile", { phone: fullPhone })`, then referral attach.
  - **Add:** In the same success path, call `api.patch("/api/me/profile", { signup_source: signupSource || undefined, preferred_language: preferredLanguage })` (only if at least one is set). If confirmation is required, store `signupSource` and `preferredLanguage` in AsyncStorage (e.g. `beautonomi_pending_signup_source`, `beautonomi_pending_preferred_language`) and send them on **first successful login** (e.g. in login screen after `router.replace` or in a small effect that runs once when session appears and keys exist).
- **OAuth signup:** No form for source/language on the OAuth popup. Options: (a) show a short post-OAuth “Tell us more” step (one screen with the two dropdowns and “Continue”), or (b) set language from device and leave `signup_source` null for OAuth. Recommendation: (b) for MVP; (a) as enhancement.

### 3.2 Customer login screen (`apps/customer/app/(auth)/login.tsx`)

- When **signup** happens here (e.g. “Sign up” mode with email/password), either:
  - Redirect to the dedicated **signup** screen (which will have source + language), or
  - Add the same two optional fields (source + language) to the login screen when `isSignup === true`.
- **Post-login:** If AsyncStorage has `beautonomi_pending_signup_source` / `beautonomi_pending_preferred_language` (from email signup with confirmation), send them in one `PATCH /api/me/profile` and then remove the keys. This avoids breaking the “confirm email then log in” flow.

### 3.3 Existing UI constants

- Reuse `RADIUS_INPUT`, `RADIUS_BUTTON`, `RADIUS_BUTTON_PILL` from `@/constants/layout` (customer) so the new dropdowns match existing pill/rounded style.

---

## 4. Provider app

### 4.1 Provider signup

- **Where:** Provider signup is in `apps/provider/app/(auth)/login.tsx` (email/password signup) and possibly OAuth. There is no separate `signup.tsx`; the login screen can toggle to signup.
- **Add “How did you hear about us?”**
  - Same pattern: one optional dropdown (pill/rounded), same list of source codes.
  - **Placement:** When in “sign up” mode, add the dropdown before the submit button (e.g. after phone/name if present, or after password).
- **State:** `signupSource: string | null`. After successful `signUpWithEmail`, call provider’s profile API or a generic `PATCH /api/me/profile` with `signup_source` if the provider API supports it (see Backend below).
- **Language:** Optional for provider app in this plan; can be added later (e.g. from device or one dropdown) without schema change.

### 4.2 Provider onboarding

- **Alternative:** If you prefer not to add fields to the auth screen, add a single “How did you hear about us?” (pill dropdown) on the **first step** of provider onboarding (`apps/provider/app/(app)/onboarding.tsx` or the first web onboarding step). Persist via provider profile or `/api/me/profile` when that step is submitted. This keeps auth unchanged and still gives superadmin a source for provider signups.

---

## 5. Backend (apps/web)

### 5.1 Profile API: accept `signup_source`

- **File:** `apps/web/src/app/api/me/profile/route.ts`
- In **PATCH**, add: `if (body.signup_source !== undefined) updates.signup_source = body.signup_source || null;`
- **Validation:** Allow only values from the allowed list (e.g. reject unknown codes or treat as `other`). Optional: allow `null` to clear.

### 5.2 Admin: expose and filter by signup source

- **Users list API** (e.g. `GET /api/admin/users` or search): In the SELECT and response, include `signup_source` for each user.
- **Admin users page** (`apps/web/src/app/admin/users/page.tsx`):
  - Add **filter by signup source** (e.g. dropdown or multi-select: “All”, “Google”, “Friend”, …). Filter in API with `users.signup_source = :source` (or `IN` for multiple).
  - In the users table, add an optional **column** “Source” (e.g. badge or text) showing `signup_source` so superadmin can scan.
- **User detail modal** (`UserDetailModal.tsx`): Show `signup_source` (and optionally `preferred_language`) in the user details so superadmin can see per-user.

### 5.3 Superadmin “Signup sources” view (optional)

- **New page or section:** e.g. “Signup sources” under Admin with a simple breakdown: count of users per `signup_source` (and optionally over time). This can be a separate small report page or a card on the dashboard. Not required for “critical” visibility if the users list filter + column are in place.

---

## 6. Shared source-of-truth for options

- **Option A:** Define the list in **packages/i18n** or a shared constants file (e.g. `signupSourceOptions: { value: string; labelKey: string }[]`) and use in customer app, provider app, and admin (admin can use the same labels or map codes to names).
- **Option B:** Store the list in **platform_settings** (e.g. `signup_source_options: { value: string; label: string }[]`) so superadmin can edit options later without app releases. Apps and admin would fetch this once or use a fallback list.
- Recommendation: **Option A** for MVP (single list in code); migrate to Option B later if you need editable options.

---

## 7. What not to change (avoid breaking)

- **Do not** make `signup_source` or language **required** in the API or DB. Both optional.
- **Do not** change `handle_new_user` trigger for this feature; persist `signup_source` and `preferred_language` only via **PATCH /api/me/profile** after signup (or after first login when coming from email confirmation).
- **Do not** remove or change the existing referral flow (referral code, `REFERRAL_REF_KEY`, `/api/me/referrals/attach`). “How did you hear about us?” is separate from referral attribution.
- **Do not** change existing OAuth signup flow unless you add an optional post-OAuth step; if you do, keep it skippable.
- **Do not** change `users.preferred_language` default or RLS; only add one nullable column `signup_source`.

---

## 8. Implementation order (suggested)

1. **Migration:** Add `users.signup_source` (nullable).
2. **Backend:** PATCH /api/me/profile accepts `signup_source`; validate against allowed list. Admin users API returns `signup_source`; add filter and table column (and detail modal).
3. **Shared list:** Define `SIGNUP_SOURCE_OPTIONS` (or similar) and optional i18n keys for labels.
4. **Customer app – signup:** Add “Preferred language” dropdown (early), then “How did you hear about us?” dropdown; persist both in success path (and handle confirmation flow via AsyncStorage + first-login PATCH).
5. **Customer app – login:** If signup is done here, either redirect to signup or add the two fields; implement pending keys read on first login and PATCH.
6. **Provider app:** Add “How did you hear about us?” on signup (or first onboarding step); persist via PATCH /api/me/profile or provider profile API.
7. **Optional:** Superadmin “Signup sources” report (counts by source).

---

## 9. UI reference (pill/rounded dropdown)

- **Existing pattern (customer signup):** Country code picker is a touchable with flag + code + chevron, rounded container, opening a modal with a list. Reuse that pattern: same border radius (e.g. 16), same background (#FAFAFA or #F9FAFB), same padding. The “trigger” looks like a single pill/rounded row; the opened content is a modal with a scrollable list of options, each row tappable with the same radius.
- **Accessibility:** Label for the dropdown (“How did you hear about us?”, “Preferred language”); accessibilityRole and accessibilityState for the trigger and list options.

This plan keeps all existing behaviour intact, adds one nullable column and optional UI, and gives superadmin visibility into signup sources plus early language selection for customers.
