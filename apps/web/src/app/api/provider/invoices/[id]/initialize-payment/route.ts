import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  errorResponse,
  forbiddenResponse,
  getProviderIdForUser,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const bodySchema = z.object({
  in_app: z.boolean().optional(),
  callback_url: z.string().optional(),
});

/**
 * POST /api/provider/invoices/[id]/initialize-payment
 *
 * Start a Paystack checkout for an outstanding platform invoice. The invoice is
 * only credited once `charge.success` arrives (or the client verify path runs) —
 * both funnel into `recordProviderInvoicePayment`, which is idempotent on the
 * transaction reference.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const user = permissionCheck.user!;

    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const { data: invoice, error: invoiceError } = await admin
      .from("provider_invoices")
      .select("id, provider_id, invoice_number, total_amount, amount_paid, currency, status")
      .eq("id", id)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return errorResponse("Invoice not found", "NOT_FOUND", 404);
    }

    const inv = invoice as {
      provider_id?: string | null;
      invoice_number?: string | null;
      total_amount?: number | null;
      amount_paid?: number | null;
      currency?: string | null;
      status?: string | null;
    };

    if (!inv.provider_id || !(await userHasProviderAccessAdmin(admin, user.id, inv.provider_id))) {
      return forbiddenResponse("You do not have access to this invoice");
    }

    if (inv.status === "cancelled" || inv.status === "refunded") {
      return errorResponse(
        `This invoice is ${inv.status} and cannot be paid.`,
        "INVALID_STATUS",
        409,
      );
    }

    const amountDue = Number(inv.total_amount ?? 0) - Number(inv.amount_paid ?? 0);
    if (amountDue <= 0) {
      return errorResponse("This invoice is already settled.", "INVALID_STATUS", 409);
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const email = (userRow as { email?: string | null } | null)?.email;
    if (!email) {
      return errorResponse("An email address is required to pay online.", "VALIDATION_ERROR", 400);
    }

    const parsed = bodySchema.parse(await request.json().catch(() => ({})));
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const clientCallback = parsed.callback_url?.trim();
    // Paystack only honours HTTPS callbacks; a custom scheme silently falls back
    // to the merchant default and strands the provider on an unrelated page.
    const useClientCallback = Boolean(clientCallback && /^https?:\/\//i.test(clientCallback));
    const inAppParam = parsed.in_app ? "&in_app=1" : "";
    const callbackUrl = useClientCallback
      ? `${clientCallback}${clientCallback!.includes("?") ? "&" : "?"}payment_success=true&invoice_id=${id}`
      : `${appUrl}/provider/settings/billing?payment_success=true&invoice_id=${id}${inAppParam}`;
    const cancelAction = useClientCallback
      ? `${clientCallback}${clientCallback!.includes("?") ? "&" : "?"}payment_cancelled=1`
      : `${appUrl}/provider/settings/billing?payment_cancelled=1${inAppParam}`;

    const reference = generateTransactionReference("provider_invoice", id);
    const currency = inv.currency || fallbackCurrency;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(amountDue),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        provider_invoice_id: id,
        provider_id: inv.provider_id,
        invoice_number: inv.invoice_number ?? null,
        kind: "provider_invoice_payment",
        cancel_action: cancelAction,
      },
      tenantId,
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;
    if (!paymentUrl) {
      return errorResponse(
        "Paystack did not return a payment URL. Please try again shortly.",
        "PAYSTACK_ERROR",
        502,
      );
    }

    return successResponse({
      invoice_id: id,
      reference,
      amount: amountDue,
      currency,
      payment_url: paymentUrl,
      /** Same URL as `payment_url` — Paystack calls it `authorization_url`. */
      authorization_url: paymentUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }
    return handleApiError(error, "Failed to start invoice payment");
  }
}
