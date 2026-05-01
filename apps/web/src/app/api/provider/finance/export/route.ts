import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { subDays, subYears, startOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

function csvEscape(value: any): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function formatRangeStart(range: string, timezone: string): Date {
  const now = new Date();
  const todayYmd = formatDateYmd(now, timezone);
  const zNow = toZonedTime(now, timezone);
  if (range === "all") return new Date(0);
  if (range === "week") {
    const fromYmd = formatDateYmd(subDays(zNow, 7), timezone);
    return new Date(dateRangeBoundsUtc(fromYmd, todayYmd, timezone).fromIso);
  }
  if (range === "year") {
    const fromYmd = formatDateYmd(subYears(zNow, 1), timezone);
    return new Date(dateRangeBoundsUtc(fromYmd, fromYmd, timezone).fromIso);
  }
  const monthStartYmd = formatDateYmd(startOfMonth(zNow), timezone);
  return new Date(dateRangeBoundsUtc(monthStartYmd, monthStartYmd, timezone).fromIso);
}

/**
 * GET /api/provider/finance/export?range=month|week|year|all
 * Returns a basic CSV export of finance_transactions for the provider (org-wide; not branch-filtered).
 * `location_id` and other query keys are ignored — use reports for location-scoped exports if needed.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(["view_sales", "view_reports", "process_payments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return new Response("id,created_at,transaction_type,amount,net,description\n", {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="provider-finance.csv"`,
        },
      });
    }

    const db = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "month";
    const now = new Date();
    const reportContext = await getProviderReportContext(db as any, providerId);
    const startDate = formatRangeStart(range, reportContext.timezone);
    const startIso = startDate.toISOString();
    const endIso = now.toISOString();

    const data: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await db
        .from("finance_transactions")
        .select("id, created_at, transaction_type, amount, net, description")
        .eq("provider_id", providerId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      data.push(...(page ?? []));
      if (!page || page.length < pageSize) break;
    }

    const header = ["id", "created_at", "transaction_type", "amount", "net", "description"];
    const lines = [header.join(",")];
    for (const r of data || []) {
      lines.push(
        [
          csvEscape((r as any).id),
          csvEscape((r as any).created_at),
          csvEscape((r as any).transaction_type),
          csvEscape((r as any).amount),
          csvEscape((r as any).net),
          csvEscape((r as any).description),
        ].join(",")
      );
    }

    const filename = `provider-finance-${range}-${formatDateYmd(now, reportContext.timezone)}.csv`;
    return new Response(lines.join("\n") + "\n", {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export finance CSV");
  }
}

