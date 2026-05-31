import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireAdminSection,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { recordBookingPaystackPayment } from "@/lib/bookings/record-booking-paystack-payment";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";
import {
  providerBelongsToTenantScope,
  resolvePaystackTerminalTenantScope,
} from "@/lib/admin/paystack-terminal-tenant-scope";

const adminUpdateSchema = z.object({
  action: z.enum([
    "hold",
    "release_hold",
    "mark_admin_review",
    "resolve_allocation",
    "mark_refunded",
    "mark_disputed",
    "clear_dispute",
  ]),
  reason: z.string().trim().optional(),
  payout_hold_until: z.string().datetime().optional(),
  entity_type: z
    .enum(["booking", "invoice", "sale", "product_order", "group_booking", "additional_charge", "other"])
    .optional(),
  entity_id: z.string().uuid().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = adminUpdateSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantScope = await resolvePaystackTerminalTenantScope(supabase, request);

    const { data: scopedPayment, error: scopedPaymentError } = await (supabase
      .from("provider_paystack_terminal_payments") as any)
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();
    if (scopedPaymentError) throw scopedPaymentError;
    if (!scopedPayment || !providerBelongsToTenantScope(scopedPayment.provider_id, tenantScope)) {
      return errorResponse("Terminal payment not found", "NOT_FOUND", 404);
    }

    const patch: Record<string, unknown> = {
      metadata: {
        last_admin_action: body.action,
        last_admin_reason: body.reason ?? null,
        last_admin_action_at: new Date().toISOString(),
      },
    };

    if (body.action === "hold") {
      patch.payout_eligibility_status = "held";
      patch.payout_hold_until =
        body.payout_hold_until ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (body.action === "release_hold") {
      patch.payout_eligibility_status = "eligible";
      patch.payout_hold_until = null;
    }
    if (body.action === "mark_admin_review") {
      patch.allocation_status = "admin_review";
    }
    if (body.action === "resolve_allocation") {
      if (!body.entity_type || !body.entity_id) {
        return errorResponse("entity_type and entity_id are required", "VALIDATION_ERROR", 400);
      }
      const { data: payment, error: paymentError } = await (supabase
        .from("provider_paystack_terminal_payments") as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (paymentError) throw paymentError;
      if (!payment) return errorResponse("Terminal payment not found", "NOT_FOUND", 404);

      const paidAmount = Number(payment.paid_amount ?? 0);
      const allocatedAmount = Number(payment.allocated_amount ?? 0);
      const allocationAmount = Math.max(0, paidAmount - allocatedAmount);
      if (allocationAmount <= 0) {
        return errorResponse("Terminal payment is already fully allocated.", "ALREADY_ALLOCATED", 409);
      }

      if (body.entity_type === "booking") {
        const { data: booking } = await supabase
          .from("bookings")
          .select("id, tenant_id")
          .eq("id", body.entity_id)
          .eq("provider_id", payment.provider_id)
          .maybeSingle();
        if (!booking) {
          return errorResponse("Booking target not found for this provider.", "TARGET_NOT_FOUND", 404);
        }

        const recorded = await recordBookingPaystackPayment(supabase as any, {
          bookingId: body.entity_id,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
          reference: payment.paystack_reference,
          transactionId: payment.paystack_transaction_id ?? null,
          amountMajor: allocationAmount,
          source: "paystack_virtual_terminal_admin_allocation",
          notes: `Payment received via Paystack Terminal and resolved by Superadmin. Ref: ${payment.paystack_reference}`,
        });
        if (!recorded.ok) {
          const recordedError = "error" in recorded ? recorded.error : undefined;
          return errorResponse(
            "Could not record the Paystack Terminal booking payment.",
            "LEDGER_RECORDING_FAILED",
            500,
            recordedError,
          );
        }

        await (supabase.from("booking_payments") as any)
          .update({ payment_method: "paystack_terminal" })
          .eq("payment_provider", "paystack")
          .eq("payment_provider_id", payment.paystack_reference);
        await syncBookingAfterPaystackSuccess(supabase as any, body.entity_id);
      }

      if (body.entity_type === "product_order") {
        const { data: order } = await (supabase.from("product_orders") as any)
          .select("id, provider_id")
          .eq("id", body.entity_id)
          .eq("provider_id", payment.provider_id)
          .maybeSingle();
        if (!order) {
          return errorResponse("Product order target not found for this provider.", "TARGET_NOT_FOUND", 404);
        }

        await recordProductOrderPayment({
          supabase: supabase as any,
          productOrderId: body.entity_id,
          reference: payment.paystack_reference,
          amountMajor: allocationAmount,
          feesMajor: Number(payment.gateway_fee_amount ?? 0),
          source: "paystack_virtual_terminal_allocation",
          provider: "paystack",
          platformHeld: true,
        });
      }

      if (body.entity_type === "sale") {
        const { data: sale } = await supabase
          .from("sales")
          .select("id, provider_id, payment_status")
          .eq("id", body.entity_id)
          .eq("provider_id", payment.provider_id)
          .maybeSingle();
        if (!sale) {
          return errorResponse("Sale target not found for this provider.", "TARGET_NOT_FOUND", 404);
        }

        const becomingCompleted = String((sale as any).payment_status ?? "") !== "completed";
        let itemsForStock: Array<{
          type?: string;
          item_id?: string | null;
          product_variant_id?: string | null;
          quantity?: number;
        }> = [];
        if (becomingCompleted) {
          const { data: lineRows, error: lineError } = await supabase
            .from("sale_items")
            .select("item_type, item_id, product_variant_id, quantity")
            .eq("sale_id", body.entity_id);
          if (lineError) throw lineError;
          itemsForStock = (lineRows ?? []).map((row: Record<string, unknown>) => ({
            type: row.item_type as string,
            item_id: (row.item_id as string | null) ?? null,
            product_variant_id: (row.product_variant_id as string | null) ?? null,
            quantity: Number(row.quantity ?? 1),
          }));
          const stockError = await validatePosProductStock(supabase as any, payment.provider_id, itemsForStock);
          if (stockError) return errorResponse(stockError, "STOCK_ERROR", 400);
        }

        const { error: saleUpdateError } = await supabase
          .from("sales")
          .update({
            payment_status: "completed",
            payment_provider: "paystack_virtual_terminal",
            payment_provider_id: payment.paystack_reference,
          })
          .eq("id", body.entity_id)
          .eq("provider_id", payment.provider_id);
        if (saleUpdateError) throw saleUpdateError;
        if (becomingCompleted) await applyPosProductStockDecrements(supabase as any, itemsForStock);
      }

      const now = new Date().toISOString();
      const { error: allocationError } = await (supabase
        .from("provider_terminal_payment_allocations") as any)
        .insert({
        terminal_payment_id: id,
        provider_id: payment.provider_id,
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        amount: allocationAmount,
        currency: payment.currency ?? "ZAR",
        status: "admin_resolved",
        reason: body.reason ?? "Resolved by Superadmin",
        allocated_by: user.id,
        allocated_at: now,
      });
      if (allocationError) throw allocationError;

      patch.allocation_status = "admin_resolved";
      patch.status = "allocated";
      patch.allocated_amount = paidAmount;
      patch.remaining_balance = 0;
      patch.provider_assigned_entity_type = body.entity_type;
      patch.provider_assigned_entity_id = body.entity_id;
      patch.provider_assignment_reason = body.reason ?? "Resolved by Superadmin";
      patch.provider_assigned_by = user.id;
      patch.provider_assigned_at = now;
      patch.allocated_at = now;
      patch.payout_eligibility_status = "held";
      patch.payout_hold_until = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    }
    if (body.action === "mark_refunded") {
      patch.status = "refunded";
      patch.allocation_status = "refunded";
      patch.refund_status = "refunded";
      patch.payout_eligibility_status = "blocked";
    }
    if (body.action === "mark_disputed") {
      patch.status = "disputed";
      patch.allocation_status = "disputed";
      patch.payout_eligibility_status = "blocked";
    }
    if (body.action === "clear_dispute") {
      patch.status = "held";
      patch.payout_eligibility_status = "held";
      patch.payout_hold_until =
        body.payout_hold_until ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await (supabase
      .from("provider_paystack_terminal_payments") as any)
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update Paystack Terminal payment");
  }
}
