import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { formatProviderPortalLimitMessage } from "./subscription-limit-messages";

export interface LimitCheckResult {
  canProceed: boolean;
  reason: string;
  currentCount: number;
  limitValue: number | null;
  planName: string;
  isUnlimited: boolean;
}

export const BOOKING_LIMIT_CHECK_FAILED = "Unable to check booking limit";

const UNABLE_TO_CHECK: LimitCheckResult = {
  canProceed: false,
  reason: BOOKING_LIMIT_CHECK_FAILED,
  currentCount: 0,
  limitValue: null,
  planName: "",
  isUnlimited: false,
};

type BookingPlanRow = {
  name?: string | null;
  features?: unknown;
  max_bookings_per_month?: number | null;
  slug?: string | null;
  display_order?: number | null;
};

type SubscriptionAllowanceRow = {
  status?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  billing_provider?: string | null;
  apple_grace_period_expires_at?: string | null;
  plan?: BookingPlanRow | BookingPlanRow[] | null;
};

/** Only an explicit true enforces a monthly cap. Catalog: Starter true, Growth and Scale false. */
export function bookingLimitsAreEnforced(features: unknown): boolean {
  if (!features || typeof features !== "object") return false;
  const raw = (features as { booking_limits?: { enabled?: unknown } }).booking_limits?.enabled;
  if (raw === true || raw === 1) return true;
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "true" || value === "t" || value === "1" || value === "yes" || value === "on";
}

/** JSON cap wins. A null/missing JSON cap falls back to subscription_plans.max_bookings_per_month. */
export function resolveMonthlyBookingCap(
  features: unknown,
  columnMax: number | null | undefined,
): number | null {
  const raw =
    features && typeof features === "object"
      ? (features as { booking_limits?: { max_bookings_per_month?: unknown } }).booking_limits
          ?.max_bookings_per_month
      : undefined;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.trunc(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number.parseInt(raw.trim(), 10);
  if (typeof columnMax === "number" && Number.isFinite(columnMax) && columnMax >= 0) {
    return Math.trunc(columnMax);
  }
  return null;
}

/** Same decisions as can_provider_create_booking, without calling the RPC. */
export function evaluateBookingAllowance(input: {
  planName: string | null;
  features: unknown;
  columnMax: number | null;
  currentCount: number;
}): LimitCheckResult {
  const planName = input.planName?.trim() ?? "";
  if (!planName) {
    return {
      canProceed: false,
      reason: "No active subscription plan",
      currentCount: 0,
      limitValue: 0,
      planName: "",
      isUnlimited: false,
    };
  }

  if (!bookingLimitsAreEnforced(input.features)) {
    return {
      canProceed: true,
      reason: "Booking limits not enabled for this plan",
      currentCount: 0,
      limitValue: null,
      planName,
      isUnlimited: true,
    };
  }

  const cap = resolveMonthlyBookingCap(input.features, input.columnMax);
  if (cap == null) {
    return {
      canProceed: true,
      reason: "Unlimited bookings",
      currentCount: 0,
      limitValue: null,
      planName,
      isUnlimited: true,
    };
  }

  if (input.currentCount >= cap) {
    return {
      canProceed: false,
      reason: `Monthly booking limit reached (${input.currentCount}/${cap}). Upgrade your plan to continue.`,
      currentCount: input.currentCount,
      limitValue: cap,
      planName,
      isUnlimited: false,
    };
  }

  return {
    canProceed: true,
    reason: `Bookings remaining: ${cap - input.currentCount}/${cap}`,
    currentCount: input.currentCount,
    limitValue: cap,
    planName,
    isUnlimited: false,
  };
}

/**
 * Dashboard banner payload.
 * canProceed true hides the banner (under the cap, or booking_limits not enforced).
 * A failed lookup stays a failed lookup: the message says the allowance could not
 * be verified. It is not reported as "bookings allowed" or as a plan cap.
 */
export function providerBookingEligibilityFromLimit(limit: LimitCheckResult): {
  can_accept_online_bookings: boolean;
  booking_limit_message: string | null;
  internal_reason: string | null;
} {
  if (limit.canProceed) {
    return {
      can_accept_online_bookings: true,
      booking_limit_message: null,
      internal_reason: null,
    };
  }
  return {
    can_accept_online_bookings: false,
    booking_limit_message: formatProviderPortalLimitMessage(limit, "Subscription"),
    internal_reason: limit.reason,
  };
}

/**
 * Starter's published cap is "50 online bookings per month".
 * bookings.booking_source defaults to online; walk_in and provider do not count.
 */
export function bookingCountsTowardMonthlyAllowance(source: string | null | undefined): boolean {
  return (source ?? "online") === "online";
}

function unwrapPlan(plan: SubscriptionAllowanceRow["plan"]): BookingPlanRow | null {
  if (!plan) return null;
  return Array.isArray(plan) ? (plan[0] ?? null) : plan;
}

function statusRank(status: string | null | undefined): number {
  if (status === "active") return 0;
  if (status === "trialing") return 1;
  if (status === "past_due") return 2;
  return 9;
}

/** Mirrors get_provider_subscription_plan entitlement (active/trialing, past_due grace, Apple retry window). */
export function subscriptionRowIsEntitled(
  row: SubscriptionAllowanceRow,
  nowMs: number,
): boolean {
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
  const appleGrace = row.apple_grace_period_expires_at
    ? Date.parse(row.apple_grace_period_expires_at)
    : null;
  const appleGraceOpen =
    row.billing_provider === "apple" && appleGrace != null && Number.isFinite(appleGrace) && appleGrace > nowMs;
  const expiresOk = expiresAt == null || (Number.isFinite(expiresAt) && expiresAt > nowMs) || appleGraceOpen;
  if (!expiresOk) return false;
  if (row.status === "active" || row.status === "trialing") return true;
  if (row.status !== "past_due") return false;
  if (row.billing_provider === "apple") return appleGraceOpen;
  const updated = row.updated_at ? Date.parse(row.updated_at) : Number.NaN;
  if (!Number.isFinite(updated)) return false;
  return updated >= nowMs - 3 * 24 * 60 * 60 * 1000;
}

function pickFreePlan(plans: BookingPlanRow[]): BookingPlanRow | null {
  const ranked = [...plans].sort((a, b) => {
    const slugRank = (plan: BookingPlanRow) => (plan.slug === "free-tier-default" ? 0 : 1);
    const bySlug = slugRank(a) - slugRank(b);
    if (bySlug !== 0) return bySlug;
    return (a.display_order ?? 9999) - (b.display_order ?? 9999);
  });
  return ranked[0] ?? null;
}

function utcMonthBounds(now: Date): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
  return null;
}

