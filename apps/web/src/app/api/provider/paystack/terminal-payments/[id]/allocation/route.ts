import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordBookingPaystackPayment } from "@/lib/bookings/record-booking-paystack-payment";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";

const allocationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
    entity_type: z.enum([
      "booking",
      "invoice",
      "sale",
      "product_order",
      "group_booking",
      "additional_charge",
      "other",
    ]),
    entity_id: z.string().uuid(),
    amount: z.number().positive().optional(),
    reason: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("decline"),
    reason: z.string().trim().min(1, "Decline reason is required"),
  }),
  z.object({
    action: z.literal("admin_review"),
    reason: z.string().trim().optional(),
  }),
]);

async function resolveProvider(request: NextRequest) {
  const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase, { request });
  return { supabase, user, providerId };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = allocationSchema.parse(await request.json());
    const { supabase, user, providerId } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    const admin = getSupabaseAdmin();

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { data: payment, error: paymentError } = await (admin
      .from("provider_paystack_terminal_payments") as any)
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return errorResponse("Terminal payment not found", "NOT_FOUND", 404);

    if (body.action === "decline") {
      const { data, error } = await (admin
        .from("provider_paystack_terminal_payments") as any)
        .update({
          allocation_status: "provider_declined",
          provider_declined_suggestion: true,
          provider_decline_reason: body.reason,
          payout_eligibility_status: "blocked",
          provider_seen_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("provider_id", providerId)
        .select()
        .single();
      if (error) throw error;
      return successResponse(data);
    }

    if (body.action === "admin_review") {
      const { data, error } = await (admin
        .from("provider_paystack_terminal_payments") as any)
        .update({
          allocation_status: "admin_review",
          provider_assignment_reason: body.reason ?? null,
          provider_seen_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("provider_id", providerId)
        .select()
        .single();
      if (error) throw error;
      return successResponse(data);
    }

    const requestedAmount = body.amount ?? Number(payment.paid_amount ?? 0);
    const paidAmount = Number(payment.paid_amount ?? 0);
    const allocatedAmount = Number(payment.allocated_amount ?? 0);
    if (requestedAmount <= 0 || requestedAmount > paidAmount - allocatedAmount) {
      return errorResponse(
        "Allocation amount exceeds the unallocated Paystack Terminal balance.",
        "INVALID_ALLOCATION_AMOUNT",
        400,
      );
    }

    const now = new Date().toISOString();
    if (body.entity_type === "booking") {
      const { data: booking } = await admin
        .from("bookings")
        .select("id, tenant_id")
        .eq("id", body.entity_id)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!booking) {
        return errorResponse("Booking target not found for this provider.", "TARGET_NOT_FOUND", 404);
      }

      const recorded = await recordBookingPaystackPayment(admin as any, {
        bookingId: body.entity_id,
        tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
        reference: payment.paystack_reference,
        transactionId: payment.paystack_transaction_id ?? null,
        amountMajor: requestedAmount,
        source: "paystack_virtual_terminal_allocation",
        notes: `Payment received via Paystack Terminal. Ref: ${payment.paystack_reference}`,
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

      await (admin.from("booking_payments") as any)
        .update({ payment_method: "paystack_terminal" })
        .eq("payment_provider", "paystack")
        .eq("payment_provider_id", payment.paystack_reference);
      await syncBookingAfterPaystackSuccess(admin as any, body.entity_id);
    }

    if (body.entity_type === "product_order") {
      const { data: order } = await (admin.from("product_orders") as any)
        .select("id, provider_id")
        .eq("id", body.entity_id)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!order) {
        return errorResponse("Product order target not found for this provider.", "TARGET_NOT_FOUND", 404);
      }

      await recordProductOrderPayment({
        supabase: admin as any,
        productOrderId: body.entity_id,
        reference: payment.paystack_reference,
        amountMajor: requestedAmount,
        feesMajor: Number(payment.gateway_fee_amount ?? 0),
        source: "paystack_virtual_terminal_allocation",
        provider: "paystack",
        platformHeld: true,
      });
    }

    if (body.entity_type === "sale") {
      const { data: sale } = await admin
        .from("sales")
        .select("id, provider_id, payment_status")
        .eq("id", body.entity_id)
        .eq("provider_id", providerId)
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
        const { data: lineRows, error: lineError } = await admin
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
        const stockError = await validatePosProductStock(admin as any, providerId, itemsForStock);
        if (stockError) return errorResponse(stockError, "STOCK_ERROR", 400);
      }

      const { error: saleUpdateError } = await admin
        .from("sales")
        .update({
          payment_status: "completed",
          payment_provider: "paystack_virtual_terminal",
          payment_provider_id: payment.paystack_reference,
        })
        .eq("id", body.entity_id)
        .eq("provider_id", providerId);
      if (saleUpdateError) throw saleUpdateError;
      if (becomingCompleted) await applyPosProductStockDecrements(admin as any, itemsForStock);
    }

    const { data: allocation, error: allocationError } = await (admin
      .from("provider_terminal_payment_allocations") as any)
      .insert({
        terminal_payment_id: id,
        provider_id: providerId,
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        amount: requestedAmount,
        currency: payment.currency ?? "ZAR",
        status: "confirmed",
        reason: body.reason ?? null,
        allocated_by: user.id,
        allocated_at: now,
      })
      .select()
      .single();
    if (allocationError) throw allocationError;

    const nextAllocatedAmount = allocatedAmount + requestedAmount;
    const fullyAllocated = nextAllocatedAmount >= paidAmount;
    const { data: updatedPayment, error: updateError } = await (admin
      .from("provider_paystack_terminal_payments") as any)
      .update({
        status: fullyAllocated ? "allocated" : "matched",
        allocation_status: fullyAllocated ? "allocated" : "split_allocated",
        allocated_amount: nextAllocatedAmount,
        remaining_balance: Math.max(0, paidAmount - nextAllocatedAmount),
        provider_assigned_entity_type: body.entity_type,
        provider_assigned_entity_id: body.entity_id,
        provider_assignment_reason: body.reason ?? null,
        provider_assigned_by: user.id,
        provider_assigned_at: now,
        provider_seen_at: now,
        payout_eligibility_status: "held",
        payout_hold_until: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        allocated_at: fullyAllocated ? now : payment.allocated_at,
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();
    if (updateError) throw updateError;

    return successResponse({ payment: updatedPayment, allocation });
  } catch (error) {
    return handleApiError(error, "Failed to allocate Paystack Terminal payment");
  }
}
