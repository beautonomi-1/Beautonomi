# Supabase Auth email templates (Beautonomi)

## Numeric email code (OTP) instead of a magic link

Beautonomi apps call `signInWithOtp({ email, options: { shouldCreateUser: true } })` **without** `emailRedirectTo` for passwordless login. That alone does **not** guarantee a numeric code: **hosted Supabase** decides what the email contains from your **Magic Link** template.

Per [Supabase JS client docs](https://supabase.com/docs/reference/javascript/auth-signinwithotp) (and the `@supabase/supabase-js` source): if the template uses `{{ .ConfirmationURL }}`, users get a **magic link**; use `{{ .Token }}` so the email includes the **numeric OTP** used with `verifyOtp({ type: 'email' })`.

### What to change in the Supabase dashboard

1. Open **Authentication → Email Templates → Magic Link** (same template used for passwordless email sign-in).
2. Include **`{{ .Token }}`** prominently (e.g. “Your code is: **{{ .Token }}**”).
3. Remove or de-emphasize sole reliance on **`{{ .ConfirmationURL }}`** if you want code-first UX (you may keep a small “Or open this link” secondary line if needed).
4. Under **Authentication → Providers → Email** (or **Auth → OTP** depending on dashboard version), set **Email OTP expiration** to match Beautonomi **Platform settings → Auth → Email OTP expiration** (defaults to 3600s; minimum enforced in app config is **120 seconds**).

Keep **SMS OTP** settings separate; phone sign-in always sends an SMS code via Twilio (template is SMS, not email).

### SMS message (`{{ .Code }}`) — not the same as email

For **Phone → SMS Message**, Supabase (with Twilio) substitutes the numeric OTP into **`{{ .Code }}`**. Example (matches common dashboard setup):

`Your OTP code is {{ .Code }}`

Do **not** use `{{ .Token }}` in the SMS body — that placeholder is for **email** Magic Link / email OTP templates. Email numeric OTP → **`{{ .Token }}`** in the **Magic Link** email template; SMS numeric OTP → **`{{ .Code }}`** in the SMS message field.

## Numeric code (OTP) for email + password signup ("Confirm signup")

Email/password signup uses `auth.signUp` and Supabase delivers the **Confirm signup** template (separate from Magic Link). The Beautonomi web app, customer app, and provider app now verify the returned signup with **`verifyOtp({ type: "signup" })`** in addition to the existing link callback, so the user can type the code straight into the verification screen — no inbox round-trip required.

### What to change in the Supabase dashboard

1. Open **Authentication → Email Templates → Confirm signup**.
2. Include **`{{ .Token }}`** prominently (e.g. "Your code is: **{{ .Token }}**"). Without it, the email contains only a link and the in-app OTP screen will look like it is waiting for nothing.
3. Optionally keep **`{{ .ConfirmationURL }}`** as a secondary "Or tap this link to confirm" line — the existing `/auth/callback?token_hash=...&type=signup` handler still works, so the link is a fallback.
4. Under **Authentication → Email** make sure **Confirm email** is enabled (this is what causes `signUp` to return no session and trigger the OTP step on the client).

### Which template covers which flow

| Flow | Supabase template | Token placeholder | Verify call |
|------|-------------------|-------------------|-------------|
| Email/password signup | **Confirm signup** | `{{ .Token }}` (OTP) or `{{ .ConfirmationURL }}` (link) | `verifyOtp({ email, token, type: "signup" })` |
| Passwordless email sign-in | **Magic Link** | `{{ .Token }}` (OTP) or `{{ .ConfirmationURL }}` (link) | `verifyOtp({ email, token, type: "email" })` |
| Password reset | **Reset password** | `{{ .Token }}` (OTP) or `{{ .ConfirmationURL }}` (link) | `verifyOtp({ email, token, type: "recovery" })` |

Editing only the Magic Link template will **not** fix the signup screen — the password signup flow reads the **Confirm signup** template, not Magic Link.

## Change Email Address (onboarding Step 2)

Providers who sign up via phone (and some Google/Apple OAuth users) arrive at Step 2 without a confirmed email. Step 2 uses `supabase.auth.updateUser({ email })` + `verifyOtp({ type: "email_change" })` to verify the email as a 6-digit numeric code — **not** a magic link.

### What to change in the Supabase dashboard

1. Open **Authentication → Email Templates → Change Email Address**.
2. Include **`{{ .Token }}`** prominently (e.g. "Your code is: **{{ .Token }}**"). Without it, the email only contains a link and the in-app OTP box will appear but never receive a valid code.
3. Optionally keep `{{ .ConfirmationURL }}` as a secondary "Or tap this link" line — the `/auth/callback?token_hash=...&type=email` handler still works as a silent fallback.
4. Set **Secure email change OFF** (Authentication → Settings): when enabled, Supabase also emails the **old** address, which is a `@beautonomi.local` placeholder for phone-signup providers that can never receive mail — this would permanently block the flow.
5. Confirm **Google provider** scopes include `email profile openid` (the default) so the real Google email is always returned in the identity.

### Which template covers which flow

| Flow | Supabase template | Token placeholder | Verify call |
|------|-------------------|-------------------|-------------|
| Email/password signup | **Confirm signup** | `{{ .Token }}` (OTP) or `{{ .ConfirmationURL }}` (link) | `verifyOtp({ email, token, type: "signup" })` |
| Passwordless email sign-in | **Magic Link** | `{{ .Token }}` (OTP) or `{{ .ConfirmationURL }}` (link) | `verifyOtp({ email, token, type: "email" })` |
| Password reset | **Reset password** | `{{ .Token }}` (OTP) or `{{ .ConfirmationURL }}` (link) | `verifyOtp({ email, token, type: "recovery" })` |
| Onboarding email change (Step 2) | **Change Email Address** | `{{ .Token }}` (OTP) + optional `{{ .ConfirmationURL }}` | `verifyOtp({ email, token, type: "email_change" })` |

## Files in this folder

- `magic-link-otp.example.html` — example body for the **Magic Link** template (passwordless email sign-in).
- `confirm-signup-otp.example.html` — example body for the **Confirm signup** template (email/password signup verification).
- `change-email-otp.example.html` — example body for the **Change Email Address** template (onboarding Step 2 email OTP).
