import type { SupabaseClient } from "@supabase/supabase-js";
import { closePaycloudOrder } from "@/lib/payments/paycloud-client";
import { resolvePaycloudContextForProvider } from "@/lib/payments/paycloud-credentials";
import { syncYocoPaymentStatusFromGateway } from "@/lib/payments/yoco-sync-status";

export type OpenTerminalPayment = {
  id: string;
  provider: "paycloud" | "yoco";
  /** Rands (Yoco rows are stored in cents and converted here). */
  amount: number;
  currency?: string | null;
  status: string;
  entity_type: string;
  entity_id: string;
  booking_id?: string | null;
  group_booking_id?: string | null;
  created_at?: string | null;
};

const OPEN_PAYCLOUD = ["pending", "processing"] as const;
const OPEN_YOCO = ["pending"] as const;
const ENTITY_IN_FLIGHT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Open card-machine charges for a group and its child bookings.
 */
export async function findOpenTerminalPayments(
  admin: SupabaseClient,
  params: {
    providerId: string;
    groupBookingId?: string | null;
    bookingIds?: string[];
  },
): Promise<OpenTerminalPayment[]> {
  const since = new Date(Date.now() - ENTITY_IN_FLIGHT_WINDOW_MS).toISOString();
  const entityIds = new Set<string>();
  if (params.groupBookingId) entityIds.add(params.groupBookingId);
  for (const id of params.bookingIds ?? []) {
    if (id) entityIds.add(id);
  }
  if (entityIds.size === 0) return [];

  const idList = [...entityIds].join(",");
  const out: OpenTerminalPayment[] = [];

  const { data: paycloudRows, error: paycloudErr } = await admin
    .from("provider_paycloud_payments")
    .select(
      "id, amount, currency, status, entity_type, entity_id, booking_id, group_booking_id, created_at",
    )
    .eq("provider_id", params.providerId)
    .in("status", [...OPEN_PAYCLOUD])
    .gte("created_at", since)
    .or(`entity_id.in.(${idList}),group_booking_id.in.(${idList}),booking_id.in.(${idList})`);
  if (paycloudErr) console.error("findOpenTerminalPayments paycloud:", paycloudErr.message);

  for (const row of paycloudRows ?? []) {
    out.push({
      id: String(row.id),
      provider: "paycloud",
      amount: Number(row.amount ?? 0),
      currency: row.currency,
      status: String(row.status),
      entity_type: String(row.entity_type),
      entity_id: String(row.entity_id),
      booking_id: row.booking_id,
      group_booking_id: row.group_booking_id,
      created_at: row.created_at,
    });
  }

  const { data: yocoRows, error: yocoErr } = await admin
    .from("provider_yoco_payments")
    .select(
      "id, amount, currency, status, entity_type, entity_id, group_booking_id, appointment_id, yoco_payment_id, created_at",
    )
    .eq("provider_id", params.providerId)
    .in("status", [...OPEN_YOCO])
    .gte("created_at", since)
    .or(`entity_id.in.(${idList}),group_booking_id.in.(${idList}),appointment_id.in.(${idList})`);
  if (yocoErr) console.error("findOpenTerminalPayments yoco:", yocoErr.message);

  // Pending rows already recorded via the app's Yoco finalize (webhook not yet landed) are settled.
  const yocoRefs = (yocoRows ?? [])
    .flatMap((r) => [r.yoco_payment_id, r.id])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const recordedRefs = new Set<string>();
  if (yocoRefs.length > 0) {
    const { data: recorded } = await admin
      .from("booking_payments")
      .select("payment_provider_id")
      .eq("payment_provider", "yoco")
      .in("payment_provider_id", yocoRefs);
    for (const r of recorded ?? []) {
      if (r.payment_provider_id) recordedRefs.add(String(r.payment_provider_id));
    }
  }

  for (const row of yocoRows ?? []) {
    if (recordedRefs.has(String(row.id)) || (row.yoco_payment_id && recordedRefs.has(String(row.yoco_payment_id)))) {
      continue;
    }
    out.push({
      id: String(row.id),
      provider: "yoco",
      amount: Math.round(Number(row.amount ?? 0)) / 100,
      currency: row.currency,
      status: String(row.status),
      entity_type: String(row.entity_type ?? "booking"),
      entity_id: String(row.entity_id ?? row.appointment_id ?? ""),
      booking_id: row.appointment_id,
      group_booking_id: row.group_booking_id,
      created_at: row.created_at,
    });
  }

  return out;
}

