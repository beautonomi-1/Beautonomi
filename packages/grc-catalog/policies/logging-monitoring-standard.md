# Logging and Monitoring Standard

## 1. What we log

| Source | Events | Retention |
|---|---|---|
| `audit_logs` (database) | Admin actions: refunds, user changes, payouts, configuration | [per retention schedule] |
| `grc_activity_log` | GRC decisions; append-only and hash-chained | At least 3 years |
| Supabase Auth logs | Sign-ins, MFA, password resets | Per Supabase plan |
| Vercel logs | Requests, function errors | Per Vercel plan (export for incidents) |
| Sentry | Application errors with context | [90 days] |
| Payment provider dashboards | Transactions, webhooks | Provider retention |

## 2. Protection

- Only authorised roles can read logs. Audit and GRC logs can't be edited by application users.
- Logs must not contain passwords, tokens, full card numbers or ID document images.

## 3. Monitoring

- Sentry alerts go to [channel]; on-call acknowledges within [1 hour] in business hours.
- Cron job failures and webhook failures are alerted.
- The GRC hub verifies the activity log hash chain monthly.

## 4. Review

The security lead reviews admin audit activity at least monthly for unusual patterns (bulk exports, off-hours privileged actions).
