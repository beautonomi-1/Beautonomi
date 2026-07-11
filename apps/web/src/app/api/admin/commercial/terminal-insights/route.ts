/**
 * GET /api/admin/commercial/terminal-insights
 *
 * Returns paginated, filterable provider terminal profile data for
 * Superadmin Commercial Operations → Terminal Insights.
 *
 * Query params:
 *   page, per_page, terminal_ownership_status, terminal_provider,
 *   interested_in_platform_terminal, has_payment_terminal, search,
 *   segment (all | upsell_opportunities | interested | has_terminal)
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
  isTerminalUpsellOpportunity,
  loadTerminalUpsellSegmentContext,
  providerHasTerminalBundlePlan,
  rowMatchesSegment,
  type TerminalInsightsSegment,
  UPSELL_OWNERSHIP_STATUSES,
} from "@/lib/terminal/terminal-upsell-segment";

const VALID_SEGMENTS = new Set<TerminalInsightsSegment>([
  "all",
  "upsell_opportunities",
  "interested",
  "has_terminal",
]);

type RawInsightRow = Record<string, unknown>;

async function computeInsightCounts(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  context: Awaited<ReturnType<typeof loadTerminalUpsellSegmentContext>>,
) {
  const { data: profiles, error } = await supabase
    .from("provider_payment_terminal_profile")
    .select(
      `
      provider_id,
      terminal_ownership_status,
      interested_in_platform_terminal,
      providers!inner(
        id,
        tenant_id,
        provider_subscriptions(plan_id, status, subscription_plans(features))
      )
      `,
    )
    .eq("providers.tenant_id", tenantId);

  if (error) throw error;

  let total = 0;
  let upsellOpportunities = 0;
  let interested = 0;

  for (const row of profiles ?? []) {
    total += 1;
    const providerId = String((row as { provider_id: string }).provider_id);
    const providerRaw = (row as { providers: unknown }).providers;
    const provider = Array.isArray(providerRaw) ? providerRaw[0] : providerRaw;
    const subscriptions = (
      (provider as { provider_subscriptions?: unknown } | null)?.provider_subscriptions ?? []
    ) as Array<{
      plan_id?: string;
      status?: string;
      subscription_plans?: { features?: unknown } | null;
    }>;
    const hasBundlePlan = providerHasTerminalBundlePlan(
      subscriptions,
      context.bundlePlanIds,
    );
    const hasTerminalHardware = context.hardwareProviderIds.has(providerId);
    const ownership = (row as { terminal_ownership_status?: string | null })
      .terminal_ownership_status;
    const isOpportunity = isTerminalUpsellOpportunity({
      terminalOwnershipStatus: ownership,
      hasBundlePlan,
      hasTerminalHardware,
    });
    if (isOpportunity) {
      upsellOpportunities += 1;
      if (
        (row as { interested_in_platform_terminal?: string | null })
          .interested_in_platform_terminal === "yes"
      ) {
        interested += 1;
      }
    }
  }

  const { count: inPipeline } = await supabase
    .from("terminal_upsell_leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["new", "contacted", "quoted"]);

  const { count: won } = await supabase
    .from("terminal_upsell_leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "won");

  return {
    total,
    upsell_opportunities: upsellOpportunities,
    interested,
    in_pipeline: inPipeline ?? 0,
    won: won ?? 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);

    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, parseInt(searchParams.get("per_page") || "25", 10));
    const offset = (page - 1) * perPage;

    const ownershipFilter = searchParams.get("terminal_ownership_status");
    const providerFilter = searchParams.get("terminal_provider");
    const interestFilter = searchParams.get("interested_in_platform_terminal");
    const hasTerminalFilter = searchParams.get("has_payment_terminal");
    const search = searchParams.get("search");
    const segmentParam = (searchParams.get("segment") || "all") as TerminalInsightsSegment;
    const segment = VALID_SEGMENTS.has(segmentParam) ? segmentParam : "all";

    const supabase = getSupabaseAdmin();
    const context = await loadTerminalUpsellSegmentContext(supabase, tenantId);

    let query = supabase
      .from("provider_payment_terminal_profile")
      .select(
        `
        id,
        provider_id,
        has_payment_terminal,
        terminal_ownership_status,
        terminal_provider,
        terminal_provider_other,
        terminal_count_range,
        terminal_active_usage_status,
        interested_in_platform_terminal,
        interested_in_terminal_subscription,
        source,
        captured_at,
        updated_at,
        providers!inner(
          id,
          business_name,
          slug,
          status,
          tenant_id,
          provider_subscriptions(plan_id, status, subscription_plans(name, slug, features)),
          terminal_upsell_leads(
            id,
            status,
            assigned_to,
            notes,
            updated_at,
            assigned_user:users!terminal_upsell_leads_assigned_to_fkey(id, full_name, email)
          )
        )
        `,
      )
      .eq("providers.tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    if (ownershipFilter) {
      query = query.eq("terminal_ownership_status", ownershipFilter);
    } else if (segment === "upsell_opportunities" || segment === "interested") {
      query = query.in("terminal_ownership_status", [...UPSELL_OWNERSHIP_STATUSES]);
    } else if (segment === "has_terminal") {
      query = query.eq("terminal_ownership_status", "has_terminal");
    }

    if (providerFilter) {
      query = query.eq("terminal_provider", providerFilter);
    }
    if (interestFilter) {
      query = query.eq("interested_in_platform_terminal", interestFilter);
    } else if (segment === "interested") {
      query = query.eq("interested_in_platform_terminal", "yes");
    }
    if (hasTerminalFilter !== null && searchParams.has("has_payment_terminal")) {
      query = query.eq("has_payment_terminal", hasTerminalFilter === "true");
    }
    if (search) {
      query = query.ilike("providers.business_name", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return errorResponse("Failed to load terminal insights", "LOAD_ERROR", 500, error);
    }

    const enriched = (data ?? []).map((row) =>
      enrichTerminalInsightRow(row as RawInsightRow, context),
    );

    const filtered =
      segment === "all"
        ? enriched
        : enriched.filter((row) => rowMatchesSegment(row, segment));

    const total = filtered.length;
    const items = filtered.slice(offset, offset + perPage);
    const counts = await computeInsightCounts(supabase, tenantId, context);

    return successResponse({
      items,
      total,
      page,
      per_page: perPage,
      counts,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal insights");
  }
}
