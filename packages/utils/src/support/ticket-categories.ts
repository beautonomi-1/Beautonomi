/**
 * Support ticket categories — single source of truth for support_tickets.category.
 * Values are stable for reporting/filters.
 */

export type SupportTicketCategoryAudience = "customer" | "provider" | "both";

export type SupportContextType =
  | "booking"
  | "product_order"
  | "gift_card"
  | "payment"
  | "provider_onboarding"
  | "account"
  | "technical"
  | "other";

/** Labels for admin / ops UIs and i18n fallbacks. */
export const SUPPORT_CONTEXT_TYPE_OPTIONS: { value: SupportContextType; label: string }[] = [
  { value: "booking", label: "Booking" },
  { value: "product_order", label: "Product / ecommerce order" },
  { value: "gift_card", label: "Gift card" },
  { value: "payment", label: "Payment / refund" },
  { value: "provider_onboarding", label: "Provider onboarding" },
  { value: "account", label: "Account" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
];

export type SupportTicketPriorityPreset = "low" | "medium" | "high" | "urgent";

export type SupportTicketCategoryPreset = {
  priority?: SupportTicketPriorityPreset;
  subject?: string;
};

export type SupportTicketCategoryItem = {
  value: string;
  label: string;
  audience: SupportTicketCategoryAudience;
  contextType?: SupportContextType;
  preset?: SupportTicketCategoryPreset;
  /** When false, shown in admin/reports only (legacy DB values). */
  selectable?: boolean;
};

export type SupportTicketCategoryGroup = {
  id: string;
  label: string;
  description: string;
  iconKey: string;
  items: SupportTicketCategoryItem[];
};

/** @deprecated Use SupportTicketCategoryGroup — kept for grouped selects. */
export type TicketCategoryGroup = {
  label: string;
  items: { value: string; label: string }[];
};

export const SUPPORT_TICKET_CATEGORY_GROUPS_RICH: SupportTicketCategoryGroup[] = [
  {
    id: "account_security",
    label: "Account & security",
    description: "Sign-in, profile, privacy, and account access",
    iconKey: "person-circle",
    items: [
      { value: "account_sign_in", label: "Sign-in, password & access", audience: "both", contextType: "account" },
      { value: "account_verification", label: "Email / phone verification", audience: "both", contextType: "account" },
      { value: "account_profile", label: "Profile, name, photo, or email change", audience: "both", contextType: "account" },
      { value: "account_privacy_data", label: "Privacy, data export, or GDPR request", audience: "both", contextType: "account" },
      { value: "account_delete", label: "Delete or deactivate account", audience: "both", contextType: "account" },
      { value: "account_security", label: "Suspicious activity or hacked account", audience: "both", contextType: "account" },
    ],
  },
  {
    id: "bookings",
    label: "Bookings & appointments",
    description: "Scheduling, changes, quality, and waitlists",
    iconKey: "calendar",
    items: [
      { value: "booking_issue", label: "Booking details wrong or not visible", audience: "both", contextType: "booking" },
      { value: "booking_reschedule_cancel", label: "Reschedule, cancel, or refund request", audience: "both", contextType: "booking" },
      { value: "booking_provider_no_show", label: "Provider no-show or late arrival", audience: "customer", contextType: "booking" },
      { value: "marked_no_show_incorrectly", label: "I was marked as a no-show but I attended", audience: "customer", contextType: "booking" },
      { value: "booking_quality", label: "Service quality or didn’t match description", audience: "both", contextType: "booking" },
      { value: "booking_group", label: "Group booking or multiple clients", audience: "both", contextType: "booking" },
      { value: "booking_waitlist", label: "Waitlist or availability question", audience: "both", contextType: "booking" },
      { value: "booking_recurring", label: "Recurring appointment", audience: "both", contextType: "booking" },
    ],
  },
  {
    id: "payments",
    label: "Payments & billing",
    description: "Charges, refunds, invoices, and wallet",
    iconKey: "card",
    items: [
      { value: "payment_failed_charge", label: "Payment failed, declined, or wrong amount", audience: "both", contextType: "payment" },
      { value: "payment_refund", label: "Refund status or request", audience: "both", contextType: "payment" },
      { value: "payment_duplicate", label: "Duplicate charge or billing error", audience: "both", contextType: "payment" },
      { value: "payment_invoice_receipt", label: "Invoice, receipt, or tax document", audience: "both", contextType: "payment" },
      { value: "payment_subscription", label: "Subscription or recurring billing (provider)", audience: "both", contextType: "payment" },
      { value: "payment_gift_card", label: "Gift card purchase or redemption", audience: "both", contextType: "gift_card" },
      { value: "payment_tips_wallet", label: "Tips, wallet, or loyalty credits", audience: "both", contextType: "payment" },
      { value: "membership_billing", label: "Membership plan, credits, or renewal", audience: "customer", contextType: "payment" },
    ],
  },
  {
    id: "messaging_providers",
    label: "Messaging & providers",
    description: "Chat, listings, and provider conduct",
    iconKey: "chatbubbles",
    items: [
      { value: "messaging_provider_chat", label: "Chat with a provider (in-app messages)", audience: "both", contextType: "other" },
      { value: "provider_conduct", label: "Provider behaviour or professionalism", audience: "customer", contextType: "other" },
      { value: "client_conduct", label: "Client behaviour or client no-show", audience: "provider", contextType: "booking" },
      { value: "provider_listing", label: "Wrong services, prices, or location on listing", audience: "both", contextType: "other" },
      { value: "provider_verification", label: "Provider verification or badge", audience: "both", contextType: "other" },
      { value: "review_rating", label: "Review or rating", audience: "both", contextType: "other" },
    ],
  },
  {
    id: "products",
    label: "Products & delivery",
    description: "Orders, shipping, and returns",
    iconKey: "cube",
    items: [
      { value: "order_status_shipping", label: "Product order status or shipping", audience: "both", contextType: "product_order" },
      { value: "order_return_product", label: "Return, exchange, or damaged product", audience: "both", contextType: "product_order" },
      { value: "order_product_question", label: "Product question before purchase", audience: "customer", contextType: "product_order" },
    ],
  },
  {
    id: "tech",
    label: "App, website & notifications",
    description: "Bugs, apps, and notifications",
    iconKey: "phone-portrait",
    items: [
      { value: "tech_bug_error", label: "Error message, crash, or page won’t load", audience: "both", contextType: "technical" },
      { value: "tech_mobile_app", label: "Customer or provider mobile app issue", audience: "both", contextType: "technical" },
      { value: "tech_notifications", label: "Push, email, or SMS notifications", audience: "both", contextType: "technical" },
      { value: "tech_upload_media", label: "Photos, files, or attachments won’t upload", audience: "both", contextType: "technical" },
      { value: "tech_calendar_sync", label: "Calendar sync (Google, Apple, etc.)", audience: "both", contextType: "technical" },
    ],
  },
  {
    id: "safety",
    label: "Trust & safety",
    description: "Reports, fraud, and urgent safety",
    iconKey: "shield",
    items: [
      {
        value: "safety_report_user",
        label: "Report a user, harassment, or abuse",
        audience: "both",
        contextType: "other",
        preset: { priority: "high", subject: "Report a user or harassment" },
      },
      { value: "safety_fraud", label: "Fraud, scam, or suspicious listing", audience: "both", contextType: "other" },
      {
        value: "safety_emergency",
        label: "Urgent safety concern",
        audience: "both",
        contextType: "other",
        preset: { priority: "urgent", subject: "Urgent safety concern" },
      },
    ],
  },
  {
    id: "partners",
    label: "For beauty partners (providers)",
    description: "Payouts, dashboard, catalogue, and ads",
    iconKey: "storefront",
    items: [
      { value: "provider_payouts", label: "Payouts or bank account", audience: "provider", contextType: "payment" },
      { value: "provider_dashboard", label: "Dashboard, analytics, or staff access", audience: "provider", contextType: "other" },
      { value: "provider_catalog", label: "Services, add-ons, or pricing in catalogue", audience: "provider", contextType: "other" },
      { value: "provider_booking_settings", label: "Online booking, hours, or buffers", audience: "provider", contextType: "other" },
      { value: "provider_fees_commission", label: "Platform fees, commission, or invoices", audience: "provider", contextType: "payment" },
      { value: "provider_marketing_ads", label: "Ads, promotions, or visibility", audience: "provider", contextType: "other" },
      { value: "provider_onboarding", label: "Verification, KYB, or setup", audience: "provider", contextType: "provider_onboarding" },
      { value: "provider_staff_payroll", label: "Staff, shifts, or payroll", audience: "provider", contextType: "other" },
      { value: "terminal_onboarding", label: "Card terminal setup", audience: "provider", contextType: "payment" },
    ],
  },
  {
    id: "feedback",
    label: "Feedback & general",
    description: "Ideas, complaints, and general questions",
    iconKey: "bulb",
    items: [
      { value: "feedback_feature", label: "Feature idea or product feedback", audience: "both", contextType: "other" },
      { value: "feedback_complaint_platform", label: "Complaint about Beautonomi", audience: "both", contextType: "other" },
      { value: "feedback_accessibility", label: "Accessibility or assistive technology", audience: "both", contextType: "other" },
      { value: "partnership_press", label: "Partnership, press, or media", audience: "both", contextType: "other" },
      { value: "general_inquiry", label: "General question (not listed above)", audience: "both", contextType: "other" },
    ],
  },
  {
    id: "legacy",
    label: "Legacy",
    description: "Historical categories no longer offered in pickers",
    iconKey: "time",
    items: [{ value: "payments", label: "Payments (legacy)", audience: "provider", selectable: false }],
  },
];

/** Flat grouped list for native `<optgroup>` UIs (includes legacy). */
export const SUPPORT_TICKET_CATEGORY_GROUPS: TicketCategoryGroup[] = SUPPORT_TICKET_CATEGORY_GROUPS_RICH.map(
  (g) => ({
    label: g.label,
    items: g.items.map((i) => ({ value: i.value, label: i.label })),
  }),
);

type ItemWithGroup = SupportTicketCategoryItem & { groupId: string; groupLabel: string };

const _byValue = new Map<string, ItemWithGroup>();
for (const g of SUPPORT_TICKET_CATEGORY_GROUPS_RICH) {
  for (const item of g.items) {
    _byValue.set(item.value, { ...item, groupId: g.id, groupLabel: g.label });
  }
}

export const SUPPORT_TICKET_CATEGORY_VALUES = new Set(_byValue.keys());

export const SUPPORT_TICKET_DEFAULT_CATEGORY = "general_inquiry";

export const SUPPORT_TICKET_ALL_ITEMS: { value: string; label: string; group: string }[] =
  SUPPORT_TICKET_CATEGORY_GROUPS_RICH.flatMap((g) =>
    g.items.map((i) => ({ value: i.value, label: i.label, group: g.label })),
  );

export function isItemSelectable(item: SupportTicketCategoryItem): boolean {
  return item.selectable !== false;
}

export function audienceIncludes(
  itemAudience: SupportTicketCategoryAudience,
  viewer: SupportTicketCategoryAudience,
): boolean {
  if (viewer === "both") return true;
  if (itemAudience === "both") return true;
  return itemAudience === viewer;
}

export function getCategory(value: string | null | undefined): ItemWithGroup | null {
  if (!value || typeof value !== "string") return null;
  return _byValue.get(value.trim()) ?? null;
}

export function isValidSupportTicketCategory(value: string | undefined | null): boolean {
  if (!value || typeof value !== "string") return false;
  return SUPPORT_TICKET_CATEGORY_VALUES.has(value.trim());
}

export function isSelectableSupportTicketCategory(value: string | undefined | null): boolean {
  const item = getCategory(value);
  return item != null && isItemSelectable(item);
}

export function isSelectableForAudience(
  value: string | undefined | null,
  audience: SupportTicketCategoryAudience,
): boolean {
  const item = getCategory(value);
  if (!item || !isItemSelectable(item)) return false;
  return audienceIncludes(item.audience, audience);
}

/** Normalizes API input; falls back for legacy clients when category omitted. */
export function normalizeSupportTicketCategory(value: unknown): string {
  if (typeof value !== "string") return SUPPORT_TICKET_DEFAULT_CATEGORY;
  const t = value.trim();
  if (!t) return SUPPORT_TICKET_DEFAULT_CATEGORY;
  if (isValidSupportTicketCategory(t)) return t;
  return SUPPORT_TICKET_DEFAULT_CATEGORY;
}

export function humanizeCategoryValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function labelForSupportTicketCategory(value: string): string {
  const item = getCategory(value);
  if (item) return item.label;
  return humanizeCategoryValue(value);
}

export function groupLabelForSupportTicketCategory(value: string | null | undefined): string | null {
  const item = getCategory(value);
  return item?.groupLabel ?? null;
}

export function groupForCategory(value: string | null | undefined): SupportTicketCategoryGroup | null {
  const item = getCategory(value);
  if (!item) return null;
  return SUPPORT_TICKET_CATEGORY_GROUPS_RICH.find((g) => g.id === item.groupId) ?? null;
}

export function contextTypeForCategory(value: string | null | undefined): SupportContextType | null {
  return getCategory(value)?.contextType ?? null;
}

export function listGroupsForAudience(audience: SupportTicketCategoryAudience): SupportTicketCategoryGroup[] {
  return SUPPORT_TICKET_CATEGORY_GROUPS_RICH.filter((g) => {
    if (g.id === "legacy") return false;
    return g.items.some((i) => isItemSelectable(i) && audienceIncludes(i.audience, audience));
  })
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => isItemSelectable(i) && audienceIncludes(i.audience, audience)),
    }))
    .filter((g) => g.items.length > 0);
}

