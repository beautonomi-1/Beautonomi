/**
 * Report Gating Helper
 *
 * Utility functions for gating report access based on subscription.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, errorResponse } from "@/lib/supabase/api-helpers";
import {
  checkAnalyticsFeatureAccess,
  getProviderSubscriptionTier,
} from "./feature-access";
import { isUserSuperadmin } from "./entitlements";
import { getUpgradeMessage } from "./subscription-upgrade-copy";

export type ReportGateResult =
  | { allowed: true }
  | { allowed: false; response: NextResponse };

const warnedMissingAnalyticsKey = new Set<string>();

/** User-facing copy — enforced via subscription_plans.features.advanced_analytics. */
function subscriptionRequiredMessage(
  kind: "analytics" | "basic" | "advanced" | "scale_only" | "export" | "api",
): string {
  switch (kind) {
    case "analytics":
      return getUpgradeMessage("reports.basic");
    case "basic":
      return getUpgradeMessage("reports.basic");
    case "advanced":
      return getUpgradeMessage("reports.advanced");
    case "scale_only":
      return getUpgradeMessage("reports.scale_only");
    case "export":
      return "Data export requires a subscription that includes export. Upgrade under Subscription.";
    case "api":
      return "API access requires a subscription that includes API access. Upgrade under Subscription.";
    default:
      return getUpgradeMessage("reports.basic");
  }
}

function deny(
  kind: "analytics" | "basic" | "advanced" | "scale_only",
): ReportGateResult {
  return {
    allowed: false,
    response: errorResponse(
      subscriptionRequiredMessage(kind),
      "SUBSCRIPTION_REQUIRED",
      403,
    ),
  };
}

function denyForReportType(reportType: string): ReportGateResult {
  const t = reportType.toLowerCase();
  if (t === "gift_cards" || t === "packages") return deny("scale_only");
  if (t === "sales" || t === "bookings") return deny("basic");
  if (t === "staff" || t === "products" || t === "payments" || t === "memberships") {
    return deny("advanced");
  }
  return deny("advanced");
}

/**
 * Core subscription gate for provider report APIs.
 * Pass the same Supabase client as the route (Bearer-aware).
 */
export async function assertReportSubscriptionAccess(input: {
  providerId: string;
  reportType: string;
  supabase: SupabaseClient;
  isSuperadmin?: boolean;
}): Promise<ReportGateResult> {
  if (input.isSuperadmin) {
    return { allowed: true };
  }

  const tier = await getProviderSubscriptionTier(input.supabase, input.providerId);
  const rawFeatures = (tier?.features ?? null) as Record<string, unknown> | null;
  const hasAnalyticsKey =
    rawFeatures != null &&
    typeof rawFeatures === "object" &&
    !Array.isArray(rawFeatures) &&
    Object.prototype.hasOwnProperty.call(rawFeatures, "advanced_analytics");

  if (!hasAnalyticsKey) {
    const warnKey = tier?.planId ?? input.providerId;
    if (!warnedMissingAnalyticsKey.has(warnKey)) {
      warnedMissingAnalyticsKey.add(warnKey);
      console.warn(
        "[report-gating] advanced_analytics key missing on plan; fail-open for provider",
        input.providerId,
        tier?.planName,
      );
    }
    return { allowed: true };
  }

  const analyticsAccess = await checkAnalyticsFeatureAccess(
    input.providerId,
    input.supabase,
  );

  if (!analyticsAccess.enabled) {
    return deny("analytics");
  }

  const normalizedType = input.reportType.toLowerCase();

  if (normalizedType === "analytics_only") {
    return { allowed: true };
  }

  const reportTypes = (analyticsAccess.reportTypes ?? []).map((t) =>
    String(t).toLowerCase(),
  );

  if (reportTypes.length > 0) {
    if (reportTypes.includes(normalizedType)) {
      return { allowed: true };
    }
    return denyForReportType(normalizedType);
  }

  const basicReports = ["sales", "bookings"];
  if (basicReports.includes(normalizedType)) {
    if (!analyticsAccess.basicReports) {
      return deny("basic");
    }
    return { allowed: true };
  }

  const advancedReports = [
    "staff",
    "clients",
    "products",
    "payments",
    "gift_cards",
    "packages",
    "memberships",
  ];
  if (advancedReports.includes(normalizedType)) {
    if (!analyticsAccess.advancedReports) {
      return deny("advanced");
    }
    return { allowed: true };
  }

  if (!analyticsAccess.basicReports) {
    return deny("basic");
  }

  return { allowed: true };
}

/**
 * @deprecated Prefer requireProviderReportsAccess with reportType option.
 */
export async function canAccessReport(
  userId: string,
  reportType: "basic" | "advanced" | "export" | "api",
  request?: Request,
): Promise<{ allowed: boolean; error?: Response }> {
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(userId, supabase);

  if (!providerId) {
    return {
      allowed: false,
      error: errorResponse("Provider not found", "NOT_FOUND", 404),
    };
  }

  const isSuperadmin = await isUserSuperadmin(supabase, userId);

  const analyticsAccess = await checkAnalyticsFeatureAccess(providerId, supabase);

  if (!isSuperadmin && !analyticsAccess.enabled) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("analytics"),
        "SUBSCRIPTION_REQUIRED",
        403,
      ),
    };
  }

  if (isSuperadmin) {
    return { allowed: true };
  }

  if (reportType === "basic" && !analyticsAccess.basicReports) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("basic"),
        "SUBSCRIPTION_REQUIRED",
        403,
      ),
    };
  }

  if (reportType === "advanced" && !analyticsAccess.advancedReports) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("advanced"),
        "SUBSCRIPTION_REQUIRED",
        403,
      ),
    };
  }

  if (reportType === "export" && !analyticsAccess.dataExport) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("export"),
        "SUBSCRIPTION_REQUIRED",
        403,
      ),
    };
  }

  if (reportType === "api" && !analyticsAccess.apiAccess) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("api"),
        "SUBSCRIPTION_REQUIRED",
        403,
      ),
    };
  }

  return { allowed: true };
}

/**
 * @deprecated Prefer requireProviderReportsAccess with reportType option.
 */
export async function canAccessReportType(
  userId: string,
  reportTypeName: string,
  request?: Request,
): Promise<{ allowed: boolean; error?: Response }> {
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(userId, supabase);

  if (!providerId) {
    return {
      allowed: false,
      error: errorResponse("Provider not found", "NOT_FOUND", 404),
    };
  }

  const isSuperadmin = await isUserSuperadmin(supabase, userId);
  const gate = await assertReportSubscriptionAccess({
    providerId,
    reportType: reportTypeName,
    supabase,
    isSuperadmin,
  });

  if (gate.allowed === false) {
    return { allowed: false, error: gate.response };
  }

  return { allowed: true };
}
