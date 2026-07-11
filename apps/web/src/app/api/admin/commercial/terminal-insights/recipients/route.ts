/**
 * GET /api/admin/commercial/terminal-insights/recipients
 *
 * Resolves the provider owner user IDs for a Terminal Insights segment so
 * superadmin can target the cohort with a broadcast (push/email/SMS).
 *
 * Query params:
 *   segment (all | upsell_opportunities | interested | has_terminal)
 *
 * Response: { segment, provider_count, user_ids }
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  enrichTerminalInsightRow,
  loadTerminalUpsellSegmentContext,
  rowMatchesSegment,
  type TerminalInsightsSegment,
} from "@/lib/terminal/terminal-upsell-segment";

const VALID_SEGMENTS = new Set<TerminalInsightsSegment>([
  "all",
  "upsell_opportunities",
  "interested",
  "has_terminal",
]);

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const segmentParam = (searchParams.get("segment") ||
      "upsell_opportunities") as TerminalInsightsSegment;
    const segment = VALID_SEGMENTS.has(segmentParam)
      ? segmentParam
      : "upsell_opportunities";

    const supabase = getSupabaseAdmin();
    const context = await loadTerminalUpsellSegmentContext(supabase, tenantId);

    const { data, error } = await supabase
      .from("provider_payment_terminal_profile")
      .select(
        `
        provider_id,
        terminal_ownership_status,
        interested_in_platform_terminal,
        providers!inner(
          id,
          user_id,
          tenant_id,
          provider_subscriptions(plan_id, status, subscription_plans(features))
        )
        `,
      )
      .eq("providers.tenant_id", tenantId);

    if (error) {
      return errorResponse("Failed to resolve segment recipients", "LOAD_ERROR", 500, error);
    }

    const userIds = new Set<string>();
    let providerCount = 0;

    for (const raw of data ?? []) {
      const enriched = enrichTerminalInsightRow(
        raw as Record<string, unknown>,
        context,
      );
      if (!rowMatchesSegment(enriched, segment)) continue;
      providerCount += 1;
      const provider = enriched.providers as { user_id?: string | null } | null;
      const userId = provider?.user_id;
      if (typeof userId === "string" && userId.trim()) {
        userIds.add(userId);
      }
    }

    return successResponse({
      segment,
      provider_count: providerCount,
      user_ids: [...userIds],
    });
  } catch (error) {
    return handleApiError(error, "Failed to resolve segment recipients");
  }
}
