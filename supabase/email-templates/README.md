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

## Files in this folder

- `magic-link-otp.example.html` — example body you can paste into the Magic Link template (adjust branding).
