import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { convertToCents, validateYocoAmount } from "@/lib/payments/yoco";

const createPaymentSchema = z.object({
  device_id: z.string().uuid().min(1, "Device ID is required"),
  amount: z.number().min(0.01, "Amount must be at least 0.01"),
  currency: z.string().optional().default("ZAR"),
  appointment_id: z.string().uuid().optional().nullable(),
  sale_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional(),
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

    if (!(device as any).is_active) {
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

    // Get Yoco integration credentials
    const { data: integration } = await supabase
      .from("provider_yoco_integrations")
      .select("secret_key, public_key, is_enabled")
      .eq("provider_id", provider.id)
      .single();

    if (!integration || !(integration as any).is_enabled) {
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

    const secretKey = (integration as any).secret_key;
    const yocoDeviceId = (device as any).yoco_device_id;

    // Validate amount
    const amountValidation = validateYocoAmount(validationResult.data.amount);
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
    const amountInCents = convertToCents(validationResult.data.amount);

    // Call Yoco Web POS API to create payment
    // According to: https://developer.yoco.com/api-reference/yoco-api/web-pos/create-web-pos-payment-v-1-webpos-webpos-device-id-payments-post
    const yocoResponse = await fetch(
      YOCO_ENDPOINTS.createWebPosPayment(yocoDeviceId),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInCents,
          currency: validationResult.data.currency || "ZAR",
          metadata: {
            provider_id: provider.id,
            device_id: device.id,
            appointment_id: validationResult.data.appointment_id,
            sale_id: validationResult.data.sale_id,
            processed_by: auth.user.id,
            ...validationResult.data.metadata,
          },
        }),
      }
    );

    if (!yocoResponse.ok) {
      const errorData = await yocoResponse.json().catch(() => ({ message: "Yoco API error" }));
      console.error("Yoco payment error:", errorData);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: errorData.message || "Failed to process payment",
            code: "YOCO_API_ERROR",
            details: errorData,
          },
        },
        { status: yocoResponse.status }
      );
    }

    const yocoPayment = await yocoResponse.json();

    // Store payment in database
    const { data: payment, error: insertError } = await (supabase
      .from("provider_yoco_payments") as any)
      .insert({
        provider_id: provider.id,
        device_id: device.id,
        yoco_payment_id: yocoPayment.id || yocoPayment.paymentId,
        yoco_device_id: yocoDeviceId,
        amount: amountInCents,
        currency: validationResult.data.currency || "ZAR",
        status: yocoPayment.status || "pending",
        appointment_id: validationResult.data.appointment_id,
        sale_id: validationResult.data.sale_id,
        metadata: {
          yoco_response: yocoPayment,
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

    // Update device stats
    await (supabase
      .from("provider_yoco_devices") as any)
      .update({
        last_used: new Date().toISOString(),
        total_transactions: ((device as any).total_transactions || 0) + 1,
        total_amount: ((device as any).total_amount || 0) + amountInCents,
      })
      .eq("id", device.id);

    return NextResponse.json({
      data: {
        id: payment?.id || `temp-${Date.now()}`,
        yoco_payment_id: yocoPayment.id || yocoPayment.paymentId,
        device_id: device.id,
        device_name: device.name,
        amount: amountInCents,
        currency: validationResult.data.currency || "ZAR",
        status: yocoPayment.status || "pending",
        payment_date: new Date().toISOString(),
        appointment_id: validationResult.data.appointment_id,
        sale_id: validationResult.data.sale_id,
        metadata: validationResult.data.metadata,
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
      .select("*", { count: "exact" })
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

    return NextResponse.json({
      data: (payments || []).map((p: any) => ({
        id: p.id,
        yoco_payment_id: p.yoco_payment_id,
        device_id: p.device_id,
        device_name: p.device_name,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
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
