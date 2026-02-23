# Email Templates / SMS Templates vs Notification Templates

## Summary

**Notification Templates** (`/admin/notification-templates`, table `notification_templates`) is the **single source of truth** used by the app when sending any template-based notification. Each row has a unique `key`, plus channel-specific content: `title`, `body` (push), `email_subject`, `email_body`, `sms_body`, and `channels[]` (push, email, sms, live_activities). Sending code uses `getNotificationTemplate(key)` from `@/lib/notifications/onesignal` (or similar), which reads from `notification_templates`.

**Email Templates** (`email_templates` table) and **SMS Templates** (`sms_templates` table) are a **legacy/parallel** system:

- Created in migration 108; migration 181 seeded VAT remittance reminder content into both.
- They have a different schema (e.g. `name`, `subject_template`, `body_template`, `category`, versioning tables).
- **No sending code in the codebase reads from these tables.** VAT reminder logic only checks `vat_remittance_reminders` and does not fetch content from `email_templates` or `sms_templates`.
- Admin CRUD for them existed at `/admin/email-templates` and `/admin/sms-templates`, which was redundant with editing email/SMS copy in Notification Templates.

## Redundancy and resolution

- **Redundant:** Having three places to manage “templates” (Email Templates, SMS Templates, Notification Templates) was confusing, and only Notification Templates is used for sending.
- **Resolution:**
  - **Admin nav:** “Email Templates” and “SMS Templates” were removed from the sidebar. All template editing is done under **Notification Templates**.
  - **Old URLs:** `/admin/email-templates` and `/admin/sms-templates` now redirect to `/admin/notification-templates` so bookmarks still work.
  - **Tables/APIs:** The `email_templates` and `sms_templates` tables and their admin APIs were left in place. If you later wire VAT (or other) sending to them, you can; for now, any such sending should be implemented using `notification_templates` (e.g. add keys like `vat_reminder_14d`, `vat_reminder_7d` and use `getNotificationTemplate`).

## If you need VAT reminders to send email/SMS

Today, VAT reminder “content” lives in `email_templates` and `sms_templates` but is not used by any sender. To actually send VAT reminder emails/SMS you can either:

1. **Use Notification Templates:** Add notification template keys for VAT reminders (e.g. `vat_reminder_14d`, `vat_reminder_7d`, `vat_reminder_3d`, `vat_reminder_1d`) with `email_subject`, `email_body`, `sms_body` set, and have the VAT reminder job call `getNotificationTemplate(key)` and your email/SMS sending layer.
2. **Wire legacy tables:** Implement a sender that reads from `email_templates` / `sms_templates` by name (e.g. “VAT Remittance Reminder - 7 Days”) and sends. This would be the only use of those tables for sending.

Recommendation: use (1) so all template content stays in one place (`notification_templates`).
