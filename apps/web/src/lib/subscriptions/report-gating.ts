/**
 * Report Gating Helper
 * 
 * Utility functions for gating report access based on subscription
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkAnalyticsFeatureAccess } from "./feature-access";
import { isUserSuperadmin } from "./entitlements";
import { errorResponse } from "@/lib/supabase/api-helpers";

/** User-facing copy only — access is enforced via `subscription_plans.features.advanced_analytics` (see `checkAnalyticsFeatureAccess`). */
function subscriptionRequiredMessage(
  kind: "analytics" | "basic" | "advanced" | "export" | "api"
): string {
  switch (kind) {
    case "analytics":
      return "Reports require a subscription that includes analytics. Please upgrade to a plan with analytics enabled.";
    case "basic":
      return "This report requires a subscription that includes basic reports. Please upgrade your plan.";
    case "advanced":
      return "This report requires a subscription that includes advanced analytics. Please upgrade your plan.";
    case "export":
      return "Data export requires a subscription that includes export. Please upgrade your plan.";
    case "api":
      return "API access requires a subscription that includes API access. Please upgrade your plan.";
    default:
      return "Reports require a subscription upgrade.";
  }
}

/**
 * Check if provider can access a specific report type
 */
export async function canAccessReport(
  userId: string,
  reportType: "basic" | "advanced" | "export" | "api"
): Promise<{ allowed: boolean; error?: any }> {
  const supabase = await getSupabaseServer();
  const providerId = await getProviderIdForUser(userId);
  
  if (!providerId) {
    return {
      allowed: false,
      error: errorResponse("Provider not found", "NOT_FOUND", 404),
    };
  }

  // Check if user is superadmin - allow access regardless of subscription
  const { data: userRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .maybeSingle();

  // Superadmins have full access to all reports
  if (userRole) {
    return { allowed: true };
  }

  const analyticsAccess = await checkAnalyticsFeatureAccess(providerId);

  if (!analyticsAccess.enabled) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("analytics"),
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  if (reportType === "basic" && !analyticsAccess.basicReports) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("basic"),
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  if (reportType === "advanced" && !analyticsAccess.advancedReports) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("advanced"),
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  if (reportType === "export" && !analyticsAccess.dataExport) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("export"),
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  if (reportType === "api" && !analyticsAccess.apiAccess) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("api"),
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  return { allowed: true };
}

/**
 * Check if provider can access a specific report type by name
 */
export async function canAccessReportType(
  userId: string,
  reportTypeName: string
): Promise<{ allowed: boolean; error?: any }> {
  const supabase = await getSupabaseServer();
  const providerId = await getProviderIdForUser(userId);
  
  if (!providerId) {
    return {
      allowed: false,
      error: errorResponse("Provider not found", "NOT_FOUND", 404),
    };
  }

  if (await isUserSuperadmin(supabase, userId)) {
    return { allowed: true };
  }

  const analyticsAccess = await checkAnalyticsFeatureAccess(providerId);

  if (!analyticsAccess.enabled) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("analytics"),
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  // Basic reports: sales, bookings
  const basicReports = ["sales", "bookings"];
  if (basicReports.includes(reportTypeName.toLowerCase())) {
    if (!analyticsAccess.basicReports) {
      return {
        allowed: false,
        error: errorResponse(
          subscriptionRequiredMessage("basic"),
          "SUBSCRIPTION_REQUIRED",
          403
        ),
      };
    }
    return { allowed: true };
  }

  // Advanced reports: staff, clients, products, payments, gift_cards, packages
  const advancedReports = ["staff", "clients", "products", "payments", "gift_cards", "packages"];
  if (advancedReports.includes(reportTypeName.toLowerCase())) {
    if (!analyticsAccess.advancedReports) {
      return {
        allowed: false,
        error: errorResponse(
          subscriptionRequiredMessage("advanced"),
          "SUBSCRIPTION_REQUIRED",
          403
        ),
      };
    }
    return { allowed: true };
  }

  // Default: require basic reports
  if (!analyticsAccess.basicReports) {
    return {
      allowed: false,
      error: errorResponse(
        subscriptionRequiredMessage("basic"),
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  return { allowed: true };
}
