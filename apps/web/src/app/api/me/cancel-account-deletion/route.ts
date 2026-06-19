import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { parseDeletionCancelToken } from "@/lib/account/deletion-cancel-token";
import { cancelScheduledAccountDeletion } from "@/lib/account/schedule-account-deletion";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const bodySchema = z.object({
  token: z.string().min(10).optional(),
  /** Support staff may cancel by user id when authenticated as superadmin. */
  user_id: z.string().uuid().optional(),
});

/**
 * POST /api/me/cancel-account-deletion
 *
 * Cancels a scheduled self-service deletion. Requires signed token from email,
 * or superadmin with user_id (support flow). Does NOT run on login.
 */
export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const admin = getSupabaseAdmin();
    let userId: string | null = null;
    let expectedPurgeAfter: string | undefined;

    if (parsed.data.token) {
      const payload = parseDeletionCancelToken(parsed.data.token);
      if (!payload) {
        return NextResponse.json(
          { error: "Invalid or expired cancellation token", code: "INVALID_TOKEN" },
          { status: 400 },
        );
      }
      userId = payload.userId;
      expectedPurgeAfter = payload.purgeAfterAt;
    } else if (parsed.data.user_id) {
      const { user } = await requireRoleInApi(["superadmin"], request);
      userId = parsed.data.user_id;
      void user;
    } else {
      return NextResponse.json(
        { error: "Provide token or user_id (superadmin)", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const result = await cancelScheduledAccountDeletion(admin, userId, expectedPurgeAfter);
    if (result.ok === false) {
      return NextResponse.json(
        { error: result.message, code: result.code ?? "CANCEL_FAILED" },
        { status: result.code === "NOT_FOUND" ? 404 : 400 },
      );
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: userId,
      action: "user.account.deletion_cancelled",
      entity_type: "user",
      entity_id: userId,
      module: "users_trust",
      risk_level: "high",
      status: "succeeded",
      metadata: {
        via: parsed.data.token ? "token" : "superadmin",
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({
      cancelled: true,
      message:
        "Account deletion has been cancelled. You may sign in again with your existing credentials.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to cancel account deletion");
  }
}
