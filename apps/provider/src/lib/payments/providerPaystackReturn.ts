/**
 * Shared helpers for provider Paystack return URLs and post-payment provisioning.
 *
 * Paystack's `callback_url` only accepts HTTPS and our auth-session prefix must
 * match the Paystack redirect prefix (otherwise `WebBrowser.openAuthSessionAsync`
 * never resolves with `outcome: "success"`). These helpers keep ads + subscription
 * flows aligned with that contract and provide a single place to drive the
 * post-payment "provisioning" UX (poll until campaign / subscription is live).
 *
 * §Provider-paystack-audit 2026-05.
 */
import { api } from "@/lib/api-client";
import { getWebProviderBaseUrl } from "@/lib/web-url";

const trimSlash = (s: string) => s.replace(/\/$/, "");

export const ADS_PAYMENT_RETURN_PATH = "/provider/settings/ads/payment-return";
export const SUBSCRIPTION_RETURN_PATH = "/provider/subscription";

/** Base HTTPS URL for provider Paystack returns (web origin). */
export function getProviderPaystackReturnBaseUrl(): string {
  return trimSlash(getWebProviderBaseUrl());
}

/** Full HTTPS Paystack return URL for the ads flow (used as `returnUrl` for openAuthSessionAsync). */
export function getAdsPaystackReturnUrl(): string {
  return `${getProviderPaystackReturnBaseUrl()}${ADS_PAYMENT_RETURN_PATH}`;
}

/** Full HTTPS Paystack return URL for the subscription flow. */
export function getSubscriptionPaystackReturnUrl(): string {
  return `${getProviderPaystackReturnBaseUrl()}${SUBSCRIPTION_RETURN_PATH}`;
}

type MatchOpts = { success?: boolean; cancelled?: boolean };

function tryParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * True if `url` is a provider ads payment-return URL (HTTPS bridge OR native deep link).
 * Accepts:
 *   - HTTPS  /provider/settings/ads/payment-return
 *   - Deep   provider://settings/ads-payment-return  (host=settings, pathname=/ads-payment-return)
 *   - Expo   exp://host:port/--/settings/ads-payment-return
 */
export function matchesAdsPaystackReturnUrl(url: string, opts: MatchOpts = {}): boolean {
  const u = tryParseUrl(url);
  if (!u) return false;
  const isAdsPath =
    u.pathname.includes(ADS_PAYMENT_RETURN_PATH) ||
    u.pathname.includes("ads-payment-return") ||
    (u.host === "settings" && u.pathname.includes("ads-payment-return"));
  if (!isAdsPath) return false;
  if (opts.success && u.searchParams.get("success") !== "1") return false;
  if (opts.cancelled && u.searchParams.get("cancelled") !== "1") return false;
  return true;
}

/**
 * True if `url` is a provider subscription Paystack-return URL.
 * Accepts:
 *   - HTTPS  /provider/subscription?payment_success=true&...
 *   - Deep   provider://settings/subscription-payment-return
 *   - Expo   exp://host:port/--/settings/subscription-payment-return
 */
export function matchesSubscriptionPaystackReturnUrl(url: string, opts: MatchOpts = {}): boolean {
  const u = tryParseUrl(url);
  if (!u) return false;
  const isSubPath =
    u.pathname.includes(SUBSCRIPTION_RETURN_PATH) ||
    u.pathname.includes("subscription-payment-return") ||
    (u.host === "settings" && u.pathname.includes("subscription-payment-return"));
  if (!isSubPath) return false;
  if (opts.success && u.searchParams.get("payment_success") !== "true") return false;
  if (opts.cancelled && u.searchParams.get("payment_cancelled") !== "1") return false;
  return true;
}

// ─── Provisioning polls ────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type PollOptions = {
  /** Total poll attempts. Defaults to 6. */
  maxAttempts?: number;
  /** Delay between attempts (ms). Defaults to 1500. */
  delayMs?: number;
};

export type AdsCampaignSnapshot = {
  id: string;
  status: string;
  budget: number;
  spent?: number;
  billing_model?: string;
  duration_days?: number | null;
  pack_impressions?: number | null;
  end_at?: string | null;
};

export type CampaignProvisionedResult =
  | { state: "provisioned"; campaign: AdsCampaignSnapshot }
  | { state: "pending"; campaign: AdsCampaignSnapshot | null }
  | { state: "unknown" };

function isCampaignProvisioned(c: AdsCampaignSnapshot | null | undefined): boolean {
  if (!c) return false;
  return c.status === "active" && Number(c.budget) > 0;
}

/**
 * Poll `/api/provider/ads/campaigns` until the named campaign reads `status: active`
 * with a positive budget (the success state surfaced by `handleAdsBudgetOrderSuccess`).
 * Falls back to "pending" so the UI can show a soft-success message instead of
 * pretending the campaign is live before the webhook lands.
 */