export function listCategoriesForAudience(audience: SupportTicketCategoryAudience): ItemWithGroup[] {
  return Array.from(_byValue.values()).filter((i) => isItemSelectable(i) && audienceIncludes(i.audience, audience));
}

export function searchCategories(
  query: string,
  audience: SupportTicketCategoryAudience,
): ItemWithGroup[] {
  const q = query.trim().toLowerCase();
  const pool = listCategoriesForAudience(audience);
  if (!q) return pool;
  return pool.filter(
    (i) =>
      i.label.toLowerCase().includes(q) ||
      i.value.toLowerCase().includes(q) ||
      i.groupLabel.toLowerCase().includes(q),
  );
}

export function resolveGroupFilter(idOrLabel: string): SupportTicketCategoryGroup | null {
  const raw = idOrLabel.trim();
  if (!raw) return null;
  const byId = SUPPORT_TICKET_CATEGORY_GROUPS_RICH.find((g) => g.id === raw);
  if (byId) return byId;
  const lower = raw.toLowerCase();
  return SUPPORT_TICKET_CATEGORY_GROUPS_RICH.find((g) => g.label.toLowerCase() === lower) ?? null;
}

export function supportTicketPresetFromCategory(category: string): SupportTicketCategoryPreset {
  const item = getCategory(category);
  if (item?.preset) return { ...item.preset };
  return {};
}

