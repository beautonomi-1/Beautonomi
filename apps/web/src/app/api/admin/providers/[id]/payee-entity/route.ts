/**
 * GET/PATCH /api/admin/providers/[id]/payee-entity
 * Superadmin view/edit of provider entity type and registration fields.
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { id: providerId } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("providers")
      .select(
        "id, payee_kind, registered_business_name, business_registration_number, business_registration_country, verified_person_role, kyb_verification_status, business_type",
      )
      .eq("id", providerId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return errorResponse("Provider not found", "NOT_FOUND", 404);

    return successResponse(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { id: providerId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from("providers")
      .select("payee_kind, registered_business_name, kyb_verification_status")
      .eq("id", providerId)
      .maybeSingle();

    if (!existing) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const updates: Record<string, unknown> = {};
    if (body.payee_kind === "individual" || body.payee_kind === "business") {
      updates.payee_kind = body.payee_kind;
      if (body.payee_kind === "individual") {
        updates.kyb_verification_status = "not_required";
        updates.registered_business_name = null;
        updates.business_registration_number = null;
        updates.business_registration_country = null;
        updates.verified_person_role = null;
      } else if (
        (existing as { kyb_verification_status?: string }).kyb_verification_status ===
        "not_required"
      ) {
        updates.kyb_verification_status = "not_started";
      }
    }
    if (body.registered_business_name !== undefined) {
      updates.registered_business_name =
        typeof body.registered_business_name === "string"
          ? body.registered_business_name.trim() || null
          : null;
    }
    if (body.business_registration_number !== undefined) {
      updates.business_registration_number =
        typeof body.business_registration_number === "string"
          ? body.business_registration_number.trim() || null
          : null;
    }
    if (body.business_registration_country !== undefined) {
      updates.business_registration_country =
        typeof body.business_registration_country === "string"
          ? body.business_registration_country.trim().toUpperCase() || null
          : null;
    }
    if (
      body.verified_person_role === "owner" ||
      body.verified_person_role === "authorized_representative" ||
      body.verified_person_role === null
    ) {
      updates.verified_person_role = body.verified_person_role;
    }
    if (
      typeof body.kyb_verification_status === "string" &&
      [
        "not_started",
        "in_progress",
        "pending_review",
        "approved",
        "rejected",
        "expired",
        "not_required",
      ].includes(body.kyb_verification_status)
    ) {
      updates.kyb_verification_status = body.kyb_verification_status;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields", "VALIDATION_ERROR", 400);
    }

    const nextKind =
      (updates.payee_kind as string | undefined) ??
      (existing as { payee_kind?: string }).payee_kind;
    if (nextKind === "business") {
      const name =
        updates.registered_business_name !== undefined
          ? (updates.registered_business_name as string | null)
          : ((existing as { registered_business_name?: string | null }).registered_business_name ??
            null);
      if (!name || !String(name).trim()) {
        return errorResponse(
          "Registered business name is required for registered companies.",
          "VALIDATION_ERROR",
          400,
        );
      }
    }

    const { data, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select(
        "id, payee_kind, registered_business_name, business_registration_number, business_registration_country, verified_person_role, kyb_verification_status",
      )
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (err) {
    return handleApiError(err);
  }
}
