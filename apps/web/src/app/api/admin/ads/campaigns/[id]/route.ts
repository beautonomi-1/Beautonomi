import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  forbiddenResponse,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requireSuperadminPlatform } from "@/lib/admin/require-superadmin-platform";
import { writeAuditLog } from "@/lib/audit/audit";

const patchSchema = z.object({
  status: z.enum(["paused", "ended"]),
  reason: z.string().max(500).optional(),
});

/**
 * PATCH /api/admin/ads/campaigns/[id]
 * Superadmin-only. Force-pause or end a provider campaign (trust & safety / billing oversight).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperadminPlatform(request);
    if (!auth.user) return forbiddenResponse("Superadmin only");

    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid input", "VALIDATION_ERROR", 400, parsed.error.issues);
    }
    const { status, reason } = parsed.data;

    const admin = getSupabaseAdmin();
    const { data: existing, error: fetchErr } = await admin
      .from("ads_campaigns")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) {
      return notFoundResponse("Campaign not found");
    }

    const prev = String((existing as { status: string }).status);
    if (prev === "ended") {
      return errorResponse("Campaign is already ended", "INVALID_STATE", 400);
    }
    if (status === "paused" && prev === "paused") {
      return errorResponse("Campaign is already paused", "INVALID_STATE", 400);
    }

    const { data: updated, error: updErr } = await admin
      .from("ads_campaigns")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updErr || !updated) {
      return handleApiError(updErr ?? new Error("Update failed"), "Failed to update campaign");
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: auth.user.role ?? "superadmin",
      action: "admin.ads.campaign.moderate",
      entity_type: "ads_campaign",
      entity_id: id,
      metadata: { previous_status: prev, new_status: status, reason: reason ?? null },
    });

    return successResponse({ campaign: updated });
  } catch (error) {
    return handleApiError(error as Error, "Failed to moderate ads campaign");
  }
}
