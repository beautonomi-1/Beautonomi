/**
 * Support ticket categories — must match server
 * `normalizeSupportTicketCategory` / `support_tickets.category`.
 * @see apps/web/src/lib/support/ticket-categories.ts
 */

export type TicketCategoryGroup = {
  label: string;
  items: { value: string; label: string }[];
};

export const SUPPORT_TICKET_CATEGORY_GROUPS: TicketCategoryGroup[] = [
  {
    label: "Account & security",
    items: [
      { value: "account_sign_in", label: "Sign-in, password & access" },
      { value: "account_verification", label: "Email / phone verification" },
      { value: "account_profile", label: "Profile, name, photo, or email change" },
      { value: "account_privacy_data", label: "Privacy, data export, or GDPR request" },
      { value: "account_delete", label: "Delete or deactivate account" },
      { value: "account_security", label: "Suspicious activity or hacked account" },
    ],
  },
  {
    label: "Bookings & appointments",
    items: [
      { value: "booking_issue", label: "Booking details wrong or not visible" },
      { value: "booking_reschedule_cancel", label: "Reschedule, cancel, or refund request" },
      { value: "booking_provider_no_show", label: "Provider no-show or late arrival" },
      { value: "booking_quality", label: "Service quality or didn’t match description" },
      { value: "booking_group", label: "Group booking or multiple clients" },
      { value: "booking_waitlist", label: "Waitlist or availability question" },
    ],
  },
  {
    label: "Payments & billing",
    items: [
      { value: "payment_failed_charge", label: "Payment failed, declined, or wrong amount" },
      { value: "payment_refund", label: "Refund status or request" },
      { value: "payment_duplicate", label: "Duplicate charge or billing error" },
      { value: "payment_invoice_receipt", label: "Invoice, receipt, or tax document" },
      { value: "payment_subscription", label: "Subscription or recurring billing (provider)" },
      { value: "payment_gift_card", label: "Gift card purchase or redemption" },
      { value: "payment_tips_wallet", label: "Tips, wallet, or loyalty credits" },
    ],
  },
  {
    label: "Messaging & providers",
    items: [
      { value: "messaging_provider_chat", label: "Chat with a provider (in-app messages)" },
      { value: "provider_conduct", label: "Provider behaviour or professionalism" },
      { value: "provider_listing", label: "Wrong services, prices, or location on listing" },
      { value: "provider_verification", label: "Provider verification or badge" },
    ],
  },
  {
    label: "Products & delivery",
    items: [
      { value: "order_status_shipping", label: "Product order status or shipping" },
      { value: "order_return_product", label: "Return, exchange, or damaged product" },
      { value: "order_product_question", label: "Product question before purchase" },
    ],
  },
  {
    label: "App, website & notifications",
    items: [
      { value: "tech_bug_error", label: "Error message, crash, or page won’t load" },
      { value: "tech_mobile_app", label: "Customer or provider mobile app issue" },
      { value: "tech_notifications", label: "Push, email, or SMS notifications" },
      { value: "tech_upload_media", label: "Photos, files, or attachments won’t upload" },
      { value: "tech_calendar_sync", label: "Calendar sync (Google, Apple, etc.)" },
    ],
  },
  {
    label: "Trust & safety",
    items: [
      { value: "safety_report_user", label: "Report a user, harassment, or abuse" },
      { value: "safety_fraud", label: "Fraud, scam, or suspicious listing" },
      { value: "safety_emergency", label: "Urgent safety concern" },
    ],
  },
  {
    label: "For beauty partners (providers)",
    items: [
      { value: "provider_payouts", label: "Payouts, bank account, or Paystack" },
      { value: "provider_dashboard", label: "Dashboard, analytics, or staff access" },
      { value: "provider_catalog", label: "Services, add-ons, or pricing in catalogue" },
      { value: "provider_booking_settings", label: "Online booking, hours, or buffers" },
      { value: "provider_fees_commission", label: "Platform fees, commission, or invoices" },
      { value: "provider_marketing_ads", label: "Ads, promotions, or visibility" },
    ],
  },
  {
    label: "Feedback & general",
    items: [
      { value: "feedback_feature", label: "Feature idea or product feedback" },
      { value: "feedback_complaint_platform", label: "Complaint about Beautonomi" },
      { value: "feedback_accessibility", label: "Accessibility or assistive technology" },
      { value: "partnership_press", label: "Partnership, press, or media" },
      { value: "general_inquiry", label: "General question (not listed above)" },
    ],
  },
];

export function labelForSupportTicketCategory(value: string): string {
  for (const g of SUPPORT_TICKET_CATEGORY_GROUPS) {
    const found = g.items.find((i) => i.value === value);
    if (found) return found.label;
  }
  return value.replace(/_/g, " ");
}

/** Flat list for search / compact UIs */
export const SUPPORT_TICKET_ALL_ITEMS: { value: string; label: string; group: string }[] =
  SUPPORT_TICKET_CATEGORY_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

export const SUPPORT_TICKET_DEFAULT_CATEGORY = "general_inquiry";

export const SUPPORT_TICKET_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;