/** Admin / ingest: null allowed; legacy values allowed; unknown rejected. */
export function validateAdminCategoryValue(value: unknown): { ok: true; category: string | null } | { ok: false } {
  if (value == null || value === "") return { ok: true, category: null };
  if (typeof value !== "string") return { ok: false };
  const t = value.trim();
  if (!t) return { ok: true, category: null };
  if (!isValidSupportTicketCategory(t)) return { ok: false };
  return { ok: true, category: t };
}

/** User create: blank → general_inquiry; known selectable; legacy/unknown → reject. */
export function parseUserSubmittedCategory(value: unknown): { ok: true; category: string } | { ok: false; error: string } {
  if (value == null || (typeof value === "string" && !value.trim())) {
    return { ok: true, category: SUPPORT_TICKET_DEFAULT_CATEGORY };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Invalid category" };
  }
  const t = value.trim();
  if (!isSelectableSupportTicketCategory(t)) {
    return { ok: false, error: "Unknown or unavailable category" };
  }
  return { ok: true, category: t };
}

export function deriveSupportContextTypeForTicket(input: {
  category: string;
  supportContextId?: string | null;
  supportContextLabel?: string | null;
  clientContextType?: string | null;
}): string | null {
  const hasRef =
    Boolean(String(input.supportContextId ?? "").trim()) ||
    Boolean(String(input.supportContextLabel ?? "").trim());
  if (hasRef && input.clientContextType) {
    return input.clientContextType;
  }
  return contextTypeForCategory(input.category) ?? input.clientContextType ?? null;
}

