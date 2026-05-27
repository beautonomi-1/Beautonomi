import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { notifyMembershipWinBack } from "@/lib/notifications/notification-service";

const bodySchema = z.object({
  message: z.string().max(500).optional().nullable(),
});

/**
 * POST /api/provider/membership-subscriptions/[id]/win-back
 * Send a win-back reminder to a cancelled salon member.
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
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    const admin = getSupabaseAdmin();

    const { data: row, error: fetchErr } = await (admin as any)
      .from("user_memberships")
      .select(
        "id, provider_id, user_id, status, cancelled_at, plan:membership_plans(id, name), provider:providers(id, business_name)",
      )
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!row) return notFoundResponse("Membership subscription not found");

    if (user.role !== "superadmin") {
      if (!providerId || row.provider_id !== providerId) {
        return notFoundResponse("Membership subscription not found");
      }
    }

    if (String(row.status ?? "") !== "cancelled") {
      return errorResponse(
        "Win-back reminders can only be sent to cancelled memberships.",
        "INVALID_STATE",
        409,
      );
    }

    const plan = Array.isArray(row.plan) ? row.plan[0] : row.plan;
    const provider = Array.isArray(row.provider) ? row.provider[0] : row.provider;
    const planName = plan?.name ?? "Membership";
    const providerName = provider?.business_name ?? "Your salon";

    await notifyMembershipWinBack(
      row.user_id,
      {
        providerName,
        membershipName: planName,
        message: parsed.data.message ?? null,
      },
    );

    return successResponse({ sent: true });
  } catch (error) {
    return handleApiError(error, "Failed to send membership win-back reminder");
  }
}
