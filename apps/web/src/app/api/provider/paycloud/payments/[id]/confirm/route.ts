import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { reconcilePaycloudPayment } from "@/lib/payments/paycloud-reconcile";

/**
 * POST /api/provider/paycloud/payments/[id]/confirm
 * Poll orderquery and settle after same-terminal Intent success hint.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }

    const { id } = await params;
    const { data: payment } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!payment) {
      return NextResponse.json({ data: null, error: { message: "Payment not found", code: "NOT_FOUND" } }, { status: 404 });
    }

    const result = await reconcilePaycloudPayment(admin, payment as any);
    return NextResponse.json({ data: result, error: null });
  } catch (error: unknown) {
    console.error("POST /api/provider/paycloud/payments/[id]/confirm:", error);
    return NextResponse.json(
      { data: null, error: { message: "Failed to confirm payment", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
