/**
 * POST /api/admin/identity-verification/sessions/[id]/override
 *
 * Manually override a session status (approve/reject/reset).
 * All actions are permission-gated + audited.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  syncProviderVerificationState,
  type ProviderVerificationOutcome,
} from "@/lib/verification/sync-provider-verification";
import type { NormalizedVerificationStatus } from "@/lib/identity-verification/types";

function mapOverrideToSessionStatus(
  adminStatus: string,
): NormalizedVerificationStatus {
  if (adminStatus === "approved") return "approved";
  if (adminStatus === "rejected") return "rejected";
  // Admin "reset" maps to abandoned — the DB enum has no `reset` value.
  return "abandoned";
}

function mapOverrideToKybStatus(adminStatus: string): string {
  if (adminStatus === "approved") return "approved";
  if (adminStatus === "rejected") return "rejected";
  return "not_started";
}

function mapOverrideToProviderOutcome(adminStatus: string): ProviderVerificationOutcome {
  if (adminStatus === "approved") return "approved";
  if (adminStatus === "rejected") return "rejected";
  return "reset";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = await request.json() as { status: string; reason?: string };
    const { status: newStatus, reason } = body;

    if (!["approved","rejected","reset"].includes(newStatus)) {
      return errorResponse("Invalid status. Use: approved, rejected, reset", "INVALID_STATUS", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: session, error } = await supabase
      .from("identity_verification_sessions")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error || !session) return errorResponse("Session not found", "NOT_FOUND", 404);

    const storedSessionStatus = mapOverrideToSessionStatus(newStatus);

    await supabase
      .from("identity_verification_sessions")
      .update({
        status:           storedSessionStatus,
        rejection_reason: reason ?? null,
        completed_at:     ["approved","rejected"].includes(newStatus) ? new Date().toISOString() : null,
        last_event_at:    new Date().toISOString(),
        ...(newStatus === "reset"
          ? { decision: null, name_mismatch_flag: false, identity_dedupe_flag: false, under_age_flag: false }
          : {}),
      })
      .eq("id", params.id);

    const persona = (session as Record<string, unknown>).persona_type as string;
    const providerId = (session as Record<string, unknown>).provider_id as string | null;
    const userId = (session as Record<string, unknown>).user_id as string;
    const sessionKind = ((session as Record<string, unknown>).session_kind as string | undefined) ?? "user";

    if (persona === "provider" && providerId) {
      if (sessionKind === "business") {
        await supabase
          .from("providers")
          .update({ kyb_verification_status: mapOverrideToKybStatus(newStatus) })
          .eq("id", providerId);
      } else {
        const { data: provRow } = await supabase
          .from("providers")
          .select("user_id")
          .eq("id", providerId)
          .maybeSingle();
        const ownerUserId = (provRow as { user_id?: string } | null)?.user_id ?? userId;

        await syncProviderVerificationState(supabase, {
          providerId,
          userId: ownerUserId,
          status: mapOverrideToProviderOutcome(newStatus),
          source: newStatus === "reset" ? "admin_reset" : "manual_admin",
          diditSessionId: params.id,
          metadata: { reason, admin_override: true },
        });
      }
    } else {
      const legacyStatus =
        newStatus === "approved"
          ? "approved"
          : newStatus === "rejected"
            ? "rejected"
            : "not_started";
      await supabase
        .from("users")
        .update({
          identity_verified: newStatus === "approved",
          identity_verification_status: legacyStatus,
        })
        .eq("id", userId);
    }

    await supabase.from("audit_logs").insert({
      actor_user_id: user.id,
      action:        "identity_verification.admin_override",
      resource_type: "identity_verification_session",
      resource_id:   params.id,
      metadata:      {
        new_status: newStatus,
        stored_session_status: storedSessionStatus,
        session_kind: sessionKind,
        reason,
        session_id: params.id,
      },
    }).throwOnError();

    return successResponse({ ok: true, new_status: newStatus, stored_session_status: storedSessionStatus });
  } catch (err) {
    return handleApiError(err);
  }
}
