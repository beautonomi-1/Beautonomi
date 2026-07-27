/**
 * Classification audit for every known notification template key seeded in
 * migrations. Marketing keys must stay marketing; everything else must-deliver.
 */
import { describe, expect, it } from "vitest";
import {
  isMarketingPushTemplate,
  isMustDeliverPushTemplate,
} from "@/lib/notifications/must-deliver-push";

/** Keys from 062_notification_templates.sql */
const SEED_062_TEMPLATE_KEYS = [
  "booking_confirmed",
  "booking_reminder_24h",
  "booking_reminder_2h",
  "booking_cancelled",
  "booking_rescheduled",
  "payment_successful",
  "payment_failed",
  "refund_processed",
  "provider_booking_request",
  "provider_payout_processed",
  "review_reminder",
  "password_reset",
  "email_verification",
  "account_suspended",
  "welcome_message",
  "promotion_available",
  "service_completed",
  "provider_new_review",
  "travel_fee_applied",
  "membership_renewal_reminder",
  "membership_activated",
  "gift_card_purchased",
  "gift_card_received",
  "new_message",
  "support_ticket_created",
  "support_ticket_updated",
  "provider_onboarding_welcome",
  "provider_profile_approved",
  "provider_profile_rejected",
  "provider_en_route_home",
  "provider_arriving_soon_home",
  "provider_arrived_home",
  "home_service_location_details",
  "home_service_location_required",
  "home_service_location_changed",
  "salon_directions",
  "salon_arrival_reminder",
  "customer_arrived_salon",
  "salon_waiting_area",
  "service_started",
  "service_in_progress",
  "service_almost_done",
  "service_extended",
  "provider_running_late",
  "provider_arrived_early",
  "provider_location_shared",
  "provider_needs_directions",
  "customer_running_late",
  "customer_no_show",
  "addon_added",
  "addon_removed",
  "service_upgrade_offered",
  "booking_cancelled_by_customer",
  "booking_cancelled_by_provider",
  "booking_cancelled_emergency",
  "booking_time_changed",
  "booking_date_changed",
  "payment_pending",
  "payment_method_expired",
  "partial_payment_received",
  "invoice_generated",
  "receipt_sent",
  "provider_new_customer",
  "provider_recurring_customer",
  "provider_preferred_customer",
  "provider_availability_changed",
  "provider_holiday_mode",
  "provider_holiday_mode_ending",
  "provider_break_scheduled",
  "loyalty_points_earned",
  "loyalty_points_redeemed",
  "loyalty_tier_upgraded",
  "referral_bonus_earned",
  "referral_code_used",
  "service_package_purchased",
  "service_package_expiring",
  "service_package_expired",
  "service_package_used",
  "dispute_opened",
  "dispute_resolved",
  "complaint_filed",
  "quality_issue_reported",
  "safety_check_in",
  "safety_alert",
  "special_instructions_added",
  "allergy_alert_provider",
  "weather_alert",
  "provider_earnings_summary",
  "provider_payout_scheduled",
  "provider_payout_failed",
  "booking_waitlist_available",
  "provider_recommendation",
  "service_suggestion",
  "booking_follow_up",
  "thank_you_after_service",
  "customer_custom_offer",
] as const;

/** Additional keys from later migrations */
const LATER_MIGRATION_TEMPLATE_KEYS = [
  "customer_custom_offer_withdrawn",
  "customer_custom_offer_expired",
  "provider_custom_offer_declined",
  "customer_new_message",
  "provider_new_message",
  "additional_charge_requested",
  "product_order_placed",
  "product_order_confirmed",
  "product_order_ready_collection",
  "product_order_shipped",
  "product_order_delivered",
  "product_order_cancelled",
  "product_order_refunded",
  "product_return_requested",
  "product_return_approved",
  "product_return_rejected",
  "product_return_refunded",
  "provider_suspended",
  "provider_reactivated",
  "provider_approved",
  "subscription_upgraded",
  "subscription_downgraded",
  "subscription_cancelled",
  "subscription_renewed",
  "subscription_receipt",
  "order_confirmation",
  "rebook_reminder",
  "account_inactivity_archive_warning",
  "membership_win_back",
  "provider_membership_cancelled",
  "abandoned_booking_reminder",
] as const;

/** Explicit opt-in marketing / broadcast keys only */
const EXPECTED_MARKETING_KEYS = new Set([
  "welcome_message",
  "promotion_available",
  "referral_bonus_earned",
  "referral_code_used",
  "provider_recommendation",
  "admin_broadcast",
  "provider_broadcast",
  "marketing_email",
  "marketing_campaign",
  "marketing_automation",
  "loyalty_reward_available",
]);

const ALL_KNOWN_TEMPLATE_KEYS = [
  ...SEED_062_TEMPLATE_KEYS,
  ...LATER_MIGRATION_TEMPLATE_KEYS,
];

describe("notification template key classification audit", () => {
  it("classifies every known seeded template key without ambiguity", () => {
    for (const key of ALL_KNOWN_TEMPLATE_KEYS) {
      const marketing = isMarketingPushTemplate(key);
      const mustDeliver = isMustDeliverPushTemplate(key);
      expect(marketing).not.toBe(mustDeliver);
    }
  });

  it("marks explicit marketing keys as marketing (not must-deliver)", () => {
    for (const key of EXPECTED_MARKETING_KEYS) {
      expect(isMarketingPushTemplate(key)).toBe(true);
      expect(isMustDeliverPushTemplate(key)).toBe(false);
    }
  });

  it("marks transactional lifecycle keys as must-deliver even when substring overlaps marketing", () => {
    const transactionalOverrides = [
      "gift_card_purchased",
      "gift_card_received",
      "loyalty_points_earned",
      "loyalty_points_redeemed",
      "loyalty_tier_upgraded",
      "customer_custom_offer",
      "customer_custom_offer_withdrawn",
      "customer_custom_offer_expired",
      "provider_custom_offer_declined",
      "membership_activated",
      "membership_renewal_reminder",
      "service_package_purchased",
    ];
    for (const key of transactionalOverrides) {
      expect(isMustDeliverPushTemplate(key)).toBe(true);
      expect(isMarketingPushTemplate(key)).toBe(false);
    }
  });

  it("marks all non-marketing seeded keys as must-deliver", () => {
    const nonMarketing = ALL_KNOWN_TEMPLATE_KEYS.filter(
      (k) => !EXPECTED_MARKETING_KEYS.has(k),
    );
    for (const key of nonMarketing) {
      expect(isMustDeliverPushTemplate(key)).toBe(true);
    }
  });

  it("classifies direct send types used outside templates", () => {
    expect(isMustDeliverPushTemplate("custom_offer")).toBe(true);
    expect(isMarketingPushTemplate("admin_broadcast")).toBe(true);
  });
});
