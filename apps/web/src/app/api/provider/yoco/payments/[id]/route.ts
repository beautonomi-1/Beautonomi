import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getYocoEndpoints } from "@/lib/payments/yoco";
import {
  getValidAccessToken,
  resolveProviderCredentialMode,
  YocoOAuthRequired,
} from "@/lib/payments/yoco-oauth";

/**
 * GET /api/provider/yoco/payments/[id]
 * 
 * Get a single Yoco payment
 * 
 * According to Yoco API: https://developer.yoco.com/api-reference/yoco-api/web-pos/fetch-web-pos-payment-v-1-webpos-webpos-device-id-payments-payment-id-get
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"], request);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    // Resolve active provider context (owner/staff, multi-provider safe).
    const providerId = await getProviderIdForUser(auth.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "PROVIDER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Get payment from database
    const { data: payment, error } = await supabase
      .from("provider_yoco_payments")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !payment) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Payment not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    type PaymentRow = {
      id: string;
      yoco_device_id?: string;
      yoco_payment_id?: string;
      status?: string;
      metadata?: Record<string, unknown> | null;
      [key: string]: unknown;
    };
    const paymentData = payment as PaymentRow;

    // §Yoco-OAuth 2026-05: only Web POS payments can be polled via
    // GET /v1/webpos/{device_id}/payments/{payment_id} — and only with a fresh
    // OAuth access token. Virtual checkout payments are kept in sync by the
    // webhook so there is nothing useful to pull here.
    const meta = (paymentData.metadata ?? {}) as Record<string, unknown>;
    const isVirtualCheckout =
      meta.credential_mode === "virtual_checkout" ||
      (typeof paymentData.yoco_device_id === "string" &&
        paymentData.yoco_device_id.startsWith("virtual:"));

    if (!isVirtualCheckout && paymentData.yoco_device_id && paymentData.yoco_payment_id) {
      try {
        const credentials = await resolveProviderCredentialMode(providerId);
        if (credentials.credentialMode === "oauth") {
          const endpoints = getYocoEndpoints(credentials.environment);
          const accessToken = await getValidAccessToken(providerId, {
            environment: credentials.environment,
          });
          const yocoResponse = await fetch(
            endpoints.getWebPosPayment(
              paymentData.yoco_device_id,
              paymentData.yoco_payment_id,
            ),
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (yocoResponse.ok) {
            const yocoPayment = (await yocoResponse.json()) as { status?: string };
            if (yocoPayment.status && yocoPayment.status !== paymentData.status) {
              const previousStatus = paymentData.status;
              await supabase
                .from("provider_yoco_payments")
                .update({
                  status: yocoPayment.status,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id);
              paymentData.status = yocoPayment.status;
              if (
                yocoPayment.status === "successful" &&
                previousStatus !== "successful" &&
                typeof paymentData.device_id === "string" &&
                typeof paymentData.amount === "number"
              ) {
                const { data: device } = await supabase
                  .from("provider_yoco_devices")
                  .select("total_transactions, total_amount")
                  .eq("id", paymentData.device_id)
                  .eq("provider_id", providerId)
                  .maybeSingle();
                const deviceRow = device as { total_transactions?: number | null; total_amount?: number | null } | null;
                await supabase
                  .from("provider_yoco_devices")
                  .update({
                    last_used: new Date().toISOString(),
                    total_transactions: (deviceRow?.total_transactions ?? 0) + 1,
                    total_amount: (deviceRow?.total_amount ?? 0) + paymentData.amount,
                  })
                  .eq("id", paymentData.device_id)
                  .eq("provider_id", providerId);
              }
            }
          }
        }
      } catch (syncError) {
        if (!(syncError instanceof YocoOAuthRequired)) {
          console.error("Error syncing payment status from Yoco:", syncError);
        }
        // Continue with local data; the polled value is best-effort.
      }
    }

    const metadata = (paymentData.metadata ?? {}) as Record<string, unknown>;
    const yocoResp = metadata.yoco_response as { receipt_url?: string; receiptUrl?: string } | undefined;
    const receiptUrl = (metadata.receipt_url as string | undefined) ?? yocoResp?.receipt_url ?? yocoResp?.receiptUrl;
    const credentialMode =
      metadata.credential_mode === "virtual_checkout" ? "virtual_checkout" : "web_pos";
    const checkoutUrl = metadata.checkout_url as string | undefined;
    const qrPayload = metadata.qr_payload as string | undefined;

    return NextResponse.json({
      data: {
        id: paymentData.id,
        yoco_payment_id: paymentData.yoco_payment_id,
        device_id: paymentData.device_id,
        device_name: paymentData.device_name,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: paymentData.status,
        payment_date: paymentData.created_at,
        appointment_id: paymentData.appointment_id,
        sale_id: paymentData.sale_id,
        metadata: paymentData.metadata,
        error_message: paymentData.error_message,
        receipt_url: receiptUrl ?? undefined,
        credential_mode: credentialMode,
        checkout_url: checkoutUrl ?? undefined,
        qr_payload: qrPayload ?? undefined,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/provider/yoco/payments/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch payment",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
