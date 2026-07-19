import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { closePaycloudOrder } from "@/lib/payments/paycloud-client";
import { resolvePaycloudContextForProvider } from "@/lib/payments/paycloud-credentials";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase, { request });
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

    if (payment.status === "successful" || payment.status === "cancelled" || payment.status === "closed") {
      return NextResponse.json({ data: payment, error: null });
    }

    const initiationChannel = (payment as { initiation_channel?: string }).initiation_channel ?? "cloud";
    const isSameTerminalPending =
      initiationChannel === "same_terminal" &&
      (payment.status === "pending" || payment.status === "processing");

    if (isSameTerminalPending) {
      await supabase
        .from("provider_paycloud_payments")
        .update({
          status: "closed",
          error_message: "Cancelled before WiseCashier completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (payment.terminal_id) {
        await supabase
          .from("paycloud_terminals")
          .update({ in_flight_payment_id: null })
          .eq("id", payment.terminal_id);
      }

      const { data: updated } = await supabase
        .from("provider_paycloud_payments")
        .select("*")
        .eq("id", id)
        .single();
      return NextResponse.json({ data: updated, error: null });
    }

    if (!payment.terminal_id) {
      return NextResponse.json({ data: null, error: { message: "No terminal linked", code: "NO_TERMINAL" } }, { status: 400 });
    }

    const ctx = await resolvePaycloudContextForProvider(supabase, providerId, payment.terminal_id);
    if (!ctx) {
      return NextResponse.json({ data: null, error: { message: "This card machine isn't fully set up yet.", code: "TERMINAL_NOT_CONFIGURED" } }, { status: 400 });
    }

    const { data: terminal } = await supabase
      .from("paycloud_terminals")
      .select("terminal_sn")
      .eq("id", payment.terminal_id)
      .single();

    const closeResult = await closePaycloudOrder(ctx.environment, ctx.credentials, {
      merchant_no: ctx.merchant_no,
      store_no: ctx.store_no,
      terminal_sn: terminal?.terminal_sn ?? "",
      merchant_order_no: payment.merchant_order_no,
    });

    const status = closeResult.success ? "closed" : payment.status;
    await supabase
      .from("provider_paycloud_payments")
      .update({
        status,
        trans_status: closeResult.trans_status,
        response_code: closeResult.response_code,
        error_message: closeResult.error_message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (closeResult.success && payment.terminal_id) {
      await supabase.from("paycloud_terminals").update({ in_flight_payment_id: null }).eq("id", payment.terminal_id);
    }

    const { data: updated } = await supabase.from("provider_paycloud_payments").select("*").eq("id", id).single();
    return NextResponse.json({ data: updated, error: null });
  } catch (error: any) {
    console.error("POST /api/provider/paycloud/payments/[id]/close:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to close payment", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
