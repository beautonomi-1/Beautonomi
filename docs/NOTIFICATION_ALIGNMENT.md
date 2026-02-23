# Notification templates – platform alignment

This doc describes how notification **template keys** used in code align with the **notification_templates** table, and what was fixed so all notifications work from templates.

## How it works

- **Templates** are stored in `notification_templates` (key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description).
- **Sending**: Code calls `sendTemplateNotification(templateKey, userIds, variables, channels)` from `@/lib/notifications/onesignal`. That loads the row by `key`, replaces `{{variable}}` in title/body, and sends via OneSignal (push/email/SMS).
- If a template is **missing or disabled**, `getNotificationTemplate(key)` returns null and the send fails (or callers fall back to hardcoded messages where implemented).

## Template keys used in code (by area)

| Area | Template key(s) | Notes |
|------|-----------------|--------|
| **Booking status (provider PATCH)** | `booking_confirmed`, `booking_cancelled`, `booking_rescheduled`, `service_completed` | Provider updates status → notify customer |
| **Appointment notifications (resend/confirm/cancel/reschedule)** | `booking_confirmed`, `booking_reminder_24h`, `booking_reminder_2h`, `booking_cancelled`, `booking_cancelled_by_customer`, `booking_cancelled_by_provider`, `provider_booking_cancelled`, `provider_booking_rescheduled`, `booking_rescheduled` | appointment-notifications.ts + notification-service.ts |
| **Appointment reminders (cron/job)** | `appointment_reminder` | appointment-reminders.ts – **was missing**; added in 244 |
| **At-home / salon** | `provider_en_route_home`, `provider_arriving_soon_home`, `provider_arrived_home`, `home_service_location_*`, `salon_directions`, `salon_arrival_reminder`, `customer_arrived_salon`, `salon_waiting_area`, `provider_needs_directions`, `provider_location_shared` | All in 062 |
| **Service lifecycle** | `service_started`, `service_in_progress`, `service_almost_done`, `service_extended`, `service_completed`, `provider_running_late`, `provider_arrived_early`, `customer_running_late`, `customer_no_show` | All in 062 |
| **Payments** | `payment_successful`, `payment_failed`, `payment_pending`, `payment_method_expired`, `partial_payment_received`, `refund_processed`, `invoice_generated`, `receipt_sent` | mark-paid, refund, send-payment-link, request-payment, additional-charges |
| **Provider (to provider)** | `provider_booking_request`, `provider_booking_cancelled`, `provider_booking_rescheduled`, `provider_new_customer`, `provider_recurring_customer`, `provider_preferred_customer`, `provider_payout_*`, `provider_earnings_summary`, `provider_availability_changed`, `provider_holiday_mode*`, `provider_break_scheduled`, `provider_new_review`, `provider_booking_time_changed`, `provider_booking_date_changed`, `provider_dispute_opened`, `provider_dispute_resolved`, `provider_special_instructions`, `provider_weather_alert` | Latter five **were missing**; added in 244 |
| **Provider status (admin)** | `provider_suspended`, `provider_reactivated`, `provider_approved`, `provider_profile_rejected` | 191/243 |
| **Subscription** | `subscription_upgraded`, `subscription_downgraded`, `subscription_cancelled`, `subscription_renewed` | 192/243 + subscription routes |
| **Messaging** | `provider_new_message`, `customer_new_message` | me/messages + provider conversations – **were missing**; added in 244. (062 has `new_message` only.) |
| **Custom requests** | `customer_custom_offer`, `provider_custom_request` | `provider_custom_request` **was missing**; added in 244 |
| **Waitlist** | `booking_waitlist_available`, `waitlist_match`, `waitlist_match_sms` | waitlist notify + waitlist notifications – **waitlist_match / waitlist_match_sms were missing**; added in 244 |
| **Auth / account** | `password_reset`, `email_verification`, `account_suspended`, `welcome_message` | 062 |
| **Reviews / follow-up** | `review_reminder`, `provider_new_review`, `booking_follow_up`, `thank_you_after_service` | 062 |
| **Other** | `dispute_opened`, `dispute_resolved`, `complaint_filed`, `quality_issue_reported`, `safety_check_in`, `safety_alert`, `special_instructions_added`, `allergy_alert_provider`, `weather_alert`, `provider_onboarding_welcome`, `provider_profile_approved`, `provider_profile_rejected`, `booking_waitlist_available`, `provider_recommendation`, `service_suggestion`, `booking_cancelled_emergency`, plus loyalty/referral/package/gift card/membership/support templates | 062 |

## What was missing and fixed (migration 244)

These keys were **referenced in code but had no row** in `notification_templates` (or the wrong key). Migration **244_notification_templates_missing_align.sql** adds them so that:

- No send fails with “Template X not found or disabled”.
- Admin can edit all of them at `/admin/notification-templates`.

| Key | Used in | Purpose |
|-----|--------|--------|
| `appointment_reminder` | appointment-reminders.ts | Cron/job booking reminders (generic; variables: provider_name, appointment_date, appointment_time, services, hours_before, booking_number, booking_id) |
| `provider_booking_time_changed` | notification-service.ts | Notify provider when customer booking time changes |
| `provider_booking_date_changed` | notification-service.ts | Notify provider when customer booking date changes |
| `provider_dispute_opened` | notification-service.ts | Notify provider when customer opens dispute |
| `provider_dispute_resolved` | notification-service.ts | Notify provider when dispute is resolved |
| `provider_special_instructions` | notification-service.ts | Notify provider when special instructions are added |
| `provider_weather_alert` | notification-service.ts | Notify provider of weather alert affecting booking |
| `provider_new_message` | me/messages route | New message to provider (from customer) |
| `customer_new_message` | me/messages + provider conversations | New message to customer (from provider) |
| `provider_custom_request` | me/custom-requests route | New custom request to provider |
| `waitlist_match` | waitlist notifications | Email when waitlist slot matches |
| `waitlist_match_sms` | waitlist notifications | SMS when waitlist slot matches |

## Alignment checklist

- **Seeded templates**: Run 062 + 243 (and 244) so every key used in code exists in the DB.
- **Admin UI**: `/admin/notification-templates` lists and edits by key; create uses key (required).
- **Sending**: All sends go through `sendTemplateNotification(templateKey, ...)` and load from `notification_templates` by `key`; variables must match template `variables` and `{{var}}` placeholders.
- **Channels**: Template `channels` array is respected (push, email, sms, live_activities). Code passes desired channels; OneSignal layer uses template content per channel (email_subject, email_body, sms_body).

## Duplicates / aliases

- **new_message** (062) vs **provider_new_message** / **customer_new_message** (code): Code uses the two separate keys for recipient-specific copy; 244 adds the two so both exist. `new_message` remains for generic use.
- **booking_reminder_24h** / **booking_reminder_2h** (062) vs **appointment_reminder** (appointment-reminders.ts): Reminder job uses a single generic `appointment_reminder`; 244 adds it. You can later point it at the same content as one of the booking_reminder_* templates if you want one wording.

After running 244, all notifications referenced above are aligned with the platform templates table.