export async function pollCampaignProvisioned(
  campaignId: string,
  opts: PollOptions = {},
): Promise<CampaignProvisionedResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 6);
  const delayMs = Math.max(0, opts.delayMs ?? 1500);
  let lastCampaign: AdsCampaignSnapshot | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await api.get<AdsCampaignSnapshot[] | { data: AdsCampaignSnapshot[] }>(
        "/api/provider/ads/campaigns",
      );
      if (!res.error) {
        const list: AdsCampaignSnapshot[] = Array.isArray(res.data)
          ? res.data
          : Array.isArray((res.data as { data?: AdsCampaignSnapshot[] } | null)?.data)
            ? ((res.data as { data: AdsCampaignSnapshot[] }).data)
            : [];
        const match = list.find((c) => c?.id === campaignId) ?? null;
        if (match) lastCampaign = match;
        if (isCampaignProvisioned(match)) {
          return { state: "provisioned", campaign: match as AdsCampaignSnapshot };
        }
      }
    } catch {
      // ignore; we'll retry below
    }
    if (attempt < maxAttempts) await sleep(delayMs);
  }
  if (lastCampaign) return { state: "pending", campaign: lastCampaign };
  return { state: "unknown" };
}

export type SubscriptionSnapshot = {
  status?: string | null;
  expires_at?: string | null;
  plan?: { name?: string | null } | null;
  latest_order?: { id?: string; status?: string | null } | null;
};

export type SubscriptionProvisionedResult =
  | { state: "provisioned"; subscription: SubscriptionSnapshot }
  | { state: "pending"; subscription: SubscriptionSnapshot | null }
  | { state: "unknown" };

function isSubscriptionProvisioned(
  sub: SubscriptionSnapshot | null | undefined,
  expectedOrderId?: string | null,
): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (expectedOrderId && sub.latest_order?.id && sub.latest_order.id !== expectedOrderId) {
    // subscription is active but not against the order we just paid; keep waiting
    return false;
  }
  if (sub.latest_order && sub.latest_order.status && sub.latest_order.status !== "paid") {
    return false;
  }
  return true;
}

/**
 * Poll `/api/provider/subscription` until the plan reads `status: active`
 * (matching `handleProviderSubscriptionOrderSuccess`).
 */
export async function pollSubscriptionProvisioned(
  opts: PollOptions & { orderId?: string | null } = {},
): Promise<SubscriptionProvisionedResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 6);
  const delayMs = Math.max(0, opts.delayMs ?? 1500);
  let lastSub: SubscriptionSnapshot | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await api.get<SubscriptionSnapshot | { data: SubscriptionSnapshot }>(
        "/api/provider/subscription",
      );
      if (!res.error) {
        const sub: SubscriptionSnapshot | null =
          (res.data && typeof res.data === "object" && "status" in (res.data as object)
            ? (res.data as SubscriptionSnapshot)
            : ((res.data as { data?: SubscriptionSnapshot } | null)?.data ?? null));
        if (sub) lastSub = sub;
        if (isSubscriptionProvisioned(sub, opts.orderId)) {
          return { state: "provisioned", subscription: sub as SubscriptionSnapshot };
        }
      }
    } catch {
      // retry
    }
    if (attempt < maxAttempts) await sleep(delayMs);
  }
  if (lastSub) return { state: "pending", subscription: lastSub };
  return { state: "unknown" };
}

// ─── Success copy helpers ──────────────────────────────────────────────────

export type AdsSuccessCopy = { title: string; body: string };

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatCount(n: number): string {
  try {
    return new Intl.NumberFormat(undefined).format(n);
  } catch {
    return String(n);
  }
}

/** Model-specific success copy for the Ads list confirmation card. */
export function adsSuccessCopy(
  campaign: AdsCampaignSnapshot,
  currency: string,
): AdsSuccessCopy {
  const budget = Number(campaign.budget ?? 0);
  if (campaign.billing_model === "time_based") {
    const days = Number(campaign.duration_days ?? 0);
    const dayLabel = days === 1 ? "day" : "days";
    return {
      title: "Ad funded and live",
      body: days
        ? `Your sponsored placement is active for ${days} ${dayLabel}.`
        : "Your sponsored placement is now active.",
    };
  }
  if (campaign.billing_model === "impression_pack") {
    const impressions = Number(campaign.pack_impressions ?? 0);
    return {
      title: "Impression pack funded",
      body: impressions
        ? `${formatCount(impressions)} impressions are ready to deliver.`
        : "Your impression pack is now active.",
    };
  }
  return {
    title: "Ad budget loaded",
    body: budget > 0
      ? `${formatMoney(budget, currency)} budget loaded — your campaign is active.`
      : "Your campaign is active.",
  };
}

export function adsPendingCopy(): AdsSuccessCopy {
  return {
    title: "Payment received",
    body: "We're activating your campaign now. Pull to refresh in a moment if it doesn't appear immediately.",
  };
}

export function adsFailedCopy(message?: string | null): AdsSuccessCopy {
  return {
    title: "Payment wasn't completed",
    body: message?.trim()
      ? message
      : "Try again from the campaign card, or cancel the draft if you no longer want it.",
  };
}

export type SubscriptionSuccessCopy = { title: string; body: string };

