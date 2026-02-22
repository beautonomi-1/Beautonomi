import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/payment-methods
 * Get payment methods for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const { data: paymentMethods, error } = await supabase
      .from("provider_payment_methods")
      .select("*")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(paymentMethods || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch payment methods");
  }
}

/**
 * POST /api/provider/payment-methods
 * Create a new payment method
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(permissionCheck.user!.id);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const { data: paymentMethod, error } = await supabase
      .from("provider_payment_methods")
      .insert({
        provider_id: providerId,
        type: body.type,
        name: body.name,
        last4: body.last4,
        expiry_month: body.expiry_month,
        expiry_year: body.expiry_year,
        bank_name: body.bank_name,
        account_type: body.account_type,
        is_default: body.is_default || false,
        metadata: body.metadata || {},
        created_by: permissionCheck.user!.id,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(paymentMethod);
  } catch (error) {
    return handleApiError(error, "Failed to create payment method");
  }
}
