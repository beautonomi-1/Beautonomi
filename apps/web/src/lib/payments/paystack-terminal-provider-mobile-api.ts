/**
 * Paystack Virtual Terminal handlers for provider mobile fallbacks.
 * Mounted on live routes (`/api/provider/settings/payments`, `/api/provider/payments`)
 * when dedicated `/api/provider/paystack/*` paths are unavailable on production.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getOffsetPaginationParams,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";
import { getPaystackTerminalAvailability } from "@/lib/payments/paystack-terminal-availability";
import { checkPaystackVirtualTerminalFeatureAccess } from "@/lib/subscriptions/feature-access";
import {
  slackNotifyPaystackTerminalAssetRequested,
  slackNotifyPaystackTerminalSetupRequested,
} from "@/lib/integrations/slack/ops-triggers";
import {
  buildPaystackTerminalName,
  normalizeWhatsAppTarget,
} from "@/lib/payments/paystack-terminal-assets";
import { checkRateLimit } from "@/lib/rate-limit/store";
import {
  reconcilePaystackTerminalPayments,
  reconcileWindowFromDays,
  type ReconcileLocalTerminal,
} from "@/lib/payments/paystack-terminal-reconcile";
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

const setupRequestSchema = z.object({
  name: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().max(40).optional().nullable(),
});

const collectionIntentSchema = z.object({
  terminal_id: z.string().uuid().optional(),
  entity_type: z
    .enum(["booking", "invoice", "sale", "product_order", "group_booking", "additional_charge", "other"])
    .optional(),
  entity_id: z.string().uuid().optional(),
  expected_amount: z.number().nonnegative().optional(),
  customer_reference: z.string().trim().optional(),
});

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

const REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function resolveProvider(request: NextRequest) {
  const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase, { request });
  return { supabase, user, providerId };
}

export async function loadPaystackTerminalMobileDetail(request: NextRequest) {
  const { supabase, providerId } = await resolveProvider(request);
  if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

  const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
  if (gate) return gate;

  const access = await checkPaystackVirtualTerminalFeatureAccess(providerId, supabase as any);
  const { data, error } = await (supabase.from("provider_paystack_virtual_terminals") as any)
    .select("*")
    .eq("provider_id", providerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: setupRequests, error: setupError } = await (supabase
    .from("provider_paystack_virtual_terminal_setup_requests") as any)
    .select("*")
    .eq("provider_id", providerId)
    .in("status", ["requested", "in_progress", "rejected"])
    .order("created_at", { ascending: false });
  if (setupError) throw setupError;

  return successResponse({
    terminals: data ?? [],
    setupRequests: setupRequests ?? [],
    subscription: access,
    canRequestSetup: access.enabled,
  });
}

export async function requestPaystackTerminalSetupMobile(request: NextRequest) {
  const { supabase, user, providerId } = await resolveProvider(request);
  if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
  const admin = getSupabaseAdmin();

  const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
  if (gate) return gate;

  const access = await checkPaystackVirtualTerminalFeatureAccess(providerId, supabase as any);
  if (!access.enabled) {
    return errorResponse(
      "Paystack Terminal requires a subscription upgrade.",
      "SUBSCRIPTION_REQUIRED",
      403,
    );
  }

  const body = setupRequestSchema.parse(await request.json());

  const { data: provider } = await supabase
    .from("providers")
    .select("id, tenant_id, currency, business_name, phone, billing_phone, billing_email, user_id")
    .eq("id", providerId)
    .maybeSingle();

  const { count: terminalCount, error: countError } = await (admin
    .from("provider_paystack_virtual_terminals") as any)
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .is("deleted_at", null);
  if (countError) throw countError;
  const nextTerminalNumber = (terminalCount ?? 0) + 1;
  if (access.maxTerminals && (terminalCount ?? 0) >= access.maxTerminals) {
    return errorResponse(
      `You've reached your Paystack Terminal limit (${access.maxTerminals}).`,
      "LIMIT_REACHED",
      403,
    );
  }

  const { data: owner } = (provider as { user_id?: string | null } | null)?.user_id
    ? await admin
        .from("users")
        .select("id, full_name, email, phone")
        .eq("id", (provider as { user_id?: string }).user_id)
        .maybeSingle()
    : { data: null };

  const providerBusinessName = (provider as { business_name?: string | null } | null)?.business_name ?? null;
  const displayName =
    body.name?.trim() || (nextTerminalNumber === 1 ? "Front desk" : `Terminal ${nextTerminalNumber}`);
  const terminalName = buildPaystackTerminalName({
    providerBusinessName,
    providerDisplayName: (owner as { full_name?: string | null } | null)?.full_name ?? null,
    locationName: null,
    requestedName: displayName,
    uniqueSuffix: providerId,
    portable: true,
  });
  const destinationTarget =
    normalizeWhatsAppTarget(body.whatsapp) ??
    normalizeWhatsAppTarget(
      (provider as { phone?: string | null; billing_phone?: string | null } | null)?.phone ??
        (provider as { phone?: string | null; billing_phone?: string | null } | null)?.billing_phone ??
        (owner as { phone?: string | null } | null)?.phone ??
        null,
    );
  const destinationName =
    providerBusinessName ? `${providerBusinessName} WhatsApp` : "Provider WhatsApp";
  const destinations = destinationTarget
    ? [{ target: destinationTarget, name: destinationName }]
    : [];
  const currency = (provider as { currency?: string | null } | null)?.currency ?? "ZAR";
  const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null;

  const { data: existingRequest } = await (admin
    .from("provider_paystack_virtual_terminal_setup_requests") as any)
    .select("id")
    .eq("provider_id", providerId)
    .in("status", ["requested", "in_progress"])
    .is("location_id", null)
    .maybeSingle();

  const setupPayload = {
    provider_id: providerId,
    location_id: null,
    requested_by: user.id,
    status: "requested",
    requested_display_name: displayName,
    suggested_paystack_name: terminalName,
    currency,
    destination_target: destinationTarget,
    destination_name: destinationTarget ? destinationName : null,
    destinations,
    // Static Virtual Terminal QR: no custom fields. Paystack generates the reference and the
    // provider allocates by amount + timing in the inbox, so we don't ask the customer to type a
    // booking/order number.
    custom_fields: [],
    metadata: {
      provider_id: providerId,
      provider_business_name: providerBusinessName,
      location_id: null,
      location_name: null,
      tenant_id: tenantId,
      source: "beautonomi_provider_terminal",
      requested_by: user.id,
    },
    request_notes: destinationTarget
      ? null
      : "No provider phone or billing phone was available for Paystack WhatsApp destination.",
  };

  const { data: setupRequest, error: setupRequestError } = existingRequest?.id
    ? await (admin.from("provider_paystack_virtual_terminal_setup_requests") as any)
        .update(setupPayload)
        .eq("id", existingRequest.id)
        .select()
        .single()
    : await (admin.from("provider_paystack_virtual_terminal_setup_requests") as any)
        .insert(setupPayload)
        .select()
        .single();
  if (setupRequestError) throw setupRequestError;

  slackNotifyPaystackTerminalSetupRequested({
    tenantId,
    requestId: setupRequest.id,
    providerId,
    providerName: providerBusinessName,
    requestedBy: user.email ?? user.id,
    suggestedTerminalName: terminalName,
    destinationTarget,
  });

  return successResponse(
    {
      requested: true,
      status: "admin_setup_required",
      setup_request: setupRequest,
      suggested_name: terminalName,
      destination_target: destinationTarget,
      message:
        "Beautonomi Ops has been notified. Paystack generates the terminal code, payment page, and poster; Ops will add them here once the terminal is ready.",
    },
    202,
  );
}

export async function requestPaystackTerminalAssetsMobile(
  request: NextRequest,
  terminalId: string,
) {
  const { supabase, user, providerId } = await resolveProvider(request);
  if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

  const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
  if (gate) return gate;

  const admin = getSupabaseAdmin();
  const { data: terminal, error: terminalError } = await (admin
    .from("provider_paystack_virtual_terminals") as any)
    .select("*, provider:providers(id, tenant_id, business_name)")
    .eq("id", terminalId)
    .eq("provider_id", providerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (terminalError) throw terminalError;
  if (!terminal) return errorResponse("Terminal not found", "NOT_FOUND", 404);

  if (terminal.asset_status === "ready") {
    return successResponse({
      terminal,
      requested: false,
      message: "Your Paystack Terminal QR and poster assets are already ready.",
    });
  }

  const lastRequestedAt = terminal.asset_last_requested_at
    ? new Date(terminal.asset_last_requested_at).getTime()
    : 0;
  const nowMs = Date.now();
  if (lastRequestedAt && nowMs - lastRequestedAt < REQUEST_COOLDOWN_MS) {
    return successResponse({
      terminal,
      requested: false,
      message: "Your branded QR/poster request is already in the Ops queue.",
    });
  }

  const now = new Date(nowMs).toISOString();
  const { data: updated, error: updateError } = await (admin
    .from("provider_paystack_virtual_terminals") as any)
    .update({
      asset_last_requested_at: now,
      asset_last_requested_by: user.id,
      asset_requested_by_provider_at: now,
      asset_request_status: "requested",
    })
    .eq("id", terminalId)
    .eq("provider_id", providerId)
    .select("*, provider:providers(id, tenant_id, business_name)")
    .single();
  if (updateError) throw updateError;

  slackNotifyPaystackTerminalAssetRequested({
    tenantId: updated.provider?.tenant_id ?? null,
    terminalId: updated.id,
    terminalCode: updated.terminal_code,
    terminalName: updated.display_name ?? updated.name,
    providerName: updated.provider?.business_name ?? null,
    paymentLink: updated.payment_link ?? updated.terminal_url ?? null,
    requestedBy: user.email ?? user.id,
  });

  return successResponse({
    terminal: updated,
    requested: true,
    message: "Beautonomi Ops has been notified to prepare your branded QR and poster.",
  });
}

export async function listPaystackTerminalPaymentsMobile(request: NextRequest) {
  const { supabase, providerId } = await resolveProvider(request);
  if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

  const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
  if (gate) return gate;

  const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 25, maxLimit: 100 });
  const { searchParams } = new URL(request.url);
  const allocationStatus = searchParams.get("allocation_status");
  const status = searchParams.get("status");
  // Ringfence the inbox to a single virtual terminal when requested (provider_id below keeps
  // it safe against ids that do not belong to this provider).
  const terminalIdParam = searchParams.get("terminal_id");
  const terminalId = terminalIdParam && z.string().uuid().safeParse(terminalIdParam).success ? terminalIdParam : null;

  let query = (supabase.from("provider_paystack_terminal_payments") as any)
    .select(
      `
          *,
          allocations:provider_terminal_payment_allocations(*),
          terminal:provider_paystack_virtual_terminals(id, name, terminal_code, location_id)
        `,
      { count: "exact" },
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (terminalId) query = query.eq("terminal_id", terminalId);
  if (allocationStatus) query = query.eq("allocation_status", allocationStatus);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) throw error;

  return successResponse({
    items: data ?? [],
    total: count ?? 0,
    limit,
    offset,
    hasMore: (count ?? 0) > offset + limit,
  });
}

export async function createPaystackTerminalCollectionIntentMobile(request: NextRequest) {
  const { supabase, providerId } = await resolveProvider(request);
  if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

  const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
  if (gate) return gate;

  const body = collectionIntentSchema.parse(await request.json());

  const availability = await getPaystackTerminalAvailability({ supabase, providerId });
  const selectableTerminals = availability.selectableTerminals;
  if (selectableTerminals.length === 0) {
    if (availability.terminals.some((t) => t.active)) {
      return errorResponse(
        "This Paystack Terminal is still waiting for Ops to add the Paystack payment link.",
        "TERMINAL_LINK_NOT_READY",
        400,
      );
    }
    return errorResponse(
      "No active Paystack Terminal is available. Request setup and wait for Ops to import the Paystack terminal first.",
      "TERMINAL_NOT_READY",
      400,
    );
  }

  const terminal =
    (body.terminal_id ? selectableTerminals.find((t) => t.id === body.terminal_id) : null) ??
    selectableTerminals[0];
  if (!terminal) {
    return errorResponse(
      "The selected Paystack Terminal is not available for collection.",
      "TERMINAL_NOT_READY",
      400,
    );
  }

  let customerReference = body.customer_reference ?? null;
  if (!customerReference && body.entity_id) {
    if (body.entity_type === "booking") {
      const { data: booking } = await supabase
        .from("bookings")
        .select("booking_number")
        .eq("id", body.entity_id)
        .eq("provider_id", providerId)
        .maybeSingle();
      customerReference = (booking as { booking_number?: string | null } | null)?.booking_number ?? null;
    } else if (body.entity_type === "product_order") {
      const { data: order } = await (supabase.from("product_orders") as any)
        .select("order_number")
        .eq("id", body.entity_id)
        .eq("provider_id", providerId)
        .maybeSingle();
      customerReference = (order as { order_number?: string | null } | null)?.order_number ?? null;
    }
  }

  return successResponse({
    terminal,
    terminals: selectableTerminals,
    metadata: {
      source: "beautonomi_provider_terminal",
      payment_channel: "paystack_virtual_terminal",
      provider_id: providerId,
      paystack_terminal_code: terminal.terminal_code,
      entity_type: body.entity_type ?? null,
      entity_id: body.entity_id ?? null,
      expected_amount: body.expected_amount ?? null,
      customer_reference: customerReference,
    },
    expectedAmount: body.expected_amount ?? null,
    entityType: body.entity_type ?? null,
    entityId: body.entity_id ?? null,
    customerReference,
    instructions:
      "Ask the customer to scan the QR or pay through this Paystack Terminal. Paystack generates the transaction reference automatically; once it confirms the payment, it appears in your inbox to allocate to this booking, sale, or order.",
  });
}

export async function allocatePaystackTerminalPaymentMobile(
  request: NextRequest,
  paymentId: string,
) {
  const body = allocationSchema.parse(await request.json());
  const { supabase, user, providerId } = await resolveProvider(request);
  if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
  const admin = getSupabaseAdmin();

  const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
  if (gate) return gate;

  const { data: payment, error: paymentError } = await (admin
    .from("provider_paystack_terminal_payments") as any)
    .select("*")
    .eq("id", paymentId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) return errorResponse("Terminal payment not found", "NOT_FOUND", 404);

  if (body.action === "decline") {
    const { data, error } = await (admin.from("provider_paystack_terminal_payments") as any)
      .update({
        allocation_status: "provider_declined",
        provider_declined_suggestion: true,
        provider_decline_reason: body.reason,
        payout_eligibility_status: "blocked",
        provider_seen_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .eq("provider_id", providerId)
      .select()
      .single();
    if (error) throw error;
    return successResponse(data);
  }

  if (body.action === "admin_review") {
    const { data, error } = await (admin.from("provider_paystack_terminal_payments") as any)
      .update({
        allocation_status: "admin_review",
        provider_assignment_reason: body.reason ?? null,
        provider_seen_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
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

    const gatewayFee = Number(payment.gateway_fee_amount ?? 0);
    const settlement = await recordPaystackBookingSettlement(admin as any, {
      bookingId: body.entity_id,
      reference: payment.paystack_reference,
      amountMajor: requestedAmount,
      feesSmallestOrMajor: gatewayFee,
      feesAlreadyMajor: true,
      bookingPaymentId: recorded.bookingPaymentId,
      commissionMode: "provider_collected",
      feeSource: "paystack_terminal_allocation",
      metadata: { source: "paystack_virtual_terminal_allocation" },
    });
    if (!settlement.ok) {
      console.error("[terminal-mobile-allocation] finance ledger settlement failed:", settlement);
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

  if (body.entity_type === "additional_charge") {
    const { data: acRow } = await (admin.from("additional_charges") as any)
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
    const { data: acBooking } = await admin
      .from("bookings")
      .select("id, customer_id, provider_id")
      .eq("id", acBookingId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!acBooking) {
      return errorResponse("Booking target not found for this provider.", "TARGET_NOT_FOUND", 404);
    }
    const customerId = (acBooking as { customer_id?: string }).customer_id ?? "";
    try {
      await settleAdditionalChargePlatformHeld(admin, {
        reference: payment.paystack_reference,
        amountSmallestUnit: convertToSmallestUnit(requestedAmount),
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

  if (body.entity_type === "group_booking") {
    const { data: groupRow } = await (admin.from("group_bookings") as any)
      .select("id, provider_id")
      .eq("id", body.entity_id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!groupRow) {
      return errorResponse("Group booking target not found for this provider.", "TARGET_NOT_FOUND", 404);
    }

    const { data: groupBooking } = await admin
      .from("bookings")
      .select("id, tenant_id, created_at")
      .eq("group_booking_id", body.entity_id)
      .eq("provider_id", providerId)
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

    const recorded = await recordBookingPaystackPayment(admin as any, {
      bookingId: (groupBooking as { id: string }).id,
      tenantId: (groupBooking as { tenant_id?: string | null }).tenant_id ?? null,
      reference: payment.paystack_reference,
      transactionId: payment.paystack_transaction_id ?? null,
      amountMajor: requestedAmount,
      source: "paystack_virtual_terminal_allocation",
      notes: `Group booking payment received via Paystack Terminal. Ref: ${payment.paystack_reference}`,
    });
    if (recorded.ok === false) {
      const recordedError = "error" in recorded ? recorded.error : undefined;
      return errorResponse(
        "Could not record the Paystack Terminal group booking payment.",
        "LEDGER_RECORDING_FAILED",
        500,
        recordedError,
      );
    }

    const gatewayFeeGroup = Number(payment.gateway_fee_amount ?? 0);
    const settlementGroup = await recordPaystackBookingSettlement(admin as any, {
      bookingId: (groupBooking as { id: string }).id,
      reference: payment.paystack_reference,
      amountMajor: requestedAmount,
      feesSmallestOrMajor: gatewayFeeGroup,
      feesAlreadyMajor: true,
      bookingPaymentId: recorded.bookingPaymentId,
      commissionMode: "provider_collected",
      feeSource: "paystack_terminal_allocation",
      metadata: { source: "paystack_virtual_terminal_allocation" },
    });
    if (settlementGroup.ok === false) {
      console.error("[terminal-mobile-allocation] group booking ledger settlement failed:", settlementGroup);
    }

    await (admin.from("booking_payments") as any)
      .update({ payment_method: "paystack_terminal" })
      .eq("payment_provider", "paystack")
      .eq("payment_provider_id", payment.paystack_reference);
    await syncBookingAfterPaystackSuccess(admin as any, (groupBooking as { id: string }).id);
  }

  if (body.entity_type === "invoice") {
    const { data: invoice } = await (admin.from("provider_invoices") as any)
      .select("id, provider_id, total_amount, amount_paid")
      .eq("id", body.entity_id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!invoice) {
      return errorResponse("Invoice target not found for this provider.", "TARGET_NOT_FOUND", 404);
    }
    const { error: invoicePayError } = await (admin.from("provider_invoice_payments") as any).insert({
      invoice_id: body.entity_id,
      amount: requestedAmount,
      payment_date: now.slice(0, 10),
      payment_reference: payment.paystack_reference,
      status: "completed",
      created_by: user.id,
    });
    if (invoicePayError) throw invoicePayError;
  }

  const { data: allocation, error: allocationError } = await (admin
    .from("provider_terminal_payment_allocations") as any)
    .insert({
      terminal_payment_id: paymentId,
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
    .eq("id", paymentId)
    .eq("provider_id", providerId)
    .select()
    .single();
  if (updateError) throw updateError;

  return successResponse({ payment: updatedPayment, allocation });
}

export async function handlePaystackTerminalSettingsPost(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body?.paystackTerminalAction;
    if (action === "request_setup") {
      return await requestPaystackTerminalSetupMobile(
        new NextRequest(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({ name: body.name ?? null, whatsapp: body.whatsapp ?? null }),
        }),
      );
    }
    if (action === "request_assets") {
      const terminalId = typeof body.terminalId === "string" ? body.terminalId : "";
      if (!terminalId) {
        return errorResponse("terminalId is required", "VALIDATION_ERROR", 400);
      }
      return await requestPaystackTerminalAssetsMobile(request, terminalId);
    }
    return errorResponse("Unknown paystackTerminalAction", "BAD_REQUEST", 400);
  } catch (error) {
    return handleApiError(error, "Failed to process Paystack Terminal action");
  }
}

/**
 * Provider-initiated "Check for new payments" (mobile fallback). Mirrors
 * `/api/provider/paystack/terminal-payments/reconcile` so the mobile app can backfill
 * webhook-missed payments without depending on the dedicated route tree being deployed.
 */
