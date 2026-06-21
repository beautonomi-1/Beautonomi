import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { getMarketingBalance } from "@/lib/marketing/credits";

export const dynamic = "force-dynamic";

type LedgerRow = {
  id: string;
  delta_zar: number | string;
  reason: string;
  channel: string | null;
  campaign_id: string | null;
  balance_after: number | string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

/**
 * GET /api/provider/marketing/credits/ledger
 *
 * Provider-facing marketing credit activity + spend summary. Gives providers
 * the same authoritative ledger visibility admins have, so the credits they are
 * billed per send are fully reconcilable in-app (not just a remaining balance).
 *
 * Summary is scoped to the current billing period (since period_start, the
 * monthly included-grant anchor) so "spent this period" aligns with the grant.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await (await import("@/lib/supabase/server")).getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const balance = await getMarketingBalance(supabase, providerId);

    const { data: creditRow } = await supabase
      .from("provider_marketing_credits")
      .select("period_start")
      .eq("provider_id", providerId)
      .maybeSingle();

    const periodStart =
      (creditRow as { period_start?: string | null } | null)?.period_start ??
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    // Recent activity feed (most recent first).
    const { data: recent } = await supabase
      .from("marketing_credit_ledger")
      .select("id, delta_zar, reason, channel, campaign_id, balance_after, created_at, metadata")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Period aggregation for the summary (bounded fetch).
    const { data: periodRows } = await supabase
      .from("marketing_credit_ledger")
      .select("delta_zar, reason, channel")
      .eq("provider_id", providerId)
      .gte("created_at", `${periodStart}T00:00:00.000Z`)
      .limit(5000);

    const summary = {
      period_start: periodStart,
      topped_up: 0,
      granted: 0,
      admin_adjustments: 0,
      spent: 0,
      refunded: 0,
      spent_by_channel: { email: 0, sms: 0, whatsapp: 0 } as Record<string, number>,
    };

    for (const r of (periodRows as Pick<LedgerRow, "delta_zar" | "reason" | "channel">[] | null) ?? []) {
      const delta = Number(r.delta_zar) || 0;
      switch (r.reason) {
        case "topup":
          summary.topped_up += delta;
          break;
        case "monthly_grant":
          summary.granted += delta;
          break;
        case "admin_adjustment":
          summary.admin_adjustments += delta;
          break;
        case "refund":
          summary.refunded += delta;
          break;
        case "campaign_send":
        case "automation_send":
          summary.spent += Math.abs(delta);
          if (r.channel && r.channel in summary.spent_by_channel) {
            summary.spent_by_channel[r.channel] += Math.abs(delta);
          }
          break;
      }
    }

    return successResponse({
      balance,
      summary,
      ledger: (recent as LedgerRow[] | null) ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch marketing credit activity");
  }
}
