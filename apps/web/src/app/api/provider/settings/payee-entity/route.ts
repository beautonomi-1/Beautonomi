/**
 * GET /api/provider/settings/payee-entity
 * PATCH /api/provider/settings/payee-entity
 *
 * Provider entity type (individual vs registered business) and registration fields.
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function inferDefaultPayeeKind(businessType: string | null | undefined): "individual" | "business" {
  return businessType === "freelancer" ? "individual" : "business";
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const { data, error } = await supabase
      .from("providers")
      .select(
        "payee_kind, registered_business_name, business_registration_number, business_registration_country, verified_person_role, business_type, kyb_verification_status",
      )
      .eq("id", providerId)
      .single();

    if (error) throw error;

    const row = data as Record<string, unknown>;
    const payeeKind =
      (row.payee_kind as string | null) ??
      inferDefaultPayeeKind(row.business_type as string | null);

    return successResponse({
      payee_kind: payeeKind,
      registered_business_name: (row.registered_business_name as string | null) ?? null,
      business_registration_number: (row.business_registration_number as string | null) ?? null,
      business_registration_country: (row.business_registration_country as string | null) ?? null,
      verified_person_role: (row.verified_person_role as string | null) ?? null,
      business_type: (row.business_type as string | null) ?? null,
      kyb_verification_status: (row.kyb_verification_status as string | null) ?? "not_started",
    });
  } catch (error) {
    return handleApiError(error, "Failed to load payee entity");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("providers")
      .select(
        "payee_kind, kyb_verification_status, registered_business_name, business_registration_number",
      )
      .eq("id", providerId)
      .maybeSingle();

    const updates: Record<string, unknown> = {};

    if (body.payee_kind === "individual" || body.payee_kind === "business") {
      const nextKind = body.payee_kind;
      const currentKind = (existing as { payee_kind?: string } | null)?.payee_kind;
      if (currentKind && currentKind !== nextKind) {
        const { data: activeKyb } = await admin
          .from("identity_verification_sessions")
          .select("id, status")
          .eq("provider_id", providerId)
          .eq("session_kind", "business")
          .not("status", "in", '("approved","rejected","expired","abandoned","errored")')
          .maybeSingle();
        if (activeKyb) {
          return errorResponse(
            "Finish or cancel your in-progress business verification before changing entity type.",
            "KYB_IN_PROGRESS",
            409,
          );
        }
      }
      updates.payee_kind = nextKind;
      if (nextKind === "individual") {
        updates.kyb_verification_status = "not_required";
        updates.registered_business_name = null;
        updates.business_registration_number = null;
        updates.business_registration_country = null;
        updates.verified_person_role = null;
      } else if (
        (existing as { kyb_verification_status?: string } | null)?.kyb_verification_status ===
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
      const regNum =
        typeof body.business_registration_number === "string"
          ? body.business_registration_number.trim() || null
          : null;
      updates.business_registration_number = regNum;

      // Advisory dedupe: warn if another provider already uses this registration number.
      if (regNum) {
        const normalized = regNum.replace(/[\s\-./]/g, "").toUpperCase();
        const { data: dupes } = await admin
          .from("providers")
          .select("id, business_name")
          .neq("id", providerId)
          .not("business_registration_number", "is", null)
          .limit(50);
        const conflict = (dupes ?? []).find((row) => {
          const other = String(
            (row as { business_registration_number?: string }).business_registration_number ?? "",
          )
            .replace(/[\s\-./]/g, "")
            .toUpperCase();
          return other.length > 0 && other === normalized;
        });
        if (conflict) {
          return errorResponse(
            "This registration number is already linked to another provider. Contact support if this is your company.",
            "REGISTRATION_NUMBER_IN_USE",
            409,
          );
        }
      }
    }
    if (body.business_registration_country !== undefined) {
      updates.business_registration_country =
        typeof body.business_registration_country === "string"
          ? body.business_registration_country.trim().toUpperCase() || null
          : null;
    }
    if (
      body.verified_person_role === "owner" ||
      body.verified_person_role === "authorized_representative"
    ) {
      updates.verified_person_role = body.verified_person_role;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const nextPayeeKind =
      (updates.payee_kind as string | undefined) ??
      (existing as { payee_kind?: string } | null)?.payee_kind;
    if (nextPayeeKind === "business") {
      const effectiveName =
        updates.registered_business_name !== undefined
          ? (updates.registered_business_name as string | null)
          : ((existing as { registered_business_name?: string | null } | null)
              ?.registered_business_name ?? null);
      if (!effectiveName || !String(effectiveName).trim()) {
        return errorResponse(
          "Registered business name is required for registered companies.",
          "VALIDATION_ERROR",
          400,
        );
      }
    }

    const { data: updated, error } = await admin
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select(
        "payee_kind, registered_business_name, business_registration_number, business_registration_country, verified_person_role, kyb_verification_status",
      )
      .single();

    if (error) throw error;

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update payee entity");
  }
}
