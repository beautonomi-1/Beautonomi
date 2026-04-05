import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { chargeAuthorization, convertToSmallestUnit } from "@/lib/payments/paystack-complete";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { z } from "zod";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const chargeSavedCardSchema = z.object({
  payment_method_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().optional(),
  email: z.string().email(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * POST /api/payments/charge-saved-card
 * 
 * Charge a saved Paystack card using authorization code
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin']);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const body = chargeSavedCardSchema.parse(await request.json());
    const currency = body.currency ?? lastResortCurrency;

    const supabase = await getSupabaseServer();

    // Get the payment method
    const { data: paymentMethod, error: pmError } = await (supabase
      .from("payment_methods") as any)
      .select("*")
      .eq("id", body.payment_method_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("provider", "paystack")
      .single();

    if (pmError || !paymentMethod) {
      return handleApiError(
        new Error("Payment method not found or invalid"),
        "Payment method not found",
        "NOT_FOUND",
        404
      );
    }

    // Verify the payment method belongs to the user
    if (paymentMethod.user_id !== user.id) {
      return handleApiError(
        new Error("Unauthorized"),
        "You don't have permission to use this payment method",
        "UNAUTHORIZED",
        403
      );
    }

    // Get authorization code
    const authorizationCode = paymentMethod.provider_payment_method_id;

    if (!authorizationCode || !authorizationCode.startsWith("AUTH_")) {
      return handleApiError(
        new Error("Invalid payment method"),
        "This payment method is not a valid Paystack authorization",
        "INVALID_METHOD",
        400
      );
    }

    const meta = body.metadata ?? {};
    const bookingIdFromMeta =
      (typeof meta.booking_id === "string" && meta.booking_id) ||
      (typeof meta.bookingId === "string" && meta.bookingId) ||
      null;
    if (bookingIdFromMeta) {
      const { data: bookingRow, error: bookingErr } = await supabase
        .from("bookings")
        .select("id, tenant_id, customer_id")
        .eq("id", bookingIdFromMeta)
        .maybeSingle();
      if (bookingErr || !bookingRow) {
        return notFoundResponse("Booking not found");
      }
      if (!resourceTenantMatchesHostTenant(tenantId, bookingRow.tenant_id)) {
        return errorResponse(
          "This booking belongs to a different market. Open checkout from the correct site or app for this booking.",
          "TENANT_MISMATCH",
          403,
        );
      }
      if (bookingRow.customer_id !== user.id) {
        return errorResponse(
          "You do not have permission to charge this booking",
          "FORBIDDEN",
          403,
        );
      }
    }

    // Charge the card
    const amountInSmallestUnit = convertToSmallestUnit(body.amount);

    const chargeResult = await chargeAuthorization(
      authorizationCode,
      body.email,
      amountInSmallestUnit,
      {
        ...body.metadata,
        payment_method_id: body.payment_method_id,
        user_id: user.id,
      },
      { tenantId }
    );

    if (!chargeResult.status) {
      return handleApiError(
        new Error(chargeResult.message || "Charge failed"),
        "Failed to charge card",
        "CHARGE_FAILED",
        400
      );
    }

    // Sync the booking's payment status/totals when a booking_id is present
    if (bookingIdFromMeta && chargeResult.data?.reference) {
      try {
        const supabaseAdmin = getSupabaseAdmin();
        await syncBookingAfterPaystackSuccess(supabaseAdmin, bookingIdFromMeta, {
          paymentReference: chargeResult.data.reference,
          paymentProvider: "paystack",
        });
      } catch (syncErr) {
        console.error("[charge-saved-card] Failed to sync booking after charge:", syncErr);
      }
    }

    return successResponse({
      transaction: chargeResult.data,
      reference: chargeResult.data.reference,
      status: chargeResult.data.status,
      message: chargeResult.message,
      currency,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to charge saved card");
  }
}
