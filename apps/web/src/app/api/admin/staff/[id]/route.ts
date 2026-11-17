import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveStaffRates } from "@/lib/payroll/resolve-staff-rates";
import { commissionRatePatch } from "@/lib/provider/staff-commission-patch-fields";

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "email",
  "phone",
  "role",
  "is_active",
  "commission_percentage",
  "service_commission_rate",
  "product_commission_rate",
  "bio",
  "public_title",
  "is_service_provider",
  "enable_in_online_booking",
] as const;

function commissionPercent(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * GET /api/admin/staff/[id]
 * Get a single staff member with provider info (superadmin only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, _request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { data: staff, error } = await supabase
      .from("provider_staff")
      .select("id, provider_id, user_id, name, email, phone, role, avatar_url, bio, is_active, commission_percentage, commission_rate, service_commission_rate, product_commission_rate, public_title, is_service_provider, enable_in_online_booking, created_at, updated_at, provider:providers(id, business_name, slug)")
      .eq("id", id)
      .single();

    if (error || !staff) return notFoundResponse("Staff member not found");
    const rates = resolveStaffRates(staff);
    return successResponse({
      ...staff,
      serviceCommissionRate: rates.serviceRate,
      productCommissionRate: rates.productRate,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff");
  }
}

/**
 * PATCH /api/admin/staff/[id]
 * Update staff member (superadmin only; only allowed fields).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const { id } = await params;

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    const sentService = Object.prototype.hasOwnProperty.call(body, "service_commission_rate");
    const sentProduct = Object.prototype.hasOwnProperty.call(body, "product_commission_rate");
    if (sentService !== sentProduct) {
      return errorResponse("Service and product rates differ. Send both rates.", "VALIDATION_ERROR", 400);
    }
    if (sentService && sentProduct) {
      const service = commissionPercent(body.service_commission_rate);
      const product = commissionPercent(body.product_commission_rate);
      if (service == null || product == null) {
        return errorResponse("Commission rates must be between 0 and 100.", "VALIDATION_ERROR", 400);
      }
      updateData.service_commission_rate = service;
      updateData.product_commission_rate = product;
      updateData.commission_enabled = true;
      if (service === product) {
        updateData.commission_rate = service;
        updateData.commission_percentage = service;
      } else {
        delete updateData.commission_percentage;
      }
    } else if (body.commission_percentage !== undefined) {
      const pct = commissionPercent(body.commission_percentage);
      if (pct == null) {
        return errorResponse("Commission rates must be between 0 and 100.", "VALIDATION_ERROR", 400);
      }
      const { data: existing, error: existingErr } = await supabase
        .from("provider_staff")
        .select("service_commission_rate, product_commission_rate, commission_rate, commission_percentage")
        .eq("id", id)
        .single();
      if (existingErr || !existing) return notFoundResponse("Staff member not found");
      const current = resolveStaffRates(existing);
      if (current.serviceRate !== current.productRate) {
        return errorResponse("Service and product rates differ. Send both rates.", "VALIDATION_ERROR", 400);
      }
      Object.assign(updateData, commissionRatePatch(pct, existing));
    }

    const { error } = await supabase
      .from("provider_staff")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.staff.update",
      entity_type: "provider_staff",
      entity_id: id,
      metadata: updateData,
    });

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update staff");
  }
}

/**
 * DELETE /api/admin/staff/[id]
 * Delete staff member (superadmin only; uses admin client to bypass RLS).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { error } = await supabase
      .from("provider_staff")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.staff.delete",
      entity_type: "provider_staff",
      entity_id: id,
      metadata: {},
    });

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete staff");
  }
}
