import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  isValidUUID,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";

/**
 * GET /api/provider/profile
 * Get provider profile information
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    let providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId && user.role === "superadmin") {
      const qp = request.nextUrl.searchParams.get("provider_id");
      if (qp && isValidUUID(qp)) {
        providerId = qp;
      }
    }
    if (!providerId) {
      return errorResponse("Provider profile is not created yet", "NEW_PROVIDER", 404);
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select("id, business_name, description, business_type, phone, email, thumbnail_url, avatar_url, tenant_id, timezone, offers_mobile_services, is_verified")
      .eq("id", providerId)
      .single();

    if (error || !provider) {
      return errorResponse("Provider profile is not created yet", "NEW_PROVIDER", 404);
    }

    const tenantId = (provider as { tenant_id?: string | null }).tenant_id ?? null;
    const { currency, locale } = await getTenantMoneyFormatter(tenantId);

    const { data: locations } = await supabase
      .from("provider_locations")
      .select("id, name, address_line1, city, location_type, is_primary, working_hours")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    const { data: latestVerification } = await supabase
      .from("user_verifications")
      .select("status")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const response = {
      ...provider,
      avatar_url: (provider as any).avatar_url ?? (provider as any).thumbnail_url ?? null,
      currency,
      locale,
      is_verified: Boolean((provider as any).is_verified),
      verification_status: (latestVerification as { status?: string | null } | null)?.status ?? "none",
      locations: (locations || []).map((loc: any) => ({
        id: loc.id,
        name: loc.name,
        address_line1: loc.address_line1 || "",
        city: loc.city || "",
        location_type: loc.location_type || "salon",
        is_primary: Boolean(loc.is_primary),
        operating_hours: loc.working_hours ?? null,
        working_hours: loc.working_hours ?? null,
      })),
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider profile");
  }
}

/**
 * PATCH /api/provider/profile
 * Update provider profile information
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

    // Validate description length if provided
    if (body.description !== undefined) {
      if (body.description && body.description.length > 2000) {
        return handleApiError(
          new Error("Description must be 2000 characters or less"),
          "Validation failed",
          "VALIDATION_ERROR",
          400
        );
      }
    }

    const updates: any = {};
    if (body.description !== undefined) {
      updates.description = body.description || null;
    }
    if (body.business_name !== undefined) {
      updates.business_name = body.business_name;
    }
    if (body.phone !== undefined) {
      updates.phone = body.phone;
    }
    if (body.email !== undefined) {
      updates.email = body.email;
    }
    if (body.gallery !== undefined) {
      // Validate gallery is an array of strings
      if (Array.isArray(body.gallery)) {
        updates.gallery = body.gallery;
      } else {
        return handleApiError(
          new Error("Gallery must be an array of image URLs"),
          "Validation failed",
          "VALIDATION_ERROR",
          400
        );
      }
    }
    if (body.thumbnail_url !== undefined) {
      updates.thumbnail_url = body.thumbnail_url || null;
    }
    if (body.avatar_url !== undefined) {
      updates.avatar_url = body.avatar_url || null;
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
    return handleApiError(error, "Failed to update provider profile");
  }
}
