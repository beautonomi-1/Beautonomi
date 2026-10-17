import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  getOffsetPaginationParams,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  computeWalletBankRefundFee,
  getEffectiveWalletBankRefundSettings,
} from "@/lib/wallet-bank-refunds/settings";
import { serializeWalletBankRefundRequest } from "@/lib/wallet-bank-refunds/serialize";
import { notifyWalletBankRefund } from "@/lib/wallet-bank-refunds/notify";

const createSchema = z.object({
  customer_bank_account_id: z.string().uuid(),
  amount: z.number().positive(),
  customer_note: z.string().max(2000).optional(),
  idempotency_key: z.string().max(128).optional(),
});

const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  OPEN_REQUEST_EXISTS: {
    status: 409,
    code: "OPEN_REQUEST_EXISTS",
    message: "You already have a bank refund request in progress.",
  },
  AMOUNT_EXCEEDS_ELIGIBLE: {
    status: 400,
    code: "AMOUNT_EXCEEDS_ELIGIBLE",
    message: "Amount is more than your balance eligible for a bank refund.",
  },
  BANK_ACCOUNT_NOT_FOUND: { status: 404, code: "BANK_ACCOUNT_NOT_FOUND", message: "Bank account not found." },
  WALLET_NOT_FOUND: { status: 404, code: "WALLET_NOT_FOUND", message: "Wallet not found." },
  INVALID_AMOUNT: { status: 400, code: "INVALID_AMOUNT", message: "Enter a valid amount." },
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const admin = getSupabaseAdmin();
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 20, maxLimit: 50 });

    const settings = await getEffectiveWalletBankRefundSettings(admin, tenantId);

    const { data: eligibleRow, error: eErr } = await admin.rpc("wallet_bank_refund_eligible", {
      p_user_id: user.id,
    });
    if (eErr) throw eErr;

    const { data: rows, error, count } = await admin
      .from("wallet_bank_refund_requests")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const requests = (rows || []).map((r) => serializeWalletBankRefundRequest(r as Record<string, unknown>));
    const open = requests.find((r) => r.status === "pending" || r.status === "approved") ?? null;

    return successResponse({
      settings: {
        enabled: settings.enabled,
        min_amount: settings.min_amount,
        max_amount_per_request: settings.max_amount_per_request,
        fee_type: settings.fee_type,
        fee_value: settings.fee_value,
        sla_business_days: settings.sla_business_days,
        help_text: settings.help_text,
      },
      eligible_amount: Number(eligibleRow ?? 0),
      open_request: open,
      requests,
      pagination: {
        limit,
        offset,
        total: count ?? 0,
        has_more: offset + limit < (count ?? 0),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to list wallet bank refund requests");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const admin = getSupabaseAdmin();
    const settings = await getEffectiveWalletBankRefundSettings(admin, tenantId);

    if (!settings.enabled) {
      return errorResponse("Bank refunds are not available in your market right now.", "FEATURE_DISABLED", 403);
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400);
    }

    const amount = Math.round(parsed.data.amount * 100) / 100;
    if (amount < settings.min_amount) {
      return errorResponse(`The minimum bank refund is ${settings.min_amount}.`, "AMOUNT_TOO_LOW", 400);
    }
    if (settings.max_amount_per_request != null && amount > settings.max_amount_per_request) {
      return errorResponse(
        `The maximum per request is ${settings.max_amount_per_request}.`,
        "AMOUNT_TOO_HIGH",
        400,
      );
    }
    const { fee, net } = computeWalletBankRefundFee(amount, settings);
    if (net <= 0) {
      return errorResponse("Amount must be more than the processing fee.", "AMOUNT_TOO_LOW", 400);
    }

    const { data, error } = await admin.rpc("wallet_bank_refund_create", {
      p_user_id: user.id,
      p_bank_account_id: parsed.data.customer_bank_account_id,
      p_amount: amount,
      p_fee_amount: fee,
      p_tenant_id: tenantId,
      p_customer_note: parsed.data.customer_note ?? null,
      p_idempotency_key: parsed.data.idempotency_key ?? null,
    });
    if (error) {
      const known = Object.keys(RPC_ERRORS).find((k) => (error.message || "").includes(k));
      if (known) {
        const e = RPC_ERRORS[known];
        return errorResponse(e.message, e.code, e.status);
      }
      throw error;
    }

    const result = data as { request?: Record<string, unknown>; idempotent?: boolean };
    const row = result?.request;
    if (row && !result.idempotent) {
      await notifyWalletBankRefund("requested", row as never);
    }
    return successResponse({ request: row ? serializeWalletBankRefundRequest(row) : null });
  } catch (error) {
    return handleApiError(error, "Failed to create wallet bank refund request");
  }
}
