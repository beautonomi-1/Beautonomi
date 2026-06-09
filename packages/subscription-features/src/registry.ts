import type { FeatureCategoryDef } from "./types";

export const MARKETING_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

export const CALENDAR_PROVIDERS = [
  { value: "google", label: "Google Calendar" },
  { value: "outlook", label: "Outlook" },
  { value: "ical", label: "iCal" },
] as const;

export const REPORT_TYPES = [
  { value: "sales", label: "Sales" },
  { value: "bookings", label: "Bookings" },
  { value: "staff", label: "Staff" },
  { value: "clients", label: "Clients" },
  { value: "products", label: "Products" },
  { value: "payments", label: "Payments" },
  { value: "gift_cards", label: "Gift cards" },
  { value: "packages", label: "Packages" },
] as const;

/** All subscription feature category keys (top-level keys in subscription_plans.features). */
export const ALL_FEATURE_CATEGORY_KEYS = [
  "online_booking",
  "booking_limits",
  "staff_management",
  "multi_location",
  "chat_messages",
  "intake_forms",
  "service_resources",
  "recurring_appointments",
  "express_booking",
  "custom_requests",
  "packages",
  "gift_cards",
  "pos_walk_in",
  "marketing_campaigns",
  "marketing_automations",
  "staff_sms_notifications",
  "platform_ads",
  "advanced_analytics",
  "yoco_integration",
  "paystack_virtual_terminal",
  "calendar_sync",
] as const;

export type FeatureCategoryKey = (typeof ALL_FEATURE_CATEGORY_KEYS)[number];

/**
 * Canonical registry for admin plan editors, Zod validation, and gating defaults.
 * `freePlanDefault` on each field drives the generous free-tier seed.
 */
