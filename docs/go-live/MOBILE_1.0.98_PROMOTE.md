# Post-release promotion — 1.0.98

After TestFlight / Play beta device sign-off ([MOBILE_1.0.98_DEVICE_SIGNOFF.md](./MOBILE_1.0.98_DEVICE_SIGNOFF.md)):

1. **App Store Connect:** Submit TestFlight build for review → release to App Store.
2. **Google Play:** Promote beta/internal track to production (phased rollout optional).
3. **Do not** run production `eas update` until store listings show **1.0.98** to users (customer uses `runtimeVersion` policy; provider uses explicit **1.0.98**).
4. Re-run `pnpm run go-live:check` on production web SHA after Vercel deploy.
5. Monitor Sentry (customer + provider), Paystack webhooks, finance drift CI.
