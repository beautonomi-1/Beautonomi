# Data retention and erasure policy (Beautonomi platform)

Operational reference for engineering, support, and compliance audits. Complements [account-deactivation-and-deletion.md](../account-deactivation-and-deletion.md) and [ACCOUNT_SECURITY_AND_COMPLIANCE_QA.md](../ACCOUNT_SECURITY_AND_COMPLIANCE_QA.md).

**Primary law:** POPIA (South Africa). **Secondary (if applicable):** GDPR for EU/EEA data subjects. **Tax:** SARS record-keeping (~5 years for invoices/transactions).

---

## 1. Self-service account deletion (customer + provider)

| Step | Behavior |
|------|----------|
| User confirms | Password or OTP + type `DELETE` |
| Grace period (when enabled) | 30 days: account locked (`deactivated_by = pending_deletion`), auth user banned, signed out; cancel via emailed link or support only |
| After grace / immediate (flag off) | `purgePlatformUserAccountFully`: FK cleanup RPC → chat storage purge → `public.users` delete → `auth.admin.deleteUser` |
| Audit | Redacted snapshot in `compliance_purge_audit_log` (5-year retention, then auto-purged) |

---

## 2. Data category matrix

| Category | On user purge | Legal basis | Retention after purge |
|----------|---------------|-------------|------------------------|
| Auth identity (email, phone, password) | **Deleted** (Supabase Auth removed) | Erasure (POPIA s24 / GDPR Art. 17) | None in primary DB |
| Profile (`public.users`, addresses, prefs) | **Deleted** (CASCADE from users) | Erasure | None |
| Conversations / messages (customer-owned) | **Deleted** (CASCADE) | Erasure | None |
| Chat attachment files (Storage) | **Deleted** explicitly in purge | Erasure | None in bucket |
| Bookings as customer | **Deleted** (`bookings.customer_id` → `ON DELETE CASCADE`, migration `005_bookings.sql`) | Erasure | None |
| Provider org (owner purge) | **Deleted** (provider row + cascaded business data) | Erasure | None |
| Sales rows (customer link) | **Retained**; `sales.customer_id` → `ON DELETE SET NULL` (`129_sales_table.sql`) | Legitimate interest / tax | Indefinite until separate retention job |
| Sales / payment actor (`created_by`) | **Anonymized** (NULL via `compliance_clear_user_references`) | Tax / audit trail | With financial record |
| Booking payments / refunds (actor) | **Anonymized** (`created_by` NULL) | Tax / audit | With payment record |
| Compliance purge audit snapshot | **Retained** (hashed email, counts; no name/phone) | Accountability (POPIA s14) | **5 years**, then cron purge |
| Platform `audit_logs` (delete action) | **Retained** per tier | Accountability | Per `retention_tier` / `purge_after_at` |
| Paystack / payment processor | **Not deleted by Beautonomi** | Processor contract | Per processor policy — disclose in privacy policy |
| Database backups | **May retain until rotation** | DR | Until backup expiry (document in DPA) |

---

## 3. Verified FK actions (schema)

Source migrations (read-only audit, 2026-06):

- `bookings.customer_id` → `REFERENCES users(id) ON DELETE CASCADE` (`005_bookings.sql`)
- `conversations.customer_id` → `ON DELETE CASCADE` (`007_messaging.sql`)
- `sales.customer_id` → `ON DELETE SET NULL` (`129_sales_table.sql`)
- `sales.created_by`, `booking_payments.created_by`, `booking_refunds.created_by` → NULL in `compliance_clear_user_references` (`440`, `619`)

Provider-owner purge additionally deletes owned bookings before provider CASCADE (`631_compliance_purge_provider_bookings.sql`).

---

## 4. Deactivation vs deletion

| | Deactivation | Deletion (scheduled) | Deletion (purged) |
|--|--------------|----------------------|-------------------|
| Reversible | Yes (self-serve login for `deactivated_by=user`) | Cancel link / support only | No |
| Auth | Active (unless admin-banned) | Banned | Removed |
| Data | Intact | Intact | Erased per matrix above |

---

## 5. Environment flags

| Variable | Purpose |
|----------|---------|
| `ACCOUNT_DELETION_GRACE_ENABLED` | `true` → 30-day deferred purge; `false`/unset → immediate purge (legacy) |
| `ACCOUNT_DELETION_LINK_SECRET` | HMAC for cancel-deletion email links (falls back to `RETENTION_LINK_SECRET`) |
| `COMPLIANCE_SNAPSHOT_RETENTION_YEARS` | Default `5` for `compliance_purge_audit_log.purge_after_at` |

---

## 6. Cron jobs

| Cron | Schedule | Action |
|------|----------|--------|
| `/api/cron/process-account-deletions` | Daily | Purge users past `account_deletion_purge_after_at` |
| `/api/cron/purge-compliance-snapshots` | Weekly | Delete audit rows past `purge_after_at` |
| `/api/cron/purge-audit-logs` | Weekly | Existing platform audit retention |

All support `?dry_run=1` for safe verification.

---

## 7. User-facing disclosures

Privacy policy / delete flows should state:

1. Deletion is permanent after the grace period (or immediately when grace is disabled).
2. Financial/transaction records may be retained in anonymized form for legal/tax obligations.
3. Payment processors retain data under their own policies.
4. Backups may retain data until rotated.
