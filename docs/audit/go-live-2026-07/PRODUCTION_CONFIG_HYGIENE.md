# Production config hygiene (go-live remediation)

Actions required outside this repo before multi-market day-one launch.

## Paystack live key in production

The public `config-bundle` on `www.beautonomi.co.za` currently exposes `pk_test_...` under `region_settings_public.paystack_public_key` while `meta.env` is `production`.

**Fix:** In admin region/tenant settings (or `region_settings` DB row for ZA), replace the test publishable key with the live `pk_live_...` key from the Paystack dashboard.

## Mapbox token restriction

The Mapbox public token in `third_party.mapbox.public_token` is publishable by design but should be URL-restricted.

**Fix:** In the Mapbox account dashboard, restrict the token to:
- `https://www.beautonomi.co.za/*`
- `https://www.beautonomi.com/*`
- `https://beautonomi.co.za/*`
- `https://beautonomi.com/*`

## Amplitude debug mode

Code now forces `debug_mode: false` when `environment === "production"` in [`apps/web/src/lib/config/index.ts`](../../apps/web/src/lib/config/index.ts). Optionally set `debug_mode = false` in the `amplitude_integration_config` production row for consistency.

## Dedicated CSRF secret

Add `CSRF_SECRET` (`openssl rand -hex 32`) to Vercel Production + Preview, separate from `CRON_SECRET`, then redeploy.
