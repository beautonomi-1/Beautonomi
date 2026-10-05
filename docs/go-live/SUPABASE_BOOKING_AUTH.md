# Supabase auth for web booking (staging → production)

## Redirect URLs

Add to Supabase **Authentication → URL configuration**:

- `https://staging.beautonomi.com/auth/callback`
- `https://www.beautonomi.co.za/auth/callback`
- (and `https://www.beautonomi.com/auth/callback` if used)

**Site URL** should match the primary customer host; avoid configs that leave OAuth/email codes on `/?code=` without hitting `/auth/callback`.

## Templates

| User action | API | Supabase template |
|-------------|-----|-------------------|
| Booking gate email OTP | `signInWithOtp` | **Magic Link** — show `{{ .Token }}` prominently |
| Booking gate SMS | `signInWithOtp` | SMS provider + OTP length = platform auth policy |
| `/signup` / LoginModal password | `signUp` | **Confirm signup** with `{{ .Token }}` |

See `supabase/email-templates/README.md` for copy references.

## Verification

1. Gate email OTP from payment step → inbox code → returns to booking with session.
2. Google/Apple from gate → lands on `/auth/callback?next=…` → booking URL with `auth_return=1`.
3. `GET /auth/callback` without code → redirects to login (`missing_code`) — already true on staging (2026-10-05).
