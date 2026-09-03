/**
 * GET /api/cron/recognize-gift-card-breakage
 * Monthly per-tenant recognition of expired unredeemed gift card balances (migration 732).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/with-cron-lock";

export const maxDuration = 300;

type TenantRow = { id: string };

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const outcome = await withCronLock(supabase, "recognize-gift-card-breakage", async () => {
    const { data: tenants, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("status", "active");

    if (tenantError) {
      throw new Error(tenantError.message);
    }

    const results: Array<{
      tenant_id: string;
      recognized_count: number;
      recognized_amount: number;
      error?: string;
    }> = [];

    for (const tenant of (tenants ?? []) as TenantRow[]) {
      const { data, error } = await (supabase.rpc as CallableFunction)("recognize_gift_card_breakage", {
        p_tenant_id: tenant.id,
      });

      if (error) {
        results.push({
          tenant_id: tenant.id,
          recognized_count: 0,
          recognized_amount: 0,
          error: error.message,
        });
        continue;
      }

      const row = Array.isArray(data) ? data[0] : data;
      results.push({
        tenant_id: tenant.id,
        recognized_count: Number((row as { recognized_count?: number })?.recognized_count ?? 0),
        recognized_amount: Number((row as { recognized_amount?: number })?.recognized_amount ?? 0),
      });
    }

    const totalCount = results.reduce((s, r) => s + r.recognized_count, 0);
    const totalAmount = results.reduce((s, r) => s + r.recognized_amount, 0);

    return {
      ok: true,
      tenants_processed: results.length,
      total_recognized_count: totalCount,
      total_recognized_amount: totalAmount,
      results,
    };
  });

  if (outcome.status === "skipped") {
    return NextResponse.json({ ok: true, skipped: true, reason: outcome.reason });
  }
  if (outcome.status === "failed") {
    return NextResponse.json({ error: outcome.error }, { status: 500 });
  }

  return NextResponse.json(outcome.result);
}
