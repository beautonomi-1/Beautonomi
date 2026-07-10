import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import {
  reconcilePaycloudPaymentsBatch,
  reconcileWindowFromDays,
} from "@/lib/payments/paycloud-reconcile";

const RATE_LIMIT_MS = 60_000;
const lastReconcileByProvider = new Map<string, number>();

/**
 * POST /api/provider/paycloud/payments/reconcile
 * Provider-triggered "check status" for recent pending PayCloud payments.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }

    const now = Date.now();
    const last = lastReconcileByProvider.get(providerId) ?? 0;
    if (now - last < RATE_LIMIT_MS) {
      return NextResponse.json(
        { data: null, error: { message: "Please wait a moment before checking again.", code: "RATE_LIMITED" } },
        { status: 429 },
      );
    }
    lastReconcileByProvider.set(providerId, now);

    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const from = reconcileWindowFromDays(7).toISOString();
    const { data: payments, error } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("provider_id", providerId)
      .in("status", ["pending", "processing"])
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    const summary = await reconcilePaycloudPaymentsBatch({
      supabase,
      payments: payments ?? [],
    });

    return NextResponse.json({ data: summary, error: null });
  } catch (error: unknown) {
    console.error("POST /api/provider/paycloud/payments/reconcile:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to reconcile payments", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
