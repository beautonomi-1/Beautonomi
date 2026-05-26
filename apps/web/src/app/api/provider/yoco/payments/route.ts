import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkYocoFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";
import {
  convertToCents,
  validateYocoAmount,
  getYocoEndpoints,
} from "@/lib/payments/yoco";
import {
  getValidAccessToken,
  getCheckoutBearer,
  resolveProviderCredentialMode,
  YocoOAuthRequired,
} from "@/lib/payments/yoco-oauth";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { requireYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";

const createPaymentSchema = z
  .object({
    device_id: z.string().min(1, "Device ID is required"),
    amount: z.number().min(0.01).optional(),
    amount_cents: z.number().int().min(1).optional(),
    currency: z.string().optional(),
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
    const auth = await requireRole(["provider_owner", "provider_staff"], request);
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
    const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
    if (yocoGate) return yocoGate;

    const { data: provider } = await supabase
      .from("providers")
      .select("id, tenant_id")
      .eq("id", providerId)
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

    const providerRow = provider as { id: string; tenant_id?: string | null };
    const effectiveTenantId =
      providerRow.tenant_id ?? (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Subscription gate: Yoco is a paid feature (app shows upgrade message for SUBSCRIPTION_REQUIRED)
    const yocoAccess = await checkYocoFeatureAccess(providerId, supabase);
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
      .select("id, name, yoco_device_id, is_active, credential_mode, total_transactions, total_amount")
      .eq("id", validationResult.data.device_id)
      .eq("provider_id", providerId)
      .single();

    type DeviceRow = {
      id: string;
      name?: string;
      yoco_device_id?: string;
      is_active?: boolean;
      credential_mode?: "web_pos" | "virtual_checkout";
      total_transactions?: number;
      total_amount?: number;
    };
    type LegacyTerminalRow = {
      id: string;
      device_id?: string | null;
      device_name?: string | null;
      active?: boolean | null;
      secret_key?: string | null;
      api_key?: string | null;
    };

    const { data: legacyTerminal } = !device
      ? await supabase
          .from("provider_yoco_terminals")
          .select("id, device_id, device_name, active, secret_key, api_key")
          .eq("id", validationResult.data.device_id)
          .eq("provider_id", providerId)
          .maybeSingle()
      : { data: null as LegacyTerminalRow | null };

    if (!device && !legacyTerminal) {
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

    const deviceRow = (device as DeviceRow | null) ?? null;
    const legacyRow = (legacyTerminal as LegacyTerminalRow | null) ?? null;
    const usingLegacyTerminal = !deviceRow && !!legacyRow;
    const deviceCredentialMode: "web_pos" | "virtual_checkout" =
      deviceRow?.credential_mode === "virtual_checkout"
        ? "virtual_checkout"
        : "web_pos";
    const deviceName = usingLegacyTerminal
      ? String(legacyRow?.device_name || "Yoco terminal")
      : String(deviceRow?.name || "Yoco device");
    const rawYocoDeviceId = usingLegacyTerminal
      ? String(legacyRow?.device_id || "")
      : String(deviceRow?.yoco_device_id || "");
    // §Yoco-OAuth 2026-05: a virtual_checkout device stores a "virtual:UUID"
    // sentinel in yoco_device_id; never forward that to Yoco.
    const yocoDeviceId =
      deviceCredentialMode === "virtual_checkout" || rawYocoDeviceId.startsWith("virtual:")
        ? ""
        : rawYocoDeviceId;
    const billingDeviceId = usingLegacyTerminal ? null : (deviceRow?.id ?? null);
    const isDeviceActive = usingLegacyTerminal ? legacyRow?.active !== false : deviceRow?.is_active === true;

    if (!isDeviceActive) {
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

    const credentials = await resolveProviderCredentialMode(providerId);
    const endpoints = getYocoEndpoints(credentials.environment);

    // Decide which Yoco API to call and which Bearer to use. Legacy terminals
    // still ship with their own embedded secret_key — keep that path working.
    const legacySecretKey = usingLegacyTerminal
      ? String(legacyRow?.secret_key || legacyRow?.api_key || "").trim()
      : "";

    if (deviceCredentialMode === "web_pos" && !usingLegacyTerminal) {
      if (credentials.credentialMode !== "oauth") {
        return NextResponse.json(
          {
            data: null,
            error: {
              message:
                "This Web POS device needs an OAuth connection to Yoco. Open Payment Settings and tap Connect Yoco to enable card payments.",
              code: "YOCO_OAUTH_REQUIRED",
            },
          },
          { status: 400 },
        );
      }
      if (!yocoDeviceId) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message:
                "This device is missing a Yoco device id. Re-add it in Yoco settings so we can register it with Yoco.",
              code: "DEVICE_NOT_CONFIGURED",
            },
          },
          { status: 400 },
        );
      }
    }
    if (
      deviceCredentialMode === "web_pos" &&
      usingLegacyTerminal &&
      !legacySecretKey
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Yoco integration not enabled",
            code: "INTEGRATION_DISABLED",
          },
        },
        { status: 400 },
      );
    }

    if (
      deviceCredentialMode === "virtual_checkout" &&
      credentials.credentialMode === "none"
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "This device uses Yoco's hosted checkout. Add your Yoco dashboard secret key in Payment Settings to enable it.",
            code: "INTEGRATION_DISABLED",
          },
        },
        { status: 400 },
      );
    }

    // Resolve the Bearer to use for the WEB POS path.
    let webPosBearer: string | null = null;
    if (deviceCredentialMode === "web_pos") {
      if (usingLegacyTerminal) {
        webPosBearer = legacySecretKey;
      } else {
        try {
          webPosBearer = await getValidAccessToken(providerId, {
            environment: credentials.environment,
          });
        } catch (err) {
          if (err instanceof YocoOAuthRequired) {
            return NextResponse.json(
              {
                data: null,
                error: {
                  message: err.message,
                  code: err.code,
                },
              },
              { status: 400 },
            );
          }
          throw err;
        }
      }
    }

    // §Provider-launch (audit 2026-04): preflight the physical / Web POS
    // device with Yoco before we create a payment. Without this, a
    // powered-off or disconnected terminal still received `POST …/payments`
    // and the provider only saw a generic API failure after a long poll.
    if (deviceCredentialMode === "web_pos" && yocoDeviceId && webPosBearer) {
      const deviceProbe = await fetch(endpoints.getWebPosDevice(yocoDeviceId), {
        method: "GET",
        headers: { Authorization: `Bearer ${webPosBearer}` },
      });
      if (!deviceProbe.ok) {
        const errJson = (await deviceProbe.json().catch(() => ({}))) as {
          detail?: string;
          message?: string;
        };
        const detail = errJson.detail ?? errJson.message;
        const isNotFound = deviceProbe.status === 404;
        const isAuth = deviceProbe.status === 401 || deviceProbe.status === 403;
        return NextResponse.json(
          {
            data: null,
            error: {
              message: isAuth
                ? "Your Yoco connection was rejected. Please reconnect Yoco in Payment Settings and try again."
                : isNotFound
                  ? "This terminal was not found in Yoco. Re-link or re-add the device in Payment Settings."
                  : detail?.trim() ||
                    "Could not reach your Yoco terminal. Check that it is powered on, online, and paired, then try again.",
              code: isAuth
                ? "YOCO_OAUTH_EXPIRED"
                : isNotFound
                  ? "TERMINAL_NOT_FOUND"
                  : "TERMINAL_UNAVAILABLE",
            },
          },
          { status: isAuth ? 400 : isNotFound ? 404 : 503 },
        );
      }
    }

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
    const currency = validationResult.data.currency || lastResortCurrency;

    // Reuse recent pending payment for same booking or sale to avoid double-send when app timed out after first create
    const PENDING_WINDOW_MINUTES = 15;
    const saleId = validationResult.data.sale_id ?? null;
    if (appointmentId || saleId) {
      let reuseQuery = supabase
        .from("provider_yoco_payments")
        .select("id, yoco_payment_id, yoco_device_id, amount, currency, status, created_at, device_id, metadata")
        .eq("provider_id", providerId)
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
          metadata?: Record<string, unknown> | null;
        };
        // For Web POS, poll Yoco for the latest status before reusing the row.
        // For virtual_checkout there's no poll endpoint that uses the dashboard
        // secret in the same shape; just return what we have.
        if (deviceCredentialMode === "web_pos" && webPosBearer && existing.yoco_device_id && existing.yoco_payment_id) {
          try {
            const statusRes = await fetch(
              endpoints.getWebPosPayment(existing.yoco_device_id, existing.yoco_payment_id),
              { headers: { Authorization: `Bearer ${webPosBearer}` } },
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
                existing.status = latestStatus;
              }
            }
          } catch (reuseErr) {
            console.warn("Reuse pending: failed to sync status from Yoco", reuseErr);
          }
        }
        const { data: dev } = await supabase
          .from("provider_yoco_devices")
          .select("name")
          .eq("id", existing.device_id)
          .single();
        const reusedName = (dev as { name?: string } | null)?.name ?? deviceName;
        const reusedMeta = (existing.metadata ?? {}) as Record<string, unknown>;
        return NextResponse.json({
          data: {
            id: existing.id,
            yoco_payment_id: existing.yoco_payment_id,
            reference: existing.yoco_payment_id,
            device_id: existing.device_id,
            device_name: reusedName,
            amount: existing.amount,
            amount_cents: existing.amount,
            currency: existing.currency,
            status: existing.status,
            payment_date: existing.created_at,
            appointment_id: appointmentId,
            sale_id: validationResult.data.sale_id,
            metadata: validationResult.data.metadata,
            credential_mode: deviceCredentialMode,
            checkout_url: (reusedMeta.checkout_url as string | undefined) ?? undefined,
            qr_payload: (reusedMeta.qr_payload as string | undefined) ?? undefined,
          },
          error: null,
        });
      }
    }

    // client_reference is required by Yoco API; used for reconciliation and echoed back (https://developer.yoco.com/api-reference/yoco-api/web-pos/create-web-pos-payment-v-1-webpos-webpos-device-id-payments-post)
    const clientReference =
      appointmentId ||
      (validationResult.data.sale_id ?? null) ||
      crypto.randomUUID();

    // Yoco expects amount as Money object and metadata values as strings (API reference)
    const metadataRecord: Record<string, string> = {
      provider_id: providerId,
      device_id: validationResult.data.device_id,
      processed_by: auth.user.id,
      ...(appointmentId ? { appointment_id: appointmentId } : {}),
      ...(validationResult.data.sale_id ? { sale_id: validationResult.data.sale_id } : {}),
    };
    if (validationResult.data.metadata) {
      for (const [k, v] of Object.entries(validationResult.data.metadata)) {
        metadataRecord[k] = v === null || v === undefined ? "" : String(v);
      }
    }

    // §Yoco-audit 2026-05 (idempotency): forward an Idempotency-Key derived
    // from `client_reference` so the Yoco Web POS API safely deduplicates
    // when this route is retried (network blip / our caller re-invokes).
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(`${providerId}:${yocoDeviceId}:${clientReference}:${amountInCents}:${currency}`)
      .digest("hex");

    let yocoPayment: Record<string, any>;
    let receiptUrl: string | undefined;
    let checkoutUrl: string | undefined;
    let qrPayload: string | undefined;
    let yocoId: string;
    let yocoDeviceIdForRow: string = yocoDeviceId;
    let initialStatus: string;

    if (deviceCredentialMode === "web_pos") {
      // Auth: OAuth-issued JWT Bearer on api.yoco.com (or legacy terminal key).
      const yocoResponse = await fetch(
        endpoints.createWebPosPayment(yocoDeviceId),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${webPosBearer}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
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
        const isAuth = yocoResponse.status === 401 || yocoResponse.status === 403;
        const message = isAuth
          ? "Your Yoco connection was rejected. Please reconnect Yoco in Payment Settings and try again."
          : errorData.detail ??
            errorData.errors?.[0]?.detail ??
            errorData.message ??
            "Failed to process payment";
        const rawCode = errorData.code ?? "YOCO_API_ERROR";
        const code = isAuth
          ? "YOCO_OAUTH_EXPIRED"
          : rawCode === "validation"
            ? "VALIDATION_ERROR"
            : rawCode;
        return NextResponse.json(
          { data: null, error: { message, code, details: errorData } },
          { status: yocoResponse.status }
        );
      }

      yocoPayment = await yocoResponse.json();
      receiptUrl =
        (yocoPayment as { receipt_url?: string; receiptUrl?: string }).receipt_url ??
        (yocoPayment as { receipt_url?: string; receiptUrl?: string }).receiptUrl;
      yocoId = yocoPayment.id || yocoPayment.paymentId;
      initialStatus = yocoPayment.status || "pending";
    } else {
      // virtual_checkout: create a Yoco Checkout session. Customer pays on
      // Yoco's hosted page (or by scanning the QR code we render). Webhook
      // updates the row to 'successful' / 'failed' once the customer is done.
      const checkoutBearer = await getCheckoutBearer(providerId);
      if (!checkoutBearer) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message:
                "Yoco Checkout is enabled but no secret key is saved. Add your Yoco dashboard secret key in Payment Settings.",
              code: "INTEGRATION_DISABLED",
            },
          },
          { status: 400 },
        );
      }
      const checkoutBody: Record<string, unknown> = {
        amount: amountInCents,
        currency,
        metadata: metadataRecord,
        externalId: String(clientReference),
      };
      const checkoutRes = await fetch(endpoints.createCheckout, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${checkoutBearer}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(checkoutBody),
      });

      if (!checkoutRes.ok) {
        const errorData = (await checkoutRes.json().catch(() => ({}))) as {
          detail?: string;
          message?: string;
          errorCode?: string;
          errorMessage?: string;
          errors?: Array<{ detail?: string }>;
        };
        console.error("Yoco checkout error:", errorData);
        const isAuth = checkoutRes.status === 401 || checkoutRes.status === 403;
        const message = isAuth
          ? "Yoco rejected your dashboard secret key. Double-check the key in Payment Settings."
          : errorData.detail ??
            errorData.errorMessage ??
            errorData.errors?.[0]?.detail ??
            errorData.message ??
            "Failed to create Yoco checkout";
        return NextResponse.json(
          {
            data: null,
            error: {
              message,
              code: isAuth ? "YOCO_CHECKOUT_KEY_INVALID" : "YOCO_API_ERROR",
              details: errorData,
            },
          },
          { status: checkoutRes.status },
        );
      }

      const checkout = (await checkoutRes.json()) as {
        id?: string;
        redirectUrl?: string;
        status?: string;
      };
      if (!checkout.id || !checkout.redirectUrl) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Invalid response from Yoco Checkout",
              code: "YOCO_API_ERROR",
            },
          },
          { status: 502 },
        );
      }

      yocoPayment = checkout as Record<string, any>;
      yocoId = checkout.id;
      yocoDeviceIdForRow = String(deviceRow?.id ?? "");
      checkoutUrl = checkout.redirectUrl;
      qrPayload = checkout.redirectUrl;
      initialStatus = checkout.status?.toLowerCase() === "completed" ? "successful" : "pending";
    }

    const { data: payment, error: insertError } = await supabase
      .from("provider_yoco_payments")
      .insert({
        provider_id: providerId,
        device_id: billingDeviceId,
        yoco_payment_id: yocoId,
        yoco_device_id: yocoDeviceIdForRow,
        amount: amountInCents,
        currency,
        status: initialStatus,
        appointment_id: appointmentId,
        sale_id: validationResult.data.sale_id,
        metadata: {
          client_reference: String(clientReference),
          yoco_response: yocoPayment,
          credential_mode: deviceCredentialMode,
          ...(receiptUrl ? { receipt_url: receiptUrl } : {}),
          ...(checkoutUrl ? { checkout_url: checkoutUrl } : {}),
          ...(qrPayload ? { qr_payload: qrPayload } : {}),
          ...validationResult.data.metadata,
        },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !payment) {

      // Duplicate-key: Yoco payment already stored — return the existing row.
      if ((insertError as { code?: string } | null)?.code === "23505" && yocoId) {
        const { data: existingPayment } = await supabase
          .from("provider_yoco_payments")
          .select("*")
          .eq("yoco_payment_id", yocoId)
          .maybeSingle();
        if (existingPayment) {
          const existing = existingPayment as {
            id: string;
            yoco_payment_id: string;
            device_id: string;
            amount: number;
            currency: string;
            status: string;
            created_at: string;
            appointment_id?: string | null;
            sale_id?: string | null;
            metadata?: Record<string, unknown> | null;
          };
          const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
          return NextResponse.json({
            data: {
              id: existing.id,
              yoco_payment_id: existing.yoco_payment_id,
              reference: existing.yoco_payment_id,
              device_id: existing.device_id ?? validationResult.data.device_id,
              device_name: deviceName,
              amount: existing.amount,
              amount_cents: existing.amount,
              currency: existing.currency,
              status: existing.status,
              payment_date: existing.created_at,
              appointment_id: existing.appointment_id,
              sale_id: existing.sale_id,
              metadata: existing.metadata,
              credential_mode: deviceCredentialMode,
              receipt_url: (existingMeta.receipt_url as string | undefined) ?? undefined,
              checkout_url: (existingMeta.checkout_url as string | undefined) ?? undefined,
              qr_payload: (existingMeta.qr_payload as string | undefined) ?? undefined,
            },
            error: null,
          });
        }
      }

      // Non-duplicate DB failure: the payment was processed by Yoco but failed to record.
      // Return an error with the Yoco payment ID so the provider or ops team can reconcile manually.
      console.error("Error storing Yoco payment (yoco_payment_id=%s):", yocoId, insertError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Payment was processed by the terminal but could not be recorded. " +
              "Note this reference for your records and contact support: " +
              String(yocoId ?? "unknown"),
            code: "PAYMENT_RECORD_ERROR",
            yoco_payment_id: yocoId ?? null,
          },
        },
        { status: 500 },
      );
    }

    if (!usingLegacyTerminal && deviceRow?.id && initialStatus === "successful") {
      await supabase
        .from("provider_yoco_devices")
        .update({
          last_used: new Date().toISOString(),
          total_transactions: (deviceRow.total_transactions ?? 0) + 1,
          total_amount: (deviceRow.total_amount ?? 0) + amountInCents,
        })
        .eq("id", deviceRow.id);
    }

    return NextResponse.json({
      data: {
        id: payment.id,
        yoco_payment_id: yocoId,
        reference: yocoId,
        device_id: billingDeviceId ?? validationResult.data.device_id,
        device_name: deviceName,
        amount: amountInCents,
        amount_cents: amountInCents,
        currency,
        status: initialStatus,
        payment_date: new Date().toISOString(),
        appointment_id: appointmentId,
        sale_id: validationResult.data.sale_id,
        metadata: validationResult.data.metadata,
        credential_mode: deviceCredentialMode,
        receipt_url: receiptUrl ?? undefined,
        checkout_url: checkoutUrl ?? undefined,
        qr_payload: qrPayload ?? undefined,
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
    const auth = await requireRole(["provider_owner", "provider_staff"], request);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

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
      .eq("provider_id", providerId);

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
