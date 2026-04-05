# Soft Delete Strategy

This document standardizes the approach to data deletion across the Beautonomi platform.

## Decision Matrix

| Entity Class | Strategy | Column | Rationale |
|---|---|---|---|
| **Users** | `deleted_at` timestamp | `users.deleted_at` | GDPR/POPIA: must support account deletion with grace period for recovery |
| **Providers** | Status enum (`archived`) | `providers.status` | Business continuity: archived providers retain financial history |
| **Bookings** | Status enum (`cancelled`) | `bookings.status` | Financial records: cancelled bookings are part of the transaction trail |
| **Products / Offerings** | `is_active` boolean | `offerings.is_active` | Simplicity: toggling visibility without deleting catalogue history |
| **Messages** | No soft delete | N/A | Privacy: deleted messages are hard-deleted per policy |
| **Notifications** | No soft delete | N/A | Ephemeral: no business need to retain dismissed notifications |
| **Audit Logs** | Never deleted | N/A | Compliance: audit trail is immutable |
| **Payment Transactions** | Never deleted | N/A | Financial regulation: transaction records are permanent |
| **Explore Posts** | `deleted_at` timestamp | `explore_posts.deleted_at` | Moderation: soft delete allows admin review |
| **Reviews** | Status enum (`hidden`) | `reviews.status` | Moderation: hidden reviews can be restored |

## Implementation Rules

1. **New tables** should use `deleted_at TIMESTAMPTZ DEFAULT NULL` unless the entity
   falls into a category above with a different strategy.
2. **Queries** must filter out soft-deleted rows. Add `.is('deleted_at', null)` to all
   read queries for tables using the `deleted_at` approach.
3. **RLS policies** should include `deleted_at IS NULL` where applicable.
4. **Hard deletion** should only occur via the automated data retention cron (once implemented)
   after the configured retention period has passed.
5. **Indexes** should be partial where soft delete is used:
   `CREATE INDEX ... WHERE deleted_at IS NULL`.

## Migration Path

For existing tables that currently lack a consistent strategy:
1. Audit each table for existing deletion mechanisms
2. Add `deleted_at` column where missing and appropriate
3. Update application queries to filter by `deleted_at IS NULL`
4. Add RLS policies incorporating the soft delete filter
