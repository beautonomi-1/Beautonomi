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
 * GET /api/provider/settings/billing
 * Get provider billing contact info (address, email, phone).
 * Payment methods and invoices have their own dedicated endpoints.
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

    const { data: billingSettings, error } = await supabase
      .from("providers")
      .select("billing_address, billing_email, billing_phone")
      .eq("id", providerId)
      .maybeSingle();

    if (error) throw error;

    return successResponse({
      billingAddress: billingSettings?.billing_address ?? null,
      billingEmail: billingSettings?.billing_email ?? null,
      billingPhone: billingSettings?.billing_phone ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load billing information");
  }
}

/**
 * PATCH /api/provider/settings/billing
 * Update provider billing information
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const updates: any = {};

    if (body.billingAddress !== undefined) {
      updates.billing_address = body.billingAddress;
    }
    if (body.billingEmail !== undefined) {
      updates.billing_email = body.billingEmail;
    }
    if (body.billingPhone !== undefined) {
      updates.billing_phone = body.billingPhone;
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to update billing information");
  }
}
