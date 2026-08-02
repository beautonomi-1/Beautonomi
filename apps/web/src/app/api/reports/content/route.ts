import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { slackNotifyContentReportCreated } from "@/lib/integrations/slack/ops-triggers";
import { maybeAutoHideReportedContent } from "@/lib/safety/moderation-actions";
import { isFeatureEnabledServer, getFeatureFlagMetadata } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

const TARGET_TYPES = [
  "explore_post",
  "explore_comment",
  "message",
  "review",
  "product_review",
] as const;

const REASONS = [
  "inappropriate",
  "misleading",
  "harassment",
  "spam",
  "safety",
  "other",
] as const;

type TargetType = (typeof TARGET_TYPES)[number];
type ReportReason = (typeof REASONS)[number];

/**
 * POST /api/reports/content
 * Report UGC content (explore posts, comments, messages, reviews).
 * Body: { target_type, target_id, reason, details? }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json();

    const targetType = body.target_type as TargetType;
    const targetId =
      typeof body.target_id === "string" ? body.target_id.trim() : "";
    const reason = body.reason as ReportReason;
    const details =
      typeof body.details === "string" ? body.details.trim() : null;

    if (!targetType || !TARGET_TYPES.includes(targetType)) {
      return errorResponse(
        `target_type must be one of: ${TARGET_TYPES.join(", ")}`,
        "VALIDATION_ERROR",
        400
      );
    }

    if (!targetId) {
      return errorResponse("target_id is required", "VALIDATION_ERROR", 400);
    }

    if (!reason || !REASONS.includes(reason)) {
      return errorResponse(
        `reason must be one of: ${REASONS.join(", ")}`,
        "VALIDATION_ERROR",
        400
      );
    }

    if (details && details.length > 2000) {
      return errorResponse(
        "details must be 2000 characters or fewer",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: row, error } = await supabase
      .from("content_reports")
      .insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details || null,
        tenant_id: tenantId,
        status: "pending",
      })
      .select(
        "id, target_type, target_id, reason, status, created_at"
      )
      .single();

    if (error) return handleApiError(error, "Failed to create content report");
    if (!row) {
      return errorResponse("Failed to create content report", "INTERNAL_ERROR", 500);
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
        targetType: targetType,
        targetId,
        threshold,
        windowHours,
        systemUserId: null,
      }).catch((e) => console.warn("[content-report] auto-hide failed:", e));
    }

    return successResponse(row, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create content report");
  }
}
