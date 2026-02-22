/**
 * Report Gating Helper
 * 
 * Utility functions for gating report access based on subscription
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkAnalyticsFeatureAccess } from "./feature-access";
import { errorResponse } from "@/lib/supabase/api-helpers";

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
        "Reports require a subscription upgrade. Please upgrade your plan to access reports.",
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  if (reportType === "basic" && !analyticsAccess.basicReports) {
    return {
      allowed: false,
      error: errorResponse(
        "Basic reports require a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  if (reportType === "advanced" && !analyticsAccess.advancedReports) {
    return {
      allowed: false,
      error: errorResponse(
        "Advanced reports require a Professional plan or higher. Please upgrade to access detailed analytics.",
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  if (reportType === "export" && !analyticsAccess.dataExport) {
    return {
      allowed: false,
      error: errorResponse(
        "Data export requires a Professional plan or higher. Please upgrade to export reports.",
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  if (reportType === "api" && !analyticsAccess.apiAccess) {
    return {
      allowed: false,
      error: errorResponse(
        "API access requires an Enterprise plan. Please upgrade to access the API.",
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
        "Reports require a subscription upgrade. Please upgrade your plan to access reports.",
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
          "Basic reports require a subscription upgrade. Please upgrade to Starter plan or higher.",
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
          "Advanced reports require a Professional plan or higher. Please upgrade to access detailed analytics.",
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
        "Reports require a subscription upgrade. Please upgrade your plan to access reports.",
        "SUBSCRIPTION_REQUIRED",
        403
      ),
    };
  }

  return { allowed: true };
}