function firstBookingLimitRow(data: unknown): {
  can_create: boolean;
  reason: string;
  current_count: number;
  limit_value: number | null;
  plan_name: string;
} | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.can_create !== "boolean") return null;
  return {
    can_create: record.can_create,
    reason: typeof record.reason === "string" ? record.reason : "",
    current_count: readInteger(record.current_count) ?? 0,
    limit_value: readInteger(record.limit_value),
    plan_name: typeof record.plan_name === "string" ? record.plan_name : "",
  };
}

async function checkBookingLimitFromTables(
  client: SupabaseClient<Database>,
  providerId: string,
): Promise<LimitCheckResult> {
  const nowMs = Date.now();
  const { data: subscriptions, error: subscriptionError } = await client
    .from("provider_subscriptions")
    .select(
      `
      status,
      updated_at,
      expires_at,
      billing_provider,
      apple_grace_period_expires_at,
      plan:subscription_plans!plan_id(
        name,
        features,
        max_bookings_per_month
      )
    `,
    )
    .eq("provider_id", providerId)
    .in("status", ["active", "trialing", "past_due"]);

  if (subscriptionError) {
    console.error("[checkBookingLimit] subscription lookup failed", {
      providerId,
      error: subscriptionError.message,
    });
    return UNABLE_TO_CHECK;
  }

  const entitled = ((subscriptions ?? []) as SubscriptionAllowanceRow[])
    .filter((row) => subscriptionRowIsEntitled(row, nowMs) && unwrapPlan(row.plan)?.name)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));

  let plan = unwrapPlan(entitled[0]?.plan ?? null);

  if (!plan?.name) {
    const { data: freePlans, error: freePlanError } = await client
      .from("subscription_plans")
      .select("name, features, max_bookings_per_month, slug, display_order, is_free, is_active")
      .eq("is_active", true)
      .or("is_free.eq.true,slug.eq.free-tier-default");

    if (freePlanError) {
      console.error("[checkBookingLimit] free-plan lookup failed", {
        providerId,
        error: freePlanError.message,
      });
      return UNABLE_TO_CHECK;
    }
    plan = pickFreePlan((freePlans ?? []) as BookingPlanRow[]);
  }

  const decisionWithoutCount = evaluateBookingAllowance({
    planName: plan?.name ?? null,
    features: plan?.features,
    columnMax: plan?.max_bookings_per_month ?? null,
    currentCount: 0,
  });

  if (decisionWithoutCount.canProceed && decisionWithoutCount.isUnlimited) {
    return decisionWithoutCount;
  }
  if (!decisionWithoutCount.canProceed && decisionWithoutCount.reason === "No active subscription plan") {
    return decisionWithoutCount;
  }

  const { start, end } = utcMonthBounds(new Date(nowMs));
  // Same set as count_provider_bookings_this_month: online only (null defaults to online).
  const { count, error: countError } = await client
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .not("status", "in", "(cancelled,refunded)")
    .or("booking_source.eq.online,booking_source.is.null")
    .gte("created_at", start)
    .lt("created_at", end);

  if (countError) {
    console.error("[checkBookingLimit] monthly booking count failed", {
      providerId,
      error: countError.message,
    });
    return UNABLE_TO_CHECK;
  }

  return evaluateBookingAllowance({
    planName: plan?.name ?? null,
    features: plan?.features,
    columnMax: plan?.max_bookings_per_month ?? null,
    currentCount: count ?? 0,
  });
}

