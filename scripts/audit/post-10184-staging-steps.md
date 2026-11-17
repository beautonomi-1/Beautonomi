# After applying migration `10184_refund_tender_gl_fix.sql` on staging

1. Apply migration: `supabase db push --linked` (or your usual pipeline).
2. Refresh marketplace health snapshots so dashboard contribution margin matches live formula:
   - Hit `GET /api/cron/refresh-provider-analytics` with cron auth for the staging window, **or**
   - Run `refreshMarketplaceHealthDailyForTenant` for the E2E tenant from an admin script.
3. Run `node scripts/audit/staging-finance-accuracy.mjs` and confirm metric QA passes (net platform cash **582.27**, contribution **−5.23**, store-credit refunds **315**, card refunds **0**).
4. Spot-check admin: Finance overview, trial balance, Analytics, Revenue report (1–17 Nov on staging).