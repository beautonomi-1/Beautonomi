import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { checkYocoFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";
import { convertToCents, validateYocoAmount, YOCO_ENDPOINTS } from "@/lib/payments/yoco";

const createPaymentSchema = z
  .object({
    device_id: z.string().min(1, "Device ID is required"),
    amount: z.number().min(0.01).optional(),
    amount_cents: z.number().int().min(1).optional(),
    currency: z.string().optional().default("ZAR"),
    appointment_id: z.string().uuid().optional().nullable(),
    booking_id: z.string().uuid().optional().nullable(),
    sale_id: z.string().uuid().optional().nullable(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .refine((d) => d.amount != null || d.amount_cents != null, {
    message: "Either amount or amount_cents is required",
    path: ["amount"],
  });/**
 * POST /api/provider/yoco/payments
 * 
 * Create a Yoco Web POS payment
 * 
 * According to Yoco API: https://developer.yoco.com/api-reference/yoco-api/web-pos/create-web-pos-payment-v-1-webpos-webpos-device-id-payments-post
 * 
 * This endpoint processes payments through physical Yoco terminals for walk-in customers
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = createPaymentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Resolve amount (Rands) and appointment_id for provider app compatibility
    const amountInRands =
      validationResult.data.amount ??
      (validationResult.data.amount_cents != null
        ? validationResult.data.amount_cents / 100
        : undefined);
    const appointmentId =
      validationResult.data.appointment_id ?? validationResult.data.booking_id ?? null;

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

    // Subscription gate: Yoco is a paid feature (app shows upgrade message for SUBSCRIPTION_REQUIRED)
    const yocoAccess = await checkYocoFeatureAccess(provider.id);
    if (!yocoAccess.enabled) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Upgrade your plan to use Yoco card payments.",
            code: "SUBSCRIPTION_REQUIRED",
          },
        },
        { status: 403 }
      );
    }

    // Get Yoco device
    const { data: device } = await supabase
      .from("provider_yoco_devices")
      .select("id, name, yoco_device_id, is_active")
      .eq("id", validationResult.data.device_id)
      .eq("provider_id", provider.id)
      .single();

    if (!device) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Device not found",
            code: "DEVICE_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    type DeviceRow = { id: string; name?: string; yoco_device_id?: string; is_active?: boolean; total_transactions?: number; total_amount?: number };
    type IntegrationRow = { secret_key?: string; public_key?: string; is_enabled?: boolean };
    const deviceRow = device as DeviceRow;
    if (!deviceRow.is_active) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Device is not active",
            code: "DEVICE_INACTIVE",
          },
        },
        { status: 400 }
      );
    }

    const { data: integration } = await supabase
      .from("provider_yoco_integrations")
      .select("secret_key, public_key, is_enabled")
      .eq("provider_id", provider.id)
      .single();

    const integrationRow = integration as IntegrationRow | null;
    if (!integrationRow || !integrationRow.is_enabled) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Yoco integration not enabled",
            code: "INTEGRATION_DISABLED",
          },
        },
        { status: 400 }
      );
    }

    const secretKey = integrationRow.secret_key;
    const yocoDeviceId = deviceRow.yoco_device_id;

    // Validate amount
    const amountValidation = validateYocoAmount(amountInRands);
    if (!amountValidation.valid) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: amountValidation.error || "Invalid amount",
            code: "INVALID_AMOUNT",
          },
        },
        { status: 400 }
      );
    }

    // Convert amount to cents
    const amountInCents = convertToCents(amountInRands);
    const currency = validationResult.data.currency || "ZAR";

    // Reuse recent pending payment for same booking or sale to avoid double-send when app timed out after first create
    const PENDING_WINDOW_MINUTES = 15;
    const saleId = validationResult.data.sale_id ?? null;
    if (appointmentId || saleId) {
      let reuseQuery = supabase
        .from("provider_yoco_payments")
        .select("id, yoco_payment_id, yoco_device_id, amount, currency, status, created_at, device_id")
        .eq("provider_id", provider.id)
        .eq("status", "pending")
        .gte("created_at", new Date(Date.now() - PENDING_WINDOW_MINUTES * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (appointmentId) reuseQuery = reuseQuery.eq("appointment_id", appointmentId);
      else reuseQuery = reuseQuery.eq("sale_id", saleId);
      const { data: existingPending } = await reuseQuery.maybeSingle();

      if (existingPending) {
        const existing = existingPending as {
          id: string;
          yoco_payment_id: string;
          yoco_device_id: string;
          amount: number;
          currency: string;
          status: string;
          created_at: string;
          device_id: string;
        };
        try {
          const statusRes = await fetch(
            YOCO_ENDPOINTS.getWebPosPayment(existing.yoco_device_id, existing.yoco_payment_id),
            {
              headers: { Authorization: `Bearer ${secretKey}` },
            }
          );
          if (statusRes.ok) {
            const yocoPayment = await statusRes.json();
            const latestStatus = yocoPayment.status || existing.status;
            if (latestStatus !== existing.status) {
              await supabase
                .from("provider_yoco_payments")
                .update({
                  status: latestStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id);
            }
            const { data: dev } = await supabase
              .from("provider_yoco_devices")
              .select("name")
              .eq("id", existing.device_id)
              .single();
            const deviceName = (dev as { name?: string } | null)?.name ?? deviceRow.name;
            return NextResponse.json({
              data: {
                id: existing.id,
                yoco_payment_id: existing.yoco_payment_id,
                reference: existing.yoco_payment_id,
                device_id: existing.device_id,
                device_name: deviceName,
                amount: existing.amount,
                amount_cents: existing.amount,
                currency: existing.currency,
                status: latestStatus,
                payment_date: existing.created_at,
                appointment_id: appointmentId,
                sale_id: validationResult.data.sale_id,
                metadata: validationResult.data.metadata,
              },
              error: null,
            });
          }
        } catch (reuseErr) {
          console.warn("Reuse pending: failed to sync status from Yoco", reuseErr);
          // Fall through to create new payment
        }
      }
    }

    // client_reference is required by Yoco API; used for reconciliation and echoed back (https://developer.yoco.com/api-reference/yoco-api/web-pos/create-web-pos-payment-v-1-webpos-webpos-device-id-payments-post)
    const clientReference =
      appointmentId ||
      (validationResult.data.sale_id ?? null) ||
      crypto.randomUUID();

    // Yoco expects amount as Money object and metadata values as strings (API reference)
    const metadataRecord: Record<string, string> = {
      provider_id: provider.id,
      device_id: device.id,
      processed_by: auth.user.id,
      ...(appointmentId ? { appointment_id: appointmentId } : {}),
      ...(validationResult.data.sale_id ? { sale_id: validationResult.data.sale_id } : {}),
    };
    if (validationResult.data.metadata) {
      for (const [k, v] of Object.entries(validationResult.data.metadata)) {
        metadataRecord[k] = v === null || v === undefined ? "" : String(v);
      }
    }

    // Auth: Bearer token (Yoco API uses JWT; we store secret_key from Yoco dashboard as the Bearer token for api.yoco.com)
    const yocoResponse = await fetch(
      YOCO_ENDPOINTS.createWebPosPayment(yocoDeviceId),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: { amount: amountInCents, currency },
          client_reference: String(clientReference),
          metadata: metadataRecord,
        }),
      }
    );

    if (!yocoResponse.ok) {
      const errorData = (await yocoResponse.json().catch(() => ({}))) as {
        detail?: string;
        code?: string;
        message?: string;
        errors?: Array<{ detail?: string }>;
      };
      console.error("Yoco payment error:", errorData);
      const message =
        errorData.detail ??
        errorData.errors?.[0]?.detail ??
        errorData.message ??
        "Failed to process payment";
      const code = errorData.code ?? "YOCO_API_ERROR";
      return NextResponse.json(
        {
          data: null,
          error: {
            message,
            code: code === "validation" ? "VALIDATION_ERROR" : code,
            details: errorData,
          },
        },
        { status: yocoResponse.status }
      );
    }

    const yocoPayment = await yocoResponse.json();
    // Yoco Web POS API does not document receipt_url; we store/return it if present for future or other flows
    const receiptUrl = (yocoPayment as { receipt_url?: string; receiptUrl?: string }).receipt_url
      ?? (yocoPayment as { receipt_url?: string; receiptUrl?: string }).receiptUrl;

    const { data: payment, error: insertError } = await supabase
      .from("provider_yoco_payments")
      .insert({
        provider_id: provider.id,
        device_id: device.id,
        yoco_payment_id: yocoPayment.id || yocoPayment.paymentId,
        yoco_device_id: yocoDeviceId,
        amount: amountInCents,
        currency,
        status: yocoPayment.status || "pending",
        appointment_id: appointmentId,
        sale_id: validationResult.data.sale_id,
        metadata: {
          client_reference: String(clientReference),
          yoco_response: yocoPayment,
          ...(receiptUrl ? { receipt_url: receiptUrl } : {}),
          ...validationResult.data.metadata,
        },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !payment) {
      console.error("Error storing payment:", insertError);
      // Payment was processed by Yoco but failed to store - log for manual reconciliation
    }

    await supabase
      .from("provider_yoco_devices")
      .update({
        last_used: new Date().toISOString(),
        total_transactions: (deviceRow.total_transactions ?? 0) + 1,
        total_amount: (deviceRow.total_amount ?? 0) + amountInCents,
      })
      .eq("id", device.id);

    const yocoId = yocoPayment.id || yocoPayment.paymentId;
    return NextResponse.json({
      data: {
        id: payment?.id || `temp-${Date.now()}`,
        yoco_payment_id: yocoId,
        reference: yocoId,
        device_id: device.id,
        device_name: device.name,
        amount: amountInCents,
        amount_cents: amountInCents,
        currency,
        status: yocoPayment.status || "pending",
        payment_date: new Date().toISOString(),
        appointment_id: appointmentId,
        sale_id: validationResult.data.sale_id,
        metadata: validationResult.data.metadata,
        receipt_url: receiptUrl ?? undefined,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/provider/yoco/payments:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to process payment",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/provider/yoco/payments
 * 
 * List provider's Yoco payments
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

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

    const status = searchParams.get("status");
    const deviceId = searchParams.get("device_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("provider_yoco_payments")
      .select("*, provider_yoco_devices(name)", { count: "exact" })
      .eq("provider_id", provider.id);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    // Apply pagination
    const { data: payments, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching payments:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch payments",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    type PaymentListItem = {
      id: string;
      yoco_payment_id?: string;
      device_id?: string;
      amount?: number;
      currency?: string;
      status?: string;
      refund_status?: string | null;
      refund_amount?: number | null;
      created_at?: string;
      appointment_id?: string | null;
      sale_id?: string | null;
      metadata?: Record<string, unknown>;
      error_message?: string | null;
      provider_yoco_devices?: { name?: string } | null;
    };
    return NextResponse.json({
      data: (payments || []).map((p: PaymentListItem) => ({
        id: p.id,
        yoco_payment_id: p.yoco_payment_id,
        device_id: p.device_id,
        device_name: p.provider_yoco_devices?.name ?? null,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        refund_status: p.refund_status ?? null,
        refund_amount: p.refund_amount ?? null,
        payment_date: p.created_at,
        appointment_id: p.appointment_id,
        sale_id: p.sale_id,
        metadata: p.metadata,
        error_message: p.error_message,
      })),
      error: null,
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/provider/yoco/payments:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch payments",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