export function subscriptionSuccessCopy(sub: SubscriptionSnapshot): SubscriptionSuccessCopy {
  const planName = sub.plan?.name?.trim() || "Your plan";
  const expires = sub.expires_at ? new Date(sub.expires_at) : null;
  const expiryStr = expires && !Number.isNaN(expires.getTime())
    ? expires.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;
  return {
    title: `${planName} is active`,
    body: expiryStr
      ? `Renews on ${expiryStr}. You're all set.`
      : "Subscription activated. You're all set.",
  };
}

export function subscriptionPendingCopy(): SubscriptionSuccessCopy {
  return {
    title: "Payment received",
    body: "Your plan will activate within a few minutes once Paystack confirms with your bank.",
  };
}

export function subscriptionFailedCopy(message?: string | null): SubscriptionSuccessCopy {
  return {
    title: "Payment wasn't completed",
    body: message?.trim()
      ? message
      : "If you were charged, your plan will activate when the payment lands. Otherwise please try again.",
  };
}

// ─── Deep links & checkout review builders ─────────────────────────────────

export type AdsCheckoutReviewData = {
  heading: string;
  title: string;
  subtitle?: string;
  lineItems: { label: string; value: string }[];
  benefits: string[];
  total: string;
  confirmLabel?: string;
};

type RetryCheckoutCampaign = {
  billing_model?: string;
  budget?: number;
  duration_days?: number | null;
  pack_impressions?: number | null;
  latest_budget_order?: { amount?: number; currency?: string | null } | null;
};

function adsModelHeading(billingModel?: string): string {
  if (billingModel === "time_based") return "Time boost";
  if (billingModel === "impression_pack") return "Impression pack";
  return "CPC budget";
}

function adsModelBenefits(billingModel?: string): string[] {
  if (billingModel === "time_based") {
    return [
      "Sponsored placement for the full boost period",
      "Predictable flat price — no per-click charges",
      "Goes live only after payment is verified",
    ];
  }
  if (billingModel === "impression_pack") {
    return [
      "Prepaid sponsored impressions ready to deliver",
      "Delivery starts only after payment is verified",
      "No bidding or daily caps to manage",
    ];
  }
  return [
    "Sponsored placement in eligible category searches",
    "You only pay as your ad earns clicks",
    "Pause or end anytime — unspent budget stops serving",
  ];
}

/** Build a review sheet for retrying payment on an unpaid ads draft. */
export function buildAdsRetryCheckoutReview(
  campaign: RetryCheckoutCampaign,
  currency: string,
): AdsCheckoutReviewData {
  const amount =
    Number(campaign.latest_budget_order?.amount ?? campaign.budget ?? 0) || 0;
  const payCurrency = campaign.latest_budget_order?.currency?.trim() || currency;
  const total = formatMoney(amount, payCurrency);
  const heading = adsModelHeading(campaign.billing_model);
  const isTime = campaign.billing_model === "time_based";
  const isImpression = !isTime && campaign.pack_impressions != null;
  const lineItems: { label: string; value: string }[] = [
    { label: "Campaign type", value: heading },
  ];
  if (isTime && campaign.duration_days != null) {
    const days = Number(campaign.duration_days);
    const daysLabel = days === 1 ? "1 day" : `${days} days`;
    lineItems.push({ label: "Boost duration", value: daysLabel });
  }
  if (isImpression) {
    lineItems.push({
      label: "Impressions",
      value: formatCount(Number(campaign.pack_impressions)),
    });
  }
  lineItems.push({ label: "Total due", value: total });

  let title = `${total} ad payment`;
  if (isTime && campaign.duration_days != null) {
    const days = Number(campaign.duration_days);
    title = days === 1 ? "1-day boost" : `${days}-day boost`;
  } else if (isImpression) {
    title = `${formatCount(Number(campaign.pack_impressions))} impressions`;
  }

  const modelForBenefits = isTime
    ? "time_based"
    : isImpression
      ? "impression_pack"
      : campaign.billing_model;

  return {
    heading: "Complete payment",
    title,
    subtitle: "Review the amount below before returning to secure checkout.",
    benefits: adsModelBenefits(modelForBenefits),
    lineItems,
    total,
    confirmLabel: `Pay ${total}`,
  };
}

export type AdsPaymentReturnDeepLinkParams = {
  success?: boolean;
  cancelled?: boolean;
  orderId?: string | null;
  campaignId?: string | null;
  reference?: string | null;
};

/** Native deep link for the ads payment-return cold-start screen (`provider://settings/ads-payment-return`). */
export function getAdsPaymentReturnDeepLink(params: AdsPaymentReturnDeepLinkParams = {}): string {
  const q = new URLSearchParams();
  if (params.success) q.set("success", "1");
  if (params.cancelled) q.set("cancelled", "1");
  if (params.orderId) q.set("order_id", params.orderId);
  if (params.campaignId) q.set("campaign_id", params.campaignId);
  if (params.reference) q.set("reference", params.reference);
  const query = q.toString();
  return `provider://settings/ads-payment-return${query ? `?${query}` : ""}`;
}
