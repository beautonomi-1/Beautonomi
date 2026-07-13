import { templateKeyToPreferenceSection } from "@/lib/notifications/customer-notification-channels";

/**
 * Ephemeral / silent template keys that must NOT participate in durable retry
 * or reconcile. badge_sync is a best-effort OS-badge update: it carries no
 * visible content, is superseded by the next send, and re-delivering a stale
 * count is both useless and the root cause of the reconcile feedback loop.
 */
export const NON_RECONCILABLE_PUSH_TEMPLATE_KEYS = new Set<string>([
  "badge_sync",
]);

/**
 * Explicit marketing / promotional template keys. These are the only pushes
 * that respect customer preference gating and quiet hours, and they are
 * excluded from durable retry + reconcile re-delivery.
 *
 * Everything else is treated as must-deliver (same guarantees as custom offer
 * / admin broadcast transport, plus retry + reconcile safety nets).
 */
export const MARKETING_PUSH_TEMPLATE_KEYS = new Set<string>([
  "admin_broadcast",
  "provider_broadcast",
  "promotion_available",
  "marketing_email",
  "marketing_campaign",
  "marketing_automation",
]);

const MARKETING_PREFERENCE_SECTIONS = new Set([
  "inspiration_and_offers",
  "news_and_programs",
]);

/** Substrings that identify opt-in promotional content (not transactional). */
const MARKETING_KEY_FRAGMENTS = ["marketing_campaign", "marketing_promo"] as const;

/**
 * Lifecycle keys that share marketing preference-section substrings (gift_card,
 * loyalty, welcome_message) but are transactional and must reach the device.
 */
const TRANSACTIONAL_PUSH_OVERRIDES = new Set<string>([
  "gift_card_purchased",
  "gift_card_received",
  "loyalty_points_earned",
  "loyalty_points_redeemed",
  "loyalty_tier_upgraded",
  "membership_activated",
  "membership_renewal_reminder",
  "service_package_purchased",
  "service_package_expiring",
  "service_package_expired",
  "service_package_used",
  "customer_custom_offer",
  "customer_custom_offer_withdrawn",
  "customer_custom_offer_expired",
  "customer_custom_offer_updated",
  "customer_custom_request_declined",
  "customer_custom_request_expired",
  "provider_custom_offer_declined",
  "provider_custom_offer_changes_requested",
  "provider_custom_request_expired",
]);

/** Prefixes for transactional keys that must not inherit marketing classification. */
const TRANSACTIONAL_KEY_PREFIXES = ["gift_card_", "loyalty_points_", "loyalty_tier_"] as const;

function isTransactionalPushOverride(key: string): boolean {
  if (TRANSACTIONAL_PUSH_OVERRIDES.has(key)) return true;
  return TRANSACTIONAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * True when a template key represents promotional / opt-in marketing push.
 * Marketing pushes still send when explicitly requested; they just do not
 * bypass preferences, quiet hours, or get automatic retry/reconcile.
 */
export function isMarketingPushTemplate(templateKey: string): boolean {
  const key = templateKey.trim().toLowerCase();
  if (!key) return false;
  if (isTransactionalPushOverride(key)) return false;
  if (MARKETING_PUSH_TEMPLATE_KEYS.has(key)) return true;
  if (MARKETING_KEY_FRAGMENTS.some((frag) => key.includes(frag))) return true;
  return MARKETING_PREFERENCE_SECTIONS.has(templateKeyToPreferenceSection(key));
}

/**
 * Transactional / lifecycle pushes that must reach the device: bypass
 * preference + quiet-hours gating and participate in retry + reconcile.
 *
 * Explicitly excludes ephemeral/silent templates (badge_sync) that must never
 * enter the durable retry + reconcile cycle — re-delivering a stale badge
 * count is the root cause of the reconcile feedback loop.
 */
export function isMustDeliverPushTemplate(templateKey: string): boolean {
  const key = templateKey.trim().toLowerCase();
  if (NON_RECONCILABLE_PUSH_TEMPLATE_KEYS.has(key)) return false;
  return !isMarketingPushTemplate(templateKey);
}

/** Resolve a stable template key from push payload data for retry/reconcile. */
export function resolvePushTemplateKey(
  data: Record<string, unknown> | null | undefined,
  fallbackType?: string | null,
): string | null {
  const fromData = data?.template_key;
  if (typeof fromData === "string" && fromData.trim()) return fromData.trim();
  const fromType = data?.type;
  if (typeof fromType === "string" && fromType.trim()) return fromType.trim();
  if (typeof fallbackType === "string" && fallbackType.trim()) return fallbackType.trim();
  return null;
}