export const FEATURE_REGISTRY: FeatureCategoryDef[] = [
  {
    key: "online_booking",
    label: "Online booking",
    description: "Customer self-serve booking from your profile and links.",
    group: "core",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
    ],
  },
  {
    key: "booking_limits",
    label: "Booking volume limits",
    description: "Cap monthly appointments created on the platform.",
    group: "core",
    fields: [
      { key: "enabled", label: "Enforce monthly cap", type: "toggle", freePlanDefault: false },
      {
        key: "max_bookings_per_month",
        label: "Max bookings / month",
        type: "limit",
        freePlanDefault: null,
        generousDefault: 500,
      },
    ],
  },
  {
    key: "staff_management",
    label: "Team & staff",
    description: "Add staff members to your calendar and services.",
    group: "operations",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_staff_members",
        label: "Max staff members",
        type: "limit",
        freePlanDefault: 25,
        generousDefault: 25,
      },
    ],
  },
  {
    key: "multi_location",
    label: "Multiple locations",
    description: "Manage more than one salon or studio location.",
    group: "operations",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_locations",
        label: "Max locations",
        type: "limit",
        freePlanDefault: 10,
        generousDefault: 10,
      },
    ],
  },
  {
    key: "chat_messages",
    label: "In-app chat",
    description: "Messaging between providers and customers in the app.",
    group: "core",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_messages_per_month",
        label: "Max messages / month",
        type: "limit",
        freePlanDefault: 10000,
        generousDefault: 10000,
      },
      { key: "file_attachments", label: "File attachments", type: "toggle", freePlanDefault: true },
      { key: "group_chats", label: "Group chats", type: "toggle", freePlanDefault: true },
    ],
  },
  {
    key: "intake_forms",
    label: "Intake & consent forms",
    description: "Waiver, consent, and intake forms attached to services.",
    group: "operations",
    fields: [{ key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true }],
  },
  {
    key: "service_resources",
    label: "Service resources",
    description: "Rooms, chairs, and equipment tied to offerings.",
    group: "operations",
    fields: [{ key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true }],
  },
  {
    key: "recurring_appointments",
    label: "Recurring appointments",
    description: "Repeating booking patterns for regular clients.",
    group: "core",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      { key: "advanced_patterns", label: "Advanced patterns", type: "toggle", freePlanDefault: true },
    ],
  },
  {
    key: "express_booking",
    label: "Express booking links",
    description: "Shareable quick-book links for specific services.",
    group: "core",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_links",
        label: "Max active links",
        type: "limit",
        freePlanDefault: 50,
        generousDefault: 50,
      },
    ],
  },
  {
    key: "custom_requests",
    label: "Custom requests & offers",
    description: "Let customers request bespoke services; send custom offers.",
    group: "core",
    fields: [{ key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true }],
  },
  {
    key: "packages",
    label: "Service packages",
    description: "Bundle services into multi-visit packages.",
    group: "core",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_packages",
        label: "Max packages",
        type: "limit",
        freePlanDefault: 100,
        generousDefault: 100,
      },
    ],
  },
  {
    key: "gift_cards",
    label: "Gift cards",
    description: "Sell and redeem gift cards in person and online.",
    group: "payments",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_active_cards",
        label: "Max active gift cards",
        type: "limit",
        freePlanDefault: null,
        generousDefault: null,
      },
    ],
  },
  {
    key: "pos_walk_in",
    label: "POS & walk-in sales",
    description: "Record walk-in appointments and retail sales at the front desk.",
    group: "payments",
    fields: [{ key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true }],
  },
  {
    key: "marketing_campaigns",
    label: "Marketing campaigns",
    description: "Email, SMS, and WhatsApp broadcast campaigns.",
    group: "marketing",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "channels",
        label: "Channels",
        type: "multiselect",
        options: [...MARKETING_CHANNELS],
        freePlanDefault: ["email", "sms", "whatsapp"],
      },
      {
        key: "max_campaigns_per_month",
        label: "Max campaigns / month",
        type: "limit",
        freePlanDefault: 100,
        generousDefault: 100,
      },
      {
        key: "max_recipients_per_campaign",
        label: "Max recipients / campaign",
        type: "limit",
        freePlanDefault: 5000,
        generousDefault: 5000,
      },
      { key: "advanced_segmentation", label: "Advanced segmentation", type: "toggle", freePlanDefault: true },
      { key: "custom_integrations", label: "Custom SendGrid/Twilio", type: "toggle", freePlanDefault: true },
    ],
  },
  {
    key: "marketing_automations",
    label: "Marketing automations",
    description: "Triggered journeys (birthday, win-back, etc.).",
    group: "marketing",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_automations",
        label: "Max automations",
        type: "limit",
        freePlanDefault: 50,
        generousDefault: 50,
      },
    ],
  },
  {
    key: "staff_sms_notifications",
    label: "Staff SMS notifications",
    description: "Operational SMS alerts to team members.",
    group: "marketing",
    fields: [{ key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true }],
  },
  {
    key: "platform_ads",
    label: "Platform ads",
    description: "Promoted placement in customer discovery (pay-per-campaign).",
    group: "marketing",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "included_credit_zar_per_month",
        label: "Included ads credit (ZAR / month)",
        type: "limit",
        freePlanDefault: 100,
        generousDefault: 100,
      },
      { key: "note", label: "Internal note", type: "text", freePlanDefault: "" },
    ],
  },
  {
    key: "advanced_analytics",
    label: "Reports & analytics",
    description: "Business reports, exports, and API access.",
    group: "analytics",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      { key: "basic_reports", label: "Basic reports", type: "toggle", freePlanDefault: true },
      { key: "advanced_reports", label: "Advanced reports", type: "toggle", freePlanDefault: true },
      { key: "data_export", label: "Data export", type: "toggle", freePlanDefault: true },
      { key: "api_access", label: "API access", type: "toggle", freePlanDefault: true },
      {
        key: "report_types",
        label: "Report types",
        type: "multiselect",
        options: [...REPORT_TYPES],
        freePlanDefault: REPORT_TYPES.map((r) => r.value),
      },
    ],
  },
  {
    key: "yoco_integration",
    label: "Yoco POS",
    description: "In-person card payments via Yoco devices.",
    group: "payments",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_devices",
        label: "Max devices",
        type: "limit",
        freePlanDefault: 10,
        generousDefault: 10,
      },
      { key: "advanced_features", label: "Advanced Yoco features", type: "toggle", freePlanDefault: true },
    ],
  },
  {
    key: "paystack_virtual_terminal",
    label: "Paystack Virtual Terminal",
    description: "Paystack terminal collection for in-person payments.",
    group: "payments",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "max_terminals",
        label: "Max terminals",
        type: "limit",
        freePlanDefault: null,
        generousDefault: null,
      },
      { key: "per_location_terminals", label: "Per-location terminals", type: "toggle", freePlanDefault: true },
      { key: "advanced_reconciliation", label: "Advanced reconciliation", type: "toggle", freePlanDefault: true },
      { key: "split_settlement", label: "Split settlement", type: "toggle", freePlanDefault: true },
    ],
  },
  {
    key: "calendar_sync",
    label: "Calendar sync",
    description: "Two-way sync with Google, Outlook, and iCal.",
    group: "integrations",
    fields: [
      { key: "enabled", label: "Enabled", type: "toggle", freePlanDefault: true },
      {
        key: "providers",
        label: "Providers",
        type: "multiselect",
        options: [...CALENDAR_PROVIDERS],
        freePlanDefault: CALENDAR_PROVIDERS.map((p) => p.value),
      },
      { key: "api_access", label: "Bidirectional API access", type: "toggle", freePlanDefault: true },
    ],
  },
];

export const FEATURE_REGISTRY_BY_KEY = Object.fromEntries(
  FEATURE_REGISTRY.map((c) => [c.key, c]),
) as Record<FeatureCategoryKey, FeatureCategoryDef>;
