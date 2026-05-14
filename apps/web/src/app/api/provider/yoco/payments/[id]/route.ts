import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { YOCO_ENDPOINTS } from "@/lib/payments/yoco";

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

    // Get provider ID
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .or(`user_id.eq.${auth.user.id},id.in.(select provider_id from provider_staff where user_id.eq.${auth.user.id})`)
      .single();

    if (!provider) {
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
      .eq("provider_id", provider.id)
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

    type PaymentRow = { id: string; yoco_device_id?: string; yoco_payment_id?: string; status?: string; [key: string]: unknown };
    type IntegrationRow = { secret_key?: string };
    const paymentData = payment as PaymentRow;

    if (paymentData.yoco_device_id && paymentData.yoco_payment_id) {
      try {
        const { data: integration } = await supabase
          .from("provider_yoco_integrations")
          .select("secret_key")
          .eq("provider_id", provider.id)
          .single();

        const integrationRow = integration as IntegrationRow | null;
        if (integrationRow?.secret_key) {
          const yocoResponse = await fetch(
            YOCO_ENDPOINTS.getWebPosPayment(
              paymentData.yoco_device_id,
              paymentData.yoco_payment_id
            ),
            {
              headers: {
                Authorization: `Bearer ${integrationRow.secret_key}`,
              },
            }
          );

          if (yocoResponse.ok) {
            const yocoPayment = await yocoResponse.json() as { status?: string };
            if (yocoPayment.status !== paymentData.status) {
              await supabase
                .from("provider_yoco_payments")
                .update({
                  status: yocoPayment.status,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id);
              paymentData.status = yocoPayment.status;
            }
          }
        }
      } catch (syncError) {
        console.error("Error syncing payment status from Yoco:", syncError);
        // Continue with local data
      }
    }

    const metadata = (paymentData.metadata ?? {}) as Record<string, unknown>;
    const yocoResp = metadata.yoco_response as { receipt_url?: string; receiptUrl?: string } | undefined;
    const receiptUrl = (metadata.receipt_url as string | undefined) ?? yocoResp?.receipt_url ?? yocoResp?.receiptUrl;

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