/**
 * Check if provider can create a booking.
 * Uses can_provider_create_booking, then the plan row directly when that RPC
 * errors or returns nothing. Pass a service-role client: a cookieless mobile
 * session often cannot execute the RPC and used to paint a false
 * "couldn't verify your online booking allowance" banner.
 */
export async function checkBookingLimit(
  providerId: string,
  supabase?: SupabaseClient<Database>,
): Promise<LimitCheckResult> {
  const client = supabase ?? (await getSupabaseServer());

  const { data, error } = await client.rpc("can_provider_create_booking", {
    provider_id_param: providerId,
  });

  const row = error ? null : firstBookingLimitRow(data);
  if (row) {
    return {
      canProceed: row.can_create,
      reason: row.reason,
      currentCount: row.current_count,
      limitValue: row.limit_value,
      planName: row.plan_name,
      isUnlimited: row.limit_value === null,
    };
  }

  console.error("[checkBookingLimit] can_provider_create_booking failed; reading the plan directly", {
    providerId,
    error: error?.message ?? error,
    rowCount: Array.isArray(data) ? data.length : data ? 1 : 0,
  });
  return checkBookingLimitFromTables(client, providerId);
}

/**
 * Check if provider can send a message.
 * Pass `getSupabaseServer(request)` on API routes so mobile Bearer auth works.
 */
export async function checkMessageLimit(
  providerId: string,
  supabase?: SupabaseClient<Database>
): Promise<LimitCheckResult> {
  const client = supabase ?? (await getSupabaseServer());

  const { data, error } = await client.rpc("can_provider_send_message", {
    provider_id_param: providerId,
  });

  if (error || !data || data.length === 0) {
    console.error("[checkMessageLimit] can_provider_send_message failed", {
      providerId,
      error: error?.message ?? error,
    });
    return {
      canProceed: false,
      reason: "Unable to check message limit",
      currentCount: 0,
      limitValue: null,
      planName: "",
      isUnlimited: false,
    };
  }

  const result = data[0];
  return {
    canProceed: result.can_send,
    reason: result.reason,
    currentCount: result.current_count,
    limitValue: result.limit_value,
    planName: result.plan_name,
    isUnlimited: result.limit_value === null
  };
}

/**
 * Check if provider can add a staff member.
 * Pass `getSupabaseServer(request)` on API routes so mobile Bearer auth works.
 */
export async function checkStaffLimit(
  providerId: string,
  supabase?: SupabaseClient<Database>
): Promise<LimitCheckResult> {
  const client = supabase ?? (await getSupabaseServer());

  const { data, error } = await client.rpc("can_provider_add_staff", {
    provider_id_param: providerId,
  });

  if (error || !data || data.length === 0) {
    console.error("[checkStaffLimit] can_provider_add_staff failed", {
      providerId,
      error: error?.message ?? error,
    });
    return {
      canProceed: false,
      reason: "Unable to check staff limit",
      currentCount: 0,
      limitValue: null,
      planName: "",
      isUnlimited: false,
    };
  }

  const result = data[0];
  return {
    canProceed: result.can_add,
    reason: result.reason,
    currentCount: result.current_count,
    limitValue: result.limit_value,
    planName: result.plan_name,
    isUnlimited: result.limit_value === null
  };
}

/**
 * Check if provider can add a location.
 * Pass `getSupabaseServer(request)` on API routes so mobile Bearer auth works.
 */
export async function checkLocationLimit(
  providerId: string,
  supabase?: SupabaseClient<Database>
): Promise<LimitCheckResult> {
  const client = supabase ?? (await getSupabaseServer());

  const { data, error } = await client.rpc("can_provider_add_location", {
    provider_id_param: providerId,
  });

  if (error || !data || data.length === 0) {
    console.error("[checkLocationLimit] can_provider_add_location failed", {
      providerId,
      error: error?.message ?? error,
    });
    return {
      canProceed: false,
      reason: "Unable to check location limit",
      currentCount: 0,
      limitValue: null,
      planName: "",
      isUnlimited: false,
    };
  }

  const result = data[0];
  return {
    canProceed: result.can_add,
    reason: result.reason,
    currentCount: result.current_count,
    limitValue: result.limit_value,
    planName: result.plan_name,
    isUnlimited: result.limit_value === null
  };
}

/**
 * Get provider's usage summary for all limits
 */
export async function getProviderUsageSummary(providerId: string) {
  const supabase = await getSupabaseServer();
  
  const { data, error } = await supabase.rpc('get_provider_usage_summary', {
    provider_id_param: providerId
  });

  if (error) {
    console.error('Error getting usage summary:', error);
    return [];
  }

  return data || [];
}

/**
 * Format limit error for **provider portal** API responses (staff, messages, etc.).
 * @param actionLabel — e.g. "Plan" for staff limits, "Subscription" for messaging.
 */
export function formatLimitError(limitCheck: LimitCheckResult, actionLabel = "Subscription"): string {
  return formatProviderPortalLimitMessage(limitCheck, actionLabel);
}
