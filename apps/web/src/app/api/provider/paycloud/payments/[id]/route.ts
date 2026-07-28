import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { reconcilePaycloudPayment } from "@/lib/payments/paycloud-reconcile";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { data: payment } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json({ data: null, error: { message: "Payment not found", code: "NOT_FOUND" } }, { status: 404 });
    }

    if (payment.status === "pending" || payment.status === "processing") {
      const supabaseAdmin = getSupabaseAdmin();
      await reconcilePaycloudPayment(supabaseAdmin, payment);
    }

    const { data: updated } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({ data: updated ?? payment, error: null });
  } catch (error: unknown) {
    console.error("GET /api/provider/paycloud/payments/[id]:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to fetch payment", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
