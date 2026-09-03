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
import { recordPaystackBookingSettlement } from "@/lib/bookings/record-paystack-booking-settlement";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";
import { settleAdditionalChargePlatformHeld } from "@/lib/bookings/settle-additional-charge-platform-held";
import { convertToSmallestUnit } from "@/lib/payments/paystack-complete";
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

        const gatewayFeeBooking = Number(payment.gateway_fee_amount ?? 0);
        const settlementBooking = await recordPaystackBookingSettlement(supabase as any, {
          bookingId: body.entity_id,
          reference: payment.paystack_reference,
          amountMajor: allocationAmount,
          feesSmallestOrMajor: gatewayFeeBooking,
          feesAlreadyMajor: true,
          bookingPaymentId: recorded.bookingPaymentId,
          commissionMode: "provider_collected",
          feeSource: "paystack_terminal_admin_allocation",
          metadata: { source: "paystack_virtual_terminal_admin_allocation" },
        });
        if (!settlementBooking.ok) {
          console.error(
            "[admin-terminal-allocation] finance ledger settlement failed:",
            settlementBooking,
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

      if (body.entity_type === "group_booking") {
        // Group bookings reconcile against their primary participant's booking so the
        // ledger and payout flow stay consistent with a normal booking allocation.
        const { data: groupRow } = await (supabase.from("group_bookings") as any)
          .select("id, provider_id")
          .eq("id", body.entity_id)
          .eq("provider_id", payment.provider_id)
          .maybeSingle();
        if (!groupRow) {
          return errorResponse("Group booking target not found for this provider.", "TARGET_NOT_FOUND", 404);
        }

        const { data: groupBooking } = await supabase
          .from("bookings")
          .select("id, tenant_id, created_at")
          .eq("group_booking_id", body.entity_id)
          .eq("provider_id", payment.provider_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!groupBooking) {
          return errorResponse(
            "No booking is linked to this group booking yet.",
            "TARGET_NOT_FOUND",
            404,
          );
        }

        const recorded = await recordBookingPaystackPayment(supabase as any, {
          bookingId: (groupBooking as { id: string }).id,
          tenantId: (groupBooking as { tenant_id?: string | null }).tenant_id ?? null,
          reference: payment.paystack_reference,
          transactionId: payment.paystack_transaction_id ?? null,
          amountMajor: allocationAmount,
          source: "paystack_virtual_terminal_admin_allocation",
          notes: `Group booking payment received via Paystack Terminal and resolved by Superadmin. Ref: ${payment.paystack_reference}`,
        });
        if (!recorded.ok) {
          const recordedError = "error" in recorded ? recorded.error : undefined;
          return errorResponse(
            "Could not record the Paystack Terminal group booking payment.",
            "LEDGER_RECORDING_FAILED",
            500,
            recordedError,
          );
        }
        const gatewayFeeGroup = Number(payment.gateway_fee_amount ?? 0);
        const settlementGroup = await recordPaystackBookingSettlement(supabase as any, {
          bookingId: (groupBooking as { id: string }).id,
          reference: payment.paystack_reference,
          amountMajor: allocationAmount,
          feesSmallestOrMajor: gatewayFeeGroup,
          feesAlreadyMajor: true,
          bookingPaymentId: recorded.bookingPaymentId,
          commissionMode: "provider_collected",
          feeSource: "paystack_terminal_admin_allocation",
          metadata: { source: "paystack_virtual_terminal_admin_allocation" },
        });
        if (!settlementGroup.ok) {
          console.error(
            "[admin-terminal-allocation] group booking ledger settlement failed:",
            settlementGroup,
          );
        }
        await (supabase.from("booking_payments") as any)
          .update({ payment_method: "paystack_terminal" })
          .eq("payment_provider", "paystack")
          .eq("payment_provider_id", payment.paystack_reference);
        await syncBookingAfterPaystackSuccess(supabase as any, (groupBooking as { id: string }).id);
      }

      if (body.entity_type === "additional_charge") {
        const { data: acRow } = await (supabase.from("additional_charges") as any)
          .select("id, booking_id, status, amount")
          .eq("id", body.entity_id)
          .maybeSingle();
        if (!acRow) {
          return errorResponse("Additional charge not found for this provider.", "TARGET_NOT_FOUND", 404);
        }
        const acBookingId = (acRow as { booking_id?: string }).booking_id ?? null;
        if (!acBookingId) {
          return errorResponse("Additional charge has no associated booking.", "TARGET_NOT_FOUND", 404);
        }
        const { data: acBooking } = await supabase
          .from("bookings")
          .select("id, customer_id, provider_id")
          .eq("id", acBookingId)
          .eq("provider_id", payment.provider_id)
          .maybeSingle();
        if (!acBooking) {
          return errorResponse("Booking target not found for this provider.", "TARGET_NOT_FOUND", 404);
        }
        const customerId = (acBooking as { customer_id?: string }).customer_id ?? "";
        try {
          await settleAdditionalChargePlatformHeld(supabase, {
            reference: payment.paystack_reference,
            amountSmallestUnit: convertToSmallestUnit(allocationAmount),
            feesSmallestUnit: convertToSmallestUnit(Number(payment.gateway_fee_amount ?? 0)),
            bookingId: acBookingId,
            chargeId: body.entity_id,
            paystackTransactionId: payment.paystack_transaction_id ?? null,
            customerId,
          });
        } catch (acSettleErr) {
          return errorResponse(
            "Failed to settle additional charge via terminal.",
            "SETTLEMENT_ERROR",
            500,
            acSettleErr instanceof Error ? acSettleErr.message : String(acSettleErr),
          );
        }
      }

      if (body.entity_type === "invoice") {
        const { data: invoice } = await (supabase.from("provider_invoices") as any)
          .select("id, provider_id, total_amount, amount_paid")
          .eq("id", body.entity_id)
          .eq("provider_id", payment.provider_id)
          .maybeSingle();
        if (!invoice) {
          return errorResponse("Invoice target not found for this provider.", "TARGET_NOT_FOUND", 404);
        }
        const { error: invoicePayError } = await (supabase.from("provider_invoice_payments") as any).insert({
          invoice_id: body.entity_id,
          amount: allocationAmount,
          payment_date: new Date().toISOString().slice(0, 10),
          payment_reference: payment.paystack_reference,
          status: "completed",
          created_by: user.id,
        });
        if (invoicePayError) throw invoicePayError;
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
