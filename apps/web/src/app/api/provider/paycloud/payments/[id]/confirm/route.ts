import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { reconcilePaycloudPayment } from "@/lib/payments/paycloud-reconcile";
import { isPaycloudIntentResultApproved } from "@/lib/payments/paycloud-intent-result-codes";
import { z } from "zod";

const confirmSchema = z.object({
  intent_result: z
    .object({
      result: z.string().optional(),
      resultMsg: z.string().optional(),
      transData: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    })
    .optional(),
  device_model: z.string().min(1).optional(),
  device_manufacturer: z.string().min(1).optional(),
  serial_source: z.enum(["build_serial", "wiseasy_property", "android_id"]).optional(),
});

function parseIntentTransData(
  raw: string | Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * POST /api/provider/paycloud/payments/[id]/confirm
 * Record same-terminal Intent hint, then poll orderquery and settle (server truth).
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
    const body = await request.json().catch(() => ({}));
    const parsed = confirmSchema.safeParse(body);

    const { data: payment } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!payment) {
      return NextResponse.json({ data: null, error: { message: "Payment not found", code: "NOT_FOUND" } }, { status: 404 });
    }

    if (parsed.success && parsed.data.intent_result) {
      const intent = parsed.data.intent_result;
      const transData = parseIntentTransData(intent.transData);
      const paymentMeta = (payment.metadata ?? {}) as Record<string, unknown>;
      const intentMeta: Record<string, unknown> = {
        result: intent.result ?? null,
        resultMsg: intent.resultMsg ?? null,
        approved: isPaycloudIntentResultApproved(intent.result),
        confirmed_at: new Date().toISOString(),
      };
      if (transData) {
        if (typeof transData.transactionID === "string") intentMeta.transaction_id = transData.transactionID;
        if (typeof transData.refNo === "string") intentMeta.ref_no = transData.refNo;
        if (typeof transData.authCode === "string") intentMeta.auth_code = transData.authCode;
        if (typeof transData.cardNo === "string") intentMeta.card_no = transData.cardNo;
        if (typeof transData.transDate === "string") intentMeta.trans_date = transData.transDate;
        if (typeof transData.transTime === "string") intentMeta.trans_time = transData.transTime;
      }

      const updates: Record<string, unknown> = {
        metadata: {
          ...paymentMeta,
          same_terminal_intent: intentMeta,
        },
        updated_at: new Date().toISOString(),
      };

      if (intent.result && !isPaycloudIntentResultApproved(intent.result)) {
        updates.status = payment.status === "pending" ? "processing" : payment.status;
        updates.error_message = intent.resultMsg ?? `Intent result ${intent.result}`;
      } else if (isPaycloudIntentResultApproved(intent.result)) {
        updates.status = payment.status === "pending" ? "processing" : payment.status;
      }

      await admin.from("provider_paycloud_payments").update(updates).eq("id", payment.id);

      if (payment.terminal_id && (parsed.data.device_model || parsed.data.device_manufacturer)) {
        const { data: terminal } = await admin
          .from("paycloud_terminals")
          .select("model, metadata")
          .eq("id", payment.terminal_id)
          .maybeSingle();
        const terminalMeta = (terminal?.metadata ?? {}) as Record<string, unknown>;
        if (parsed.data.serial_source) terminalMeta.last_serial_source = parsed.data.serial_source;
        if (parsed.data.device_manufacturer) {
          terminalMeta.last_device_manufacturer = parsed.data.device_manufacturer.trim();
        }
        await admin
          .from("paycloud_terminals")
          .update({
            model: parsed.data.device_model?.trim() || terminal?.model || null,
            metadata: terminalMeta,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.terminal_id);
      }
    }

    const { data: refreshed } = await admin
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const result = await reconcilePaycloudPayment(admin, (refreshed ?? payment) as any);
    const { data: finalPayment } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({
      data: {
        ...result,
        payment: finalPayment,
      },
      error: null,
    });
  } catch (error: unknown) {
    console.error("POST /api/provider/paycloud/payments/[id]/confirm:", error);
    return NextResponse.json(
      { data: null, error: { message: "Failed to confirm payment", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
