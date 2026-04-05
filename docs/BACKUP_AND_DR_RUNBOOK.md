# Backup and Disaster Recovery Runbook

## 1. Backup Strategy

### Supabase Point-in-Time Recovery (PITR)

Supabase Pro plans and above include PITR with WAL-G:

- **RPO (Recovery Point Objective):** Up to the last WAL segment (~seconds)
- **RTO (Recovery Time Objective):** 15–60 minutes depending on database size
- **Retention:** 7 days (Pro), 14 days (Team), 30 days (Enterprise)

### Verification Steps (before launch)

1. Confirm Supabase plan includes PITR
2. Test a restore to a **new project** (never restore over production)
3. Verify restored data integrity: row counts, recent transactions, storage objects

### What Is Backed Up

| Asset | Method | Frequency |
|-------|--------|-----------|
| Postgres data | Supabase PITR (WAL-G) | Continuous |
| Storage objects | Supabase manages S3 durability | Continuous |
| Auth users | Part of Postgres | Continuous |
| Edge Functions | Version control (this repo) | On deploy |
| Vercel deployment | Vercel retains builds | Per deployment |
| Environment secrets | Manual / vault | On change |

### What Is NOT Automatically Backed Up

- External service configuration (Paystack dashboard, OneSignal, Mapbox, etc.)
- DNS records
- Vercel environment variables
- EAS build credentials / signing keys

## 2. Disaster Scenarios

### Scenario A: Accidental Data Deletion / Corruption

1. Identify the timestamp of the incident
2. In Supabase Dashboard → Database → Backups → Restore to a point in time
3. Restore to a **new project** first
4. Validate data in the new project
5. When confirmed, swap DNS/env to the new project or migrate data back

### Scenario B: Complete Supabase Project Loss

1. Contact Supabase support immediately
2. Restore from PITR to a new project
3. Re-apply storage bucket configurations
4. Update all environment variables (web, mobile, CI) to new project URL/keys
5. Redeploy web and trigger EAS update for mobile

### Scenario C: Vercel Outage

1. Monitor status.vercel.com
2. If prolonged (>1 hour): enable maintenance mode via Supabase `platform_settings`
3. Optionally deploy to backup hosting (requires `next build` + Node server)

### Scenario D: Payment Provider Outage (Paystack)

1. Enable maintenance banner for payments only (not full site)
2. Queue failed webhook events for retry (existing `payment_webhook_events` table)
3. Monitor Paystack status page
4. Process queued events when service recovers

## 3. Pre-Launch Checklist

- [ ] Confirm Supabase plan includes PITR
- [ ] Test PITR restore to new project
- [ ] Document Supabase project ref and org
- [ ] Store signing keys / EAS credentials securely (not only on one machine)
- [ ] Test maintenance mode activation
- [ ] Verify webhook retry mechanism works after downtime
- [ ] Document all environment variables and their sources
- [ ] Set up uptime monitoring (health check endpoint: `GET /api/health`)

## 4. Contacts

| Role | Contact |
|------|---------|
| Supabase Support | support@supabase.io or dashboard ticket |
| Vercel Support | vercel.com/support |
| Paystack Support | support@paystack.com |
| On-call engineer | (fill in before launch) |
