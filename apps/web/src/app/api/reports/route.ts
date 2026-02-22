import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * POST /api/reports
 * Create a user report: customer reports provider, or provider reports customer.
 * Body: report_type, description, and either provider_id (for customer_reported_provider) or reported_user_id (for provider_reported_customer). Optional booking_id.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json();

    const reportType = body.report_type;
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const bookingId =
      typeof body.booking_id === "string" && body.booking_id
        ? body.booking_id
        : null;

    if (!reportType || !description) {
      return errorResponse(
        "report_type and description are required",
        "VALIDATION_ERROR",
        400
      );
    }

    let reportedUserId: string;
    if (reportType === "customer_reported_provider") {
      const providerId =
        typeof body.provider_id === "string" ? body.provider_id.trim() : "";
      if (!providerId) {
        return errorResponse(
          "provider_id is required for customer_reported_provider",
          "VALIDATION_ERROR",
          400
        );
      }
      const supabaseProvider = await getSupabaseAdmin();
      const { data: prov } = await supabaseProvider
        .from("providers")
        .select("user_id")
        .eq("id", providerId)
        .single();
      if (!prov?.user_id) {
        return errorResponse("Provider not found", "NOT_FOUND", 404);
      }
      reportedUserId = prov.user_id;
    } else {
      reportedUserId =
        typeof body.reported_user_id === "string"
          ? body.reported_user_id.trim()
          : "";
      if (!reportedUserId) {
        return errorResponse(
          "reported_user_id is required for provider_reported_customer",
          "VALIDATION_ERROR",
          400
        );
      }
    }

    if (
      reportType !== "customer_reported_provider" &&
      reportType !== "provider_reported_customer"
    ) {
      return errorResponse(
        "report_type must be customer_reported_provider or provider_reported_customer",
        "VALIDATION_ERROR",
        400
      );
    }

    if (description.length > 2000) {
      return errorResponse(
        "Description must be 2000 characters or fewer",
        "VALIDATION_ERROR",
        400
      );
    }

    if (reportedUserId === user.id) {
      return errorResponse("You cannot report yourself", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseAdmin();

    const { data: reporter } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", user.id)
      .single();

    const { data: reportedUser } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", reportedUserId)
      .single();

    if (!reporter || !reportedUser) {
      return errorResponse("User not found", "NOT_FOUND", 404);
    }

    if (reportType === "customer_reported_provider") {
      if (reporter.role !== "customer") {
        return errorResponse(
          "Only customers can report providers",
          "FORBIDDEN",
          403
        );
      }
    } else {
      const providerId = await getProviderIdForUser(user.id);
      if (!providerId) {
        return errorResponse(
          "Only providers can report customers",
          "FORBIDDEN",
          403
        );
      }
      if (reportedUser.role !== "customer") {
        return errorResponse(
          "Reported user is not a customer",
          "VALIDATION_ERROR",
          400
        );
      }
    }

    const { data: row, error } = await supabase
      .from("user_reports")
      .insert({
        reporter_id: user.id,
        reported_user_id: reportedUserId,
        report_type: reportType,
        description,
        booking_id: bookingId,
        status: "pending",
      })
      .select("id, reporter_id, reported_user_id, report_type, description, status, created_at")
      .single();

    if (error) return handleApiError(error, "Failed to create report");
    if (!row) return errorResponse("Failed to create report", "INTERNAL_ERROR", 500);

    return successResponse(
      {
        id: row.id,
        report_type: row.report_type,
        status: row.status,
        created_at: row.created_at,
      },
      201
    );
  } catch (err) {
    return handleApiError(err, "Failed to create report");
  }
}