export function supportTicketCategoryItemI18nKey(value: string): string {
  return `support.ticketCategories.items.${value.trim()}`;
}

export function supportTicketCategoryGroupI18nKey(groupId: string): string {
  return `support.ticketCategories.groups.${groupId.trim()}`;
}

export function supportTicketContextTypeI18nKey(value: SupportContextType): string {
  return `support.ticketCategories.contextTypes.${value}`;
}

export type SupportTicketCategoryTranslateFn = (
  key: string,
  options?: Record<string, string | number>,
) => string;

function resolveSupportTicketI18n(t: SupportTicketCategoryTranslateFn, key: string, fallback: string): string {
  const out = t(key);
  return out && out !== key ? out : fallback;
}

export function labelForSupportTicketCategoryI18n(value: string, t: SupportTicketCategoryTranslateFn): string {
  return resolveSupportTicketI18n(
    t,
    supportTicketCategoryItemI18nKey(value),
    labelForSupportTicketCategory(value),
  );
}

export function groupLabelForSupportTicketCategoryI18n(
  value: string | null | undefined,
  t: SupportTicketCategoryTranslateFn,
): string | null {
  const item = getCategory(value);
  if (!item) return null;
  return labelForSupportTicketGroupI18n(item.groupId, item.groupLabel, t);
}

export function labelForSupportTicketGroupI18n(
  groupId: string,
  fallbackLabel: string,
  t: SupportTicketCategoryTranslateFn,
): string {
  return resolveSupportTicketI18n(t, supportTicketCategoryGroupI18nKey(groupId), fallbackLabel);
}

export function labelForSupportContextTypeI18n(
  value: SupportContextType,
  t: SupportTicketCategoryTranslateFn,
): string {
  const opt = SUPPORT_CONTEXT_TYPE_OPTIONS.find((o) => o.value === value);
  return resolveSupportTicketI18n(
    t,
    supportTicketContextTypeI18nKey(value),
    opt?.label ?? value,
  );
}

/** Categories that must never enter assistant mode (human queue immediately). */
export function isSafetySupportCategory(category: string | null | undefined): boolean {
  return String(category ?? "").trim().startsWith("safety_");
}
