import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { fromBusinessTime, nowInTz } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";

function csvEscape(value: any): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function formatRangeStart(range: string, timezone: string): Date {
  const now = nowInTz(timezone);
  if (range === "week") return fromBusinessTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7), timezone);
  if (range === "year") return fromBusinessTime(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()), timezone);
  if (range === "all") return new Date(0);
  return fromBusinessTime(new Date(now.getFullYear(), now.getMonth(), 1), timezone); // month default
}

/**
 * GET /api/provider/finance/export?range=month|week|year|all
 * Returns a basic CSV export of finance_transactions for the provider.
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

    const filename = `provider-finance-${range}-${now.toISOString().slice(0, 10)}.csv`;
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

