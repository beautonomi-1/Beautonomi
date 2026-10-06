# Mobile 1.0.98 — device sign-off (operator)

Complete on **TestFlight / Play beta** builds after `pnpm run submit:all` (or per-app submit scripts).

## Automated coverage already run in CI/repo (2026-10-06)

- Paystack verify retry Jest (customer + provider)
- Stale pending cron + nav-counts API tests (web vitest — run before release if not in CI)
- Parity **32/32** + `release:check:mobile`

## Required manual checklists

1. [Receipt downloads + stale pending](../qa/receipt-downloads-and-stale-pending-qa-checklist.md) — **full** on iOS + Android
2. [PAYMENTS_MOBILE_QA_MATRIX.md](../PAYMENTS_MOBILE_QA_MATRIX.md) — beta minimum **S1–S3** on **C1, C3, C5, C7, P1**; full doc acceptance before wide production promotion
3. [PUSH_NOTIFICATIONS_CHECKLIST.md](../mobile/PUSH_NOTIFICATIONS_CHECKLIST.md)
4. [MOBILE_PERMISSIONS_QA.md](../MOBILE_PERMISSIONS_QA.md)
5. SDK 57 video: explore carousel, announcements, provider explore detail modal
6. Provider: IAP subscription smoke; PayCloud on hardware if used ([PAYCLOUD_SANDBOX_QA.md](../PAYCLOUD_SANDBOX_QA.md))

| Checklist | iOS date | Android date | Sign-off |
|-----------|----------|--------------|----------|
| Receipts / PDF | | | |
| Payments beta min | | | |
| Push | | | |
| SDK 57 video | | | |
