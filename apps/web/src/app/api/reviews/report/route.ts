import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { slackNotifyContentReportCreated } from "@/lib/integrations/slack/ops-triggers";
import { maybeAutoHideReportedContent } from "@/lib/safety/moderation-actions";
import { isFeatureEnabledServer, getFeatureFlagMetadata } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

const LEGACY_REVIEW_REASON_MAP: Record<string, string> = {
  inappropriate: "inappropriate",
  misleading: "misleading",
  harassment: "harassment",
  spam: "spam",
  fake: "misleading",
  other: "other",
};

/**
 * POST /api/reviews/report
 * Legacy endpoint — delegates to unified content_reports (target_type: review).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json();

    const reviewId = typeof body.review_id === "string" ? body.review_id.trim() : "";
    const rawReason = typeof body.reason === "string" ? body.reason.trim().toLowerCase() : "";
    if (!reviewId) {
      return errorResponse("review_id is required", "VALIDATION_ERROR", 400);
    }
    if (!rawReason) {
      return errorResponse("reason is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: review } = await supabase
      .from("reviews")
      .select("id")
      .eq("id", reviewId)
      .maybeSingle();
    if (!review) {
      return errorResponse("Review not found", "NOT_FOUND", 404);
    }

    const reason = LEGACY_REVIEW_REASON_MAP[rawReason] ?? "other";

    const { data: row, error } = await supabase
      .from("content_reports")
      .insert({
        reporter_id: user.id,
        target_type: "review",
        target_id: reviewId,
        reason,
        details: `Legacy review report: ${rawReason}`,
        tenant_id: tenantId,
        status: "pending",
      })
      .select("id, target_type, target_id, reason, status, created_at")
      .single();

    if (error) return handleApiError(error, "Failed to report review");
    if (!row) {
      return errorResponse("Failed to report review", "INTERNAL_ERROR", 500);
    }

    if (tenantId) {
      slackNotifyContentReportCreated({
        tenantId,
        reportId: row.id,
        targetType: String(row.target_type),
        reason: String(row.reason),
      });
    }

    const autoHideEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.SAFETY_AUTO_HIDE_REPORT_THRESHOLD,
      tenantId,
    );
    if (autoHideEnabled) {
      const meta = await getFeatureFlagMetadata(
        FEATURE_FLAG_KEYS.SAFETY_AUTO_HIDE_REPORT_THRESHOLD,
        tenantId,
      );
      const threshold =
        typeof meta.threshold === "number" && Number.isFinite(meta.threshold)
          ? Math.max(1, Math.floor(meta.threshold))
          : 3;
      const windowHours =
        typeof meta.window_hours === "number" && Number.isFinite(meta.window_hours)
          ? Math.max(1, Math.floor(meta.window_hours))
          : 24;
      await maybeAutoHideReportedContent(supabase, {
        targetType: "review",
        targetId: reviewId,
        threshold,
        windowHours,
        systemUserId: null,
      }).catch((e) => console.warn("[review-report] auto-hide failed:", e));
    }

    return successResponse(row, 201);
  } catch (error) {
    return handleApiError(error, "Failed to report review");
  }
}
