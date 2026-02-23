# Notification templates – upload all into database

All notification templates are applied automatically when you run the Supabase migrations. No manual upload is needed if you use migrations.

## How to get all templates

1. **Table + base templates (~87):** run migration `062_notification_templates.sql`  
   - Creates `notification_templates` and inserts the main set (booking, payment, provider, review, loyalty, etc.).

2. **Extra templates (19):** run migration `243_seed_all_notification_templates.sql`  
   - Adds: `provider_booking_cancelled`, `provider_booking_rescheduled`, `provider_suspended`, `provider_reactivated`, `provider_approved`, `subscription_upgraded`, `subscription_downgraded`, `subscription_cancelled`, `subscription_renewed`, product order and return templates.

**Using Supabase CLI (recommended):**

```bash
cd apps/web
npx supabase db push
# or
npx supabase migration up
```

That runs all migrations in order, including 062 and 243, so you get every template.

**Manual run (e.g. in Supabase SQL editor):**

1. Run the contents of `apps/web/supabase/migrations/062_notification_templates.sql`.
2. Run the contents of `apps/web/supabase/migrations/243_seed_all_notification_templates.sql`.

Both 062 and 243 use `ON CONFLICT (key) DO UPDATE` or `WHERE NOT EXISTS`, so re-running is safe and updates existing rows.

---

## Full list of template keys (for reference)

**From 062 (base):**  
`booking_confirmed`, `booking_reminder_24h`, `booking_reminder_2h`, `booking_cancelled`, `booking_rescheduled`, `payment_successful`, `payment_failed`, `refund_processed`, `provider_booking_request`, `provider_payout_processed`, `review_reminder`, `password_reset`, `email_verification`, `account_suspended`, `welcome_message`, `promotion_available`, `service_completed`, `provider_new_review`, `travel_fee_applied`, `membership_renewal_reminder`, `membership_activated`, `gift_card_purchased`, `gift_card_received`, `new_message`, `support_ticket_created`, `support_ticket_updated`, `provider_onboarding_welcome`, `provider_profile_approved`, `provider_profile_rejected`, `provider_en_route_home`, `provider_arriving_soon_home`, `provider_arrived_home`, `home_service_location_details`, `home_service_location_required`, `home_service_location_changed`, `salon_directions`, `salon_arrival_reminder`, `customer_arrived_salon`, `salon_waiting_area`, `service_started`, `service_in_progress`, `service_almost_done`, `service_extended`, `provider_running_late`, `provider_arrived_early`, `provider_location_shared`, `provider_needs_directions`, `customer_running_late`, `customer_no_show`, `addon_added`, `addon_removed`, `service_upgrade_offered`, `booking_cancelled_by_customer`, `booking_cancelled_by_provider`, `booking_cancelled_emergency`, `booking_time_changed`, `booking_date_changed`, `payment_pending`, `payment_method_expired`, `partial_payment_received`, `invoice_generated`, `receipt_sent`, `provider_new_customer`, `provider_recurring_customer`, `provider_preferred_customer`, `provider_availability_changed`, `provider_holiday_mode`, `provider_holiday_mode_ending`, `provider_break_scheduled`, `loyalty_points_earned`, `loyalty_points_redeemed`, `loyalty_tier_upgraded`, `referral_bonus_earned`, `referral_code_used`, `service_package_purchased`, `service_package_expiring`, `service_package_expired`, `service_package_used`, `dispute_opened`, `dispute_resolved`, `complaint_filed`, `quality_issue_reported`, `safety_check_in`, `safety_alert`, `special_instructions_added`, `allergy_alert_provider`, `weather_alert`, `provider_earnings_summary`, `provider_payout_scheduled`, `provider_payout_failed`, `booking_waitlist_available`, `provider_recommendation`, `service_suggestion`, `booking_follow_up`, `thank_you_after_service`, `customer_custom_offer`

**From 243 (extras):**  
`provider_booking_cancelled`, `provider_booking_rescheduled`, `provider_suspended`, `provider_reactivated`, `provider_approved`, `subscription_upgraded`, `subscription_downgraded`, `subscription_cancelled`, `subscription_renewed`, `product_order_placed`, `product_order_confirmed`, `product_order_ready_collection`, `product_order_shipped`, `product_order_delivered`, `product_order_cancelled`, `product_return_requested`, `product_return_approved`, `product_return_rejected`, `product_return_refunded`

You can manage and edit these in the admin UI at **/admin/notification-templates**.
