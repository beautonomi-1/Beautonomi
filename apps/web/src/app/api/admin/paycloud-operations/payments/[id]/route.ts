import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { humanizePaycloudIntentResult } from "@/lib/payments/paycloud-intent-result-codes";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Support-facing diagnostics for a single PayCloud payment.
 *
 * Everything here already exists in the database but was previously only
 * reachable via direct SQL, which meant support could not answer "why did this
 * card payment fail?" from the admin portal.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: payment, error } = await (supabase.from("provider_paycloud_payments") as any)
      .select(
        `
          *,
          provider:providers(id, business_name, slug),
          terminal:paycloud_terminals(
            id, display_name, terminal_sn, status, model, location_id, metadata, last_error
          )
        `,
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!payment) return notFoundResponse("Payment not found");

    const { data: webhookEvents } = await supabase
      .from("paycloud_webhook_events")
      .select("id, event_type, signature_valid, processed, processing_error, payload, created_at")
      .eq("payment_id", id)
      .order("created_at", { ascending: true })
      .limit(50);

    // Older webhooks may predate payment_id linkage but still carry the order no.
    let events = webhookEvents ?? [];
    if (events.length === 0 && payment.merchant_order_no) {
      const { data: byOrderNo } = await supabase
        .from("paycloud_webhook_events")
        .select("id, event_type, signature_valid, processed, processing_error, payload, created_at")
        .eq("merchant_order_no", payment.merchant_order_no)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(50);
      events = byOrderNo ?? [];
    }

    const metadata = asRecord(payment.metadata);
    const intent = asRecord(metadata.same_terminal_intent);
    const device = asRecord(metadata.device);
    const terminalMeta = asRecord(payment.terminal?.metadata);

    const intentResultCode = asString(intent.result);

    const diagnostics = {
      initiation_channel: payment.initiation_channel ?? "cloud",
      response_code: asString(payment.response_code),
      error_message: asString(payment.error_message),
      trans_status: payment.trans_status ?? null,
      pay_scenario: payment.pay_scenario ?? null,
      pay_method_id: payment.pay_method_id ?? null,
      /** Device that physically took the charge (same-terminal Intent flow). */
      device: {
        serial: asString(device.serial) ?? asString(terminalMeta.last_device_serial),
        model: asString(device.model) ?? asString(payment.terminal?.model),
        manufacturer:
          asString(device.manufacturer) ?? asString(terminalMeta.last_device_manufacturer),
        serial_source: asString(device.serial_source) ?? asString(terminalMeta.last_serial_source),
        paired_device_id: asString(terminalMeta.paired_device_id),
      },
      /** WiseCashier Intent outcome, present only for same-terminal payments. */
      intent: intentResultCode
        ? {
            result: intentResultCode,
            result_message: asString(intent.resultMsg),
            explanation: humanizePaycloudIntentResult(
              intentResultCode,
              asString(intent.resultMsg),
            ),
            transaction_id: asString(intent.transaction_id),
            ref_no: asString(intent.ref_no),
            auth_code: asString(intent.auth_code),
            card_no: asString(intent.card_no),
            trans_date: asString(intent.trans_date),
            trans_time: asString(intent.trans_time),
            confirmed_at: asString(intent.confirmed_at),
          }
        : null,
    };

    return successResponse({
      payment,
      diagnostics,
      webhook_events: events,
      raw: {
        request: payment.raw_request ?? null,
        response: payment.raw_response ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load PayCloud payment detail");
  }
}
