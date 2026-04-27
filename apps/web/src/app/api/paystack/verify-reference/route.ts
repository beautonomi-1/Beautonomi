import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processSuccessfulPayment } from "@/app/api/payments/webhook/_handlers/charge-success";

/**
 * GET /api/paystack/verify-reference?reference=...&booking_id=...
 *
 * Server-side verification against Paystack (see https://paystack.com/docs/payments/accept-payments/).
 * Read-only: does not mutate booking state (webhooks remain source of truth for fulfillment).
 * When booking_id is provided, checks ownership and amount vs expected outstanding/charge.
 */
type PaystackVerifyApiResponse = {
  status: boolean;
  message?: string;
  data?: {
    status?: string;
    amount?: number;
    currency?: string;
    reference?: string;
    metadata?: Record<string, unknown>;
    fees?: number;
    customer?: {
      email?: string;
      customer_code?: string;
    };
  };
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference")?.trim();
    const bookingIdParam = searchParams.get("booking_id")?.trim();

    if (!reference) {
      return errorResponse("reference is required", "VALIDATION_ERROR", 400);
    }

    const secretKey = await getPaystackSecretKey({ tenantId });
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );

    const json = (await paystackRes.json()) as PaystackVerifyApiResponse;

    if (!paystackRes.ok || !json.status || !json.data) {
      return successResponse({
        verified: false,
        paystackStatus: json.data?.status ?? "unknown",
        message: json.message || "Could not verify transaction with Paystack",
      });
    }

    const d = json.data;
    const txStatus = d.status || "";
    const amountKobo = Number(d.amount ?? 0);
    const amountInCurrency = convertFromSmallestUnit(amountKobo);
    const metadata = (d.metadata || {}) as Record<string, unknown>;

    if (txStatus !== "success") {
      return successResponse({
        verified: false,
        paystackStatus: txStatus,
        message:
          txStatus === "failed"
            ? "Payment was not successful"
            : "Payment is not complete yet",
      });
    }

    if (!bookingIdParam) {
      return successResponse({
        verified: true,
        paystackStatus: txStatus,
        amount: amountInCurrency,
        currency: d.currency ?? lastResortCurrency,
        reference: d.reference ?? reference,
        metadata,
      });
    }

    const metaBookingId = (metadata.booking_id || metadata.bookingId) as string | undefined;
    if (metaBookingId && metaBookingId !== bookingIdParam) {
      return errorResponse(
        "This payment does not belong to this booking",
        "BOOKING_MISMATCH",
        403
      );
    }

    // §Customer-launch (audit 2026-04): honour Bearer tokens from
    // mobile clients (otherwise the RLS-scoped SELECT below silently
    // fails and every mobile payment verification gets "Booking not
    // found"). The `user` id used in the ownership check below is
    // already resolved via `requireRoleInApi(request)` above.
    const supabase = await getSupabaseServer(request);
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, tenant_id, customer_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status")
      .eq("id", bookingIdParam)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    if (!resourceTenantMatchesHostTenant(tenantId, booking.tenant_id)) {
      return errorResponse(
        "This booking belongs to a different market. Open checkout from the correct site or app for this booking.",
        "TENANT_MISMATCH",
        403,
      );
    }

    if (booking.customer_id !== user.id) {
      return errorResponse("Forbidden", "FORBIDDEN", 403);
    }

    const paymentType = metadata.payment_type as string | undefined;
    const chargeId = (metadata.additional_charge_id || metadata.charge_id) as string | undefined;

    if (paymentType === "booking_remaining") {
      const total = Number(booking.total_amount ?? 0);
      const paid = Number(booking.total_paid ?? 0);
      const refunded = Number((booking as any).total_refunded ?? 0);
      const wallet = Number((booking as any).wallet_amount ?? 0);
      const gift = Number((booking as any).gift_card_amount ?? 0);
      const effectivePaid = Math.max(0, paid - refunded);
      const remaining = Math.max(0, total - effectivePaid - wallet - gift);

      if (remaining > 0.02) {
        if (Math.abs(amountInCurrency - remaining) > 0.02) {
          return successResponse({
            verified: false,
            paystackStatus: txStatus,
            message: "Paid amount does not match the outstanding balance",
            code: "AMOUNT_MISMATCH",
          });
        }
      }
    } else if (chargeId) {
      const { data: charge, error: chargeErr } = await supabase
        .from("additional_charges")
        .select("id, amount, booking_id, status")
        .eq("id", chargeId)
        .eq("booking_id", bookingIdParam)
        .maybeSingle();

      if (chargeErr || !charge) {
        return notFoundResponse("Additional charge not found");
      }

      const ch = charge as { amount?: number; status?: string };
      if (ch.status !== "paid") {
        const expected = Number(ch.amount ?? 0);
        if (Math.abs(amountInCurrency - expected) > 0.02) {
          return successResponse({
            verified: false,
            paystackStatus: txStatus,
            message: "Paid amount does not match this charge",
            code: "AMOUNT_MISMATCH",
          });
        }
      }
    }

    await processSuccessfulPayment(
      {
        reference: d.reference ?? reference,
        metadata,
        amount: d.amount,
        fees: d.fees,
        customer: d.customer,
      },
      getSupabaseAdmin(),
    );

    return successResponse({
      verified: true,
      paystackStatus: txStatus,
      amount: amountInCurrency,
      currency: d.currency ?? lastResortCurrency,
      reference: d.reference ?? reference,
      metadata,
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify payment");
  }
}
