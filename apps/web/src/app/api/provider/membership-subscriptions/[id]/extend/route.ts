import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const bodySchema = z.object({
  days: z.number().int().min(1).max(365),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/provider/membership-subscriptions/[id]/extend
 * Manually extend a salon membership period (no charge). Audited.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse("days must be an integer between 1 and 365", "VALIDATION_ERROR", 400);
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    const admin = getSupabaseAdmin();

    const { data: row, error: fetchErr } = await admin
      .from("user_memberships")
      .select("id, provider_id, user_id, status, expires_at, next_billing_at")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) return notFoundResponse("Membership subscription not found");

    const membership = row as {
      id: string;
      provider_id: string;
      user_id: string;
      status: string;
      expires_at?: string | null;
      next_billing_at?: string | null;
    };

    if (user.role !== "superadmin") {
      if (!providerId || membership.provider_id !== providerId) {
        return notFoundResponse("Membership subscription not found");
      }
    }

    const days = parsed.data.days;
    const baseExpires = membership.expires_at ? new Date(membership.expires_at) : new Date();
    const newExpires = new Date(baseExpires.getTime() + days * 24 * 60 * 60 * 1000);
    const updates: Record<string, unknown> = {
      expires_at: newExpires.toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (membership.next_billing_at) {
      const next = new Date(membership.next_billing_at);
      if (Number.isFinite(next.getTime())) {
        updates.next_billing_at = new Date(next.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
      }
    }
    if (membership.status === "expired" && newExpires.getTime() > Date.now()) {
      updates.status = "active";
      updates.cancelled_at = null;
    }

    const { data: updated, error: updErr } = await admin
      .from("user_memberships")
      .update(updates)
      .eq("id", id)
      .select("id, user_id, plan_id, provider_id, status, expires_at, next_billing_at, updated_at")
      .single();
    if (updErr) throw updErr;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "provider.membership.extend",
      entity_type: "user_membership",
      entity_id: id,
      module: "memberships",
      risk_level: "medium",
      retention_tier: "financial",
      status: "succeeded",
      metadata: {
        days,
        note: parsed.data.note ?? null,
        previous_expires_at: membership.expires_at ?? null,
        new_expires_at: newExpires.toISOString(),
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ subscription: updated, days_added: days });
  } catch (error) {
    return handleApiError(error, "Failed to extend membership");
  }
}