/**
 * Cancels open charges before a manual mark-paid. Cloud PayCloud orders are closed on the
 * gateway first; if that fails the row stays open and the caller must not mark paid.
 */
export async function cancelOpenTerminalPaymentsForEntity(
  admin: SupabaseClient,
  providerId: string,
  openPayments: OpenTerminalPayment[],
): Promise<{ cancelled: string[]; errors: string[] }> {
  const cancelled: string[] = [];
  const errors: string[] = [];
  for (const p of openPayments) {
    try {
      if (p.provider === "paycloud") {
        const { data: payment } = await admin
          .from("provider_paycloud_payments")
          .select("id, status, terminal_id, merchant_order_no, initiation_channel")
          .eq("id", p.id)
          .eq("provider_id", providerId)
          .maybeSingle();
        if (!payment || payment.status === "successful") {
          errors.push(`${p.id}: not cancellable`);
          continue;
        }
        if (payment.status === "closed" || payment.status === "cancelled") {
          cancelled.push(p.id);
          continue;
        }

        const channel = (payment as { initiation_channel?: string | null }).initiation_channel ?? "cloud";
        let gatewayFields: Record<string, unknown> = {};
        if (channel !== "same_terminal") {
          if (!payment.terminal_id) {
            errors.push(`${p.id}: no terminal linked`);
            continue;
          }
          const resolved = await resolvePaycloudContextForProvider(admin, providerId, payment.terminal_id);
          if (!resolved.ok) {
            errors.push(`${p.id}: ${resolved.reason}`);
            continue;
          }
          const { data: terminal } = await admin
            .from("paycloud_terminals")
            .select("terminal_sn")
            .eq("id", payment.terminal_id)
            .maybeSingle();
          const closeResult = await closePaycloudOrder(resolved.ctx.environment, resolved.ctx.credentials, {
            merchant_no: resolved.ctx.merchant_no,
            store_no: resolved.ctx.store_no,
            terminal_sn: terminal?.terminal_sn ?? "",
            merchant_order_no: payment.merchant_order_no,
          });
          if (!closeResult.success) {
            errors.push(`${p.id}: ${closeResult.error_message ?? "card machine close failed"}`);
            continue;
          }
          gatewayFields = {
            trans_status: closeResult.trans_status,
            response_code: closeResult.response_code,
          };
        }

        await admin
          .from("provider_paycloud_payments")
          .update({
            status: "closed",
            ...gatewayFields,
            error_message: "Cancelled before completion (provider mark paid)",
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id)
          .in("status", [...OPEN_PAYCLOUD]);
        if (payment.terminal_id) {
          await admin
            .from("paycloud_terminals")
            .update({ in_flight_payment_id: null })
            .eq("id", payment.terminal_id)
            .eq("in_flight_payment_id", p.id);
        }
        cancelled.push(p.id);
      } else {
        const { data: row } = await admin
          .from("provider_yoco_payments")
          .select("id, status, metadata, yoco_device_id, yoco_payment_id")
          .eq("id", p.id)
          .eq("provider_id", providerId)
          .maybeSingle();
        if (!row) {
          errors.push(`${p.id}: not cancellable`);
          continue;
        }
        const latest = await syncYocoPaymentStatusFromGateway(admin, providerId, row);
        if (latest === "successful") {
          errors.push(`${p.id}: already successful on the machine`);
          continue;
        }
        if (latest !== "pending") {
          cancelled.push(p.id);
          continue;
        }
        await admin
          .from("provider_yoco_payments")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
            metadata: {
              ...((row.metadata ?? {}) as Record<string, unknown>),
              abandoned_by: "mark_paid_cancel_open_terminal",
            },
          })
          .eq("id", p.id)
          .eq("provider_id", providerId)
          .in("status", [...OPEN_YOCO]);
        cancelled.push(p.id);
      }
    } catch (e) {
      errors.push(`${p.id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  return { cancelled, errors };
}
