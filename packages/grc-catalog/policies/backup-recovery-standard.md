# Backup and Recovery Standard

## 1. What is backed up

| Data | Method | Frequency | Retention |
|---|---|---|---|
| Supabase Postgres | Supabase managed backups [+ point-in-time recovery if enabled] | Daily [continuous with PITR] | Per plan ([7/14/30] days) |
| Supabase Storage (including `grc-evidence`) | [Scheduled export to separate storage] | [Weekly] | [90 days] |
| Source code | GitHub (distributed clones) | Continuous | Indefinite |
| Configuration | Code in repo; environment variables documented in [location] | On change | — |

## 2. Protection

Backups are encrypted, access-restricted to IT operations, and stored separately from the primary where possible.

## 3. Restore testing

- Restore to a **non-production** Supabase project at least **twice a year**.
- Check row counts and a sample of records; measure elapsed time.
- Record in the hub as a BC/DR test with RTO/RPO achieved, and upload evidence.

## 4. Responsibilities

IT operations owns backups and restore tests; the security lead reviews results.
