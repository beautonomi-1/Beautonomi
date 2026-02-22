import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, handleApiError } from "@/lib/supabase/api-helpers";

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function formatRangeStart(range: string, now: Date): Date {
  if (range === "week") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  if (range === "year") return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (range === "all") return new Date(0);
  return new Date(now.getFullYear(), now.getMonth(), 1); // month default
}

/**
 * GET /api/provider/finance/export?range=month|week|year|all
 * Returns a basic CSV export of finance_transactions for the provider.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
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

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "month";
    const now = new Date();
    const startDate = formatRangeStart(range, now);
    const startIso = startDate.toISOString();
    const endIso = now.toISOString();

    const { data, error } = await supabase
      .from("finance_transactions")
      .select("id, created_at, transaction_type, amount, net, description")
      .eq("provider_id", providerId)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

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