export async function reconcilePaystackTerminalPaymentsMobile(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const rate = await checkRateLimit(
      { prefix: "paystack-terminal-reconcile", limit: 6, windowSeconds: 60 },
      providerId,
    );
    if (!rate.allowed) {
      return errorResponse(
        "You're checking too often. Please wait a moment and try again.",
        "RATE_LIMITED",
        429,
      );
    }

    const admin = getSupabaseAdmin();
    const { data: terminalRows, error } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .select("id, provider_id, paystack_terminal_id, terminal_code, currency, provider:providers(tenant_id)")
      .eq("provider_id", providerId)
      .not("paystack_terminal_id", "is", null)
      .is("deleted_at", null);
    if (error) throw error;

    const terminals = (terminalRows ?? []) as ReconcileLocalTerminal[];
    if (terminals.length === 0) {
      return successResponse({
        message:
          "No terminal is ready to check yet. Once Ops finishes setup, payments will appear automatically.",
        checked: 0,
        terminalsChecked: 0,
        terminalPayments: 0,
        recorded: 0,
        results: [],
      });
    }

    const summary = await reconcilePaystackTerminalPayments({
      supabase: admin,
      terminals,
      from: reconcileWindowFromDays(7),
      perPage: 100,
      maxPages: 5,
    });

    return successResponse({
      message:
        summary.recorded > 0
          ? `Found ${summary.recorded} new payment${summary.recorded === 1 ? "" : "s"}.`
          : "You're all caught up. No new payments found.",
      ...summary,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check for new Paystack Terminal payments");
  }
}

/**
 * Marks a terminal payment as seen by the provider (used when the instant-allocation popup is
 * dismissed) so it does not re-prompt across devices/sessions.
 */
export async function markPaystackTerminalPaymentSeenMobile(request: NextRequest, paymentId: string) {
  try {
    const { supabase, providerId } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from("provider_paystack_terminal_payments") as any)
      .update({ provider_seen_at: new Date().toISOString() })
      .eq("id", paymentId)
      .eq("provider_id", providerId)
      .is("provider_seen_at", null)
      .select("id, provider_seen_at")
      .maybeSingle();
    if (error) throw error;
    return successResponse({ payment: data ?? { id: paymentId } });
  } catch (error) {
    return handleApiError(error, "Failed to mark Paystack Terminal payment as seen");
  }
}

export async function handlePaystackTerminalPaymentsPost(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body?.paystackTerminalAction;
    if (action === "collection_intent") {
      const { paystackTerminalAction: _drop, ...payload } = body;
      return await createPaystackTerminalCollectionIntentMobile(
        new NextRequest(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(payload),
        }),
      );
    }
    if (action === "allocate") {
      const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
      if (!paymentId) {
        return errorResponse("paymentId is required", "VALIDATION_ERROR", 400);
      }
      const { paystackTerminalAction, paymentId: _pid, ...allocationBody } = body;
      return await allocatePaystackTerminalPaymentMobile(
        new NextRequest(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(allocationBody),
        }),
        paymentId,
      );
    }
    if (action === "reconcile") {
      return await reconcilePaystackTerminalPaymentsMobile(request);
    }
    if (action === "mark_seen") {
      const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
      if (!paymentId) {
        return errorResponse("paymentId is required", "VALIDATION_ERROR", 400);
      }
      return await markPaystackTerminalPaymentSeenMobile(request, paymentId);
    }
    return errorResponse("Unknown paystackTerminalAction", "BAD_REQUEST", 400);
  } catch (error) {
    return handleApiError(error, "Failed to process Paystack Terminal payment action");
  }
}
