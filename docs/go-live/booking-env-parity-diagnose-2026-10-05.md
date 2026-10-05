# Booking env parity — live diagnose (2026-10-05)

Automated probes from local environment. Re-run after deploy or Mapbox/Supabase changes.

## Legacy `/book/{slug}` → `/booking`

| Host | Request | Result |
|------|---------|--------|
| `staging.beautonomi.com` | `HEAD /book/e2e-test-provider-beautonomi` | **308** → `Location: /booking?slug=e2e-test-provider-beautonomi` |
| `www.beautonomi.co.za` | `HEAD /book/e2e-test-provider-beautonomi` | **200** (page render via `/book/[providerSlug]` — confirm **308** after next production deploy with proxy redirect) |

Staging matches canonical routing docs. Production co.za should be re-checked post-merge; `go-live-check.mjs` check `live.book_slug_redirect` expects **308** with `slug` in `Location`.

## Auth callback route

| Request | Result |
|---------|--------|
| `GET https://staging.beautonomi.com/auth/callback` (no `code`) | **307** → `/login?error=missing_code` |

Confirms callback is registered (not landing on `/?code=`). Full OAuth/email flows still require Supabase redirect URL allow-list (see `STAGING_MATRIX_PREP.md`).

## Mapbox / validate (guest)

Re-run and paste status codes:

```powershell
curl.exe -s -o NUL -w "%{http_code}" -X POST "https://staging.beautonomi.com/api/mapbox/geocode" -H "Content-Type: application/json" -d "{\"query\":\"Sandton\"}"
curl.exe -s -o NUL -w "%{http_code}" -X POST "https://staging.beautonomi.com/api/location/validate" -H "Content-Type: application/json" -d "{\"latitude\":-26.1076,\"longitude\":28.0567,\"provider_slug\":\"e2e-test-provider-beautonomi\"}"
```

Probe on **2026-10-05** returned **502** (`/api/mapbox/geocode`) and **500** (`/api/location/validate`) — staging Mapbox/validate still needs ops (**503** is the documented missing-token case; 5xx may also indicate misconfigured token or upstream Mapbox errors). Fix via Phase 2: Vercel `MAPBOX_*`, admin Mapbox UI, and `platform_secrets.mapbox_access_token`.

## CSP (staging booking redirect response)

Staging `/book/…` response includes **enforced** CSP and booking embed **`frame-ancestors *`**. Production co.za HTML response showed **CSP-Report-Only** with `strict-dynamic` nonce on sampled `/book/…` — triage per `CSP_PAYSTACK_READINESS.md`.

## Vercel SHAs vs git

Record from Vercel dashboard (Preview = `develop`, Production = `main`) after each deploy; not available from anonymous HTTP probes.

## Supabase email templates (manual)

| Flow | Template |
|------|----------|
| Gate email OTP | Magic Link (`{{ .Token }}`) |
| Password signup | Confirm signup |

Redirect URLs must include `{origin}/auth/callback` for staging and production hosts.
