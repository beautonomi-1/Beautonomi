import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireOwnerOrEditSettings } from "@/lib/auth/requirePermission";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { checkPayoutRequestRateLimit } from "@/lib/rate-limit/payout-request";
import { applyRateLimitHeaders } from "@/lib/rate-limit/headers";
import { dateRangeBoundsUtc, formatDateYmd, resolveTz } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { slackNotifyPayoutRequested } from "@/lib/integrations/slack/finance-triggers";
import { resolveVerificationPolicy, isProviderVerificationApproved } from "@/lib/verification/verification-policy";

/**
 * GET /api/provider/payouts
 *
 * List provider payouts from payouts table.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireOwnerOrEditSettings(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { timezone: tz } = await getProviderReportContext(supabase, providerId);
    const ymd = /^\d{4}-\d{2}-\d{2}$/;

    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("payouts")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (startDate && ymd.test(startDate.slice(0, 10))) {
      const fromIso = dateRangeBoundsUtc(startDate.slice(0, 10), startDate.slice(0, 10), tz).fromIso;
      query = query.gte("created_at", fromIso);
    }

    if (endDate && ymd.test(endDate.slice(0, 10))) {
      const endYmd = endDate.slice(0, 10);
      const toIso = dateRangeBoundsUtc(endYmd, endYmd, tz).toIso;
      query = query.lte("created_at", toIso);
    }

    const { data: payouts, error } = await query;

    if (error) {
      throw error;
    }

    // Map to provider-friendly shape (requested_at = created_at for display)
    const mapped = (payouts || []).map((p: any) => ({
      ...p,
      requested_at: p.created_at,
      notes: p.payout_account_details?.notes ?? p.notes ?? null,
    }));

    return successResponse(mapped);
  } catch (error) {
    return handleApiError(error, "Failed to fetch payouts");
  }
}

/**
 * POST /api/provider/payouts
 *
 * Request a payout. Creates record in payouts table for admin to process.
 * Uses service role to bypass RLS (we validate provider + balance server-side).
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requireOwnerOrEditSettings(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    // Wave 2.4 (audit 2026-04 final 100/100): per-user payout rate limit
    // (5/min, 30/hour). Catches accidental retry storms and contains
    // damage from a leaked token before it reaches the balance/INSERT
    // hot path. Keyed on user.id, IP fallback for safety.
    const payoutRl = await checkPayoutRequestRateLimit(request, user.id);
    if (!payoutRl.allowed) {
      const r = errorResponse(
        "You've made too many payout requests recently. Please wait a moment and try again.",
        "RATE_LIMIT_EXCEEDED",
        429,
      );
      return applyRateLimitHeaders(r, {
        remaining: 0,
        retryAfterSeconds: payoutRl.retryAfterSeconds,
      });
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { amount, bank_account_id, notes } = body;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id, currency, timezone, business_name")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null; currency?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));

    // KYC gate: block payout if required_for_payouts flag is on and provider is not verified.
    const { searchParams: payoutParams } = new URL(request.url);
    const payoutEnv = payoutParams.get("environment") ?? "production";
    const payoutPolicy = await resolveVerificationPolicy(effectiveTenantId, payoutEnv);
    if (payoutPolicy.requiredForPayouts) {
      const verified = await isProviderVerificationApproved(providerId);
      if (!verified) {
        return errorResponse(
          "Complete identity verification before requesting a payout. Go to Settings → Verification to get started.",
          "VERIFICATION_REQUIRED",
          403,
        );
      }
    }
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const payoutCurrency =
      (prow as { currency?: string | null } | null)?.currency || lastResortCurrency;

    if (!amount || amount <= 0) {
      return errorResponse("Amount must be greater than 0", "VALIDATION_ERROR", 400);
    }

    const numAmount = Number(amount);
    const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
      supabase: supabase as any,
      table: "platform_settings",
      tenantId: effectiveTenantId,
      select: "settings",
      apply: (q) => q.eq("is_active", true),
      orderBy: { column: "updated_at", ascending: false },
    });
    const payoutSettings = ((scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings as any)?.payouts ?? {};
    const minimumPayout = Number(payoutSettings.minimum_payout_amount ?? 100);
    const holdDays = Number(payoutSettings.payout_hold_days ?? 0);
    if (numAmount < minimumPayout) {
      return errorResponse(
        `Minimum payout amount is ${minimumPayout} ${payoutCurrency}. You requested ${numAmount}.`,
        "BELOW_MINIMUM_PAYOUT",
        400
      );
    }

    const { availableBalance, rawBalance, hasNegativeBalance, breakdown } = await getAvailablePayoutBalance(
      getSupabaseAdmin(),
      providerId,
      {
        holdDays,
        tenantId: (prow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
      },
    );

    // §Final-audit 2026-04 (R4): if a post-payout refund has left the
    // provider in the red, block NEW payout requests and surface the
    // drift loudly. Previously the negative balance was computed and
    // silently floored to 0 — the provider could still request a
    // payout the moment new earnings arrived, even though the platform
    // was owed money from the prior refund. Ops must first reconcile
    // the negative balance (either wait for it to clear organically or
    // issue a manual adjustment) before new payouts resume.
    if (hasNegativeBalance) {
      console.error(
        "[payouts.create] provider has negative raw balance; blocking payout request",
        { providerId, rawBalance, availableBalance },
      );
      try {
        await getSupabaseAdmin()
          .from("reconciliation_gate_runs")
          .insert({
            window_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            window_end: new Date().toISOString(),
            status: "drifted",
            drift_rows: 1,
            drift_summary: {
              kind: "negative_provider_balance",
              provider_id: providerId,
              raw_balance: rawBalance,
            },
            notes: "Payout request blocked due to negative provider balance (R4)",
          });
      } catch (logErr) {
        console.warn("[payouts.create] failed to log reconciliation drift", logErr);
      }
      return errorResponse(
        "Your account is currently under reconciliation. Our finance team will be in touch shortly.",
        "NEGATIVE_BALANCE",
        409,
      );
    }

    const availableRounded = Math.round(availableBalance * 100) / 100;
    const requestRounded = Math.round(numAmount * 100) / 100;
    if (requestRounded > availableRounded + 1e-6) {
      return errorResponse(
        `Insufficient balance. Available: ${availableRounded}, Requested: ${requestRounded}`,
        "INSUFFICIENT_BALANCE",
        400
      );
    }

    // Resolve payout account: use bank_account_id from body if valid, else primary (is_primary then latest)
    const { data: accounts } = await supabase
      .from("provider_payout_accounts")
      .select("id, recipient_code, account_name, account_number_last4, bank_name, currency")
      .eq("provider_id", providerId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    const accountList = accounts || [];
    if (accountList.length === 0) {
      return errorResponse(
        "Add at least one bank account in Settings → Payout Accounts to request a payout.",
        "NO_PAYOUT_ACCOUNT",
        400
      );
    }

    const chosenAccount = bank_account_id
      ? accountList.find((a: any) => a.id === bank_account_id)
      : accountList[0];
    if (bank_account_id && !chosenAccount) {
      return errorResponse("Selected bank account not found or inactive.", "INVALID_ACCOUNT", 400);
    }
    const accountCurrency = (chosenAccount as { currency?: string | null } | undefined)?.currency?.trim().toUpperCase();
    if (accountCurrency && accountCurrency !== payoutCurrency.trim().toUpperCase()) {
      return errorResponse(
        `Selected payout account currency (${accountCurrency}) does not match payout currency (${payoutCurrency}).`,
        "CURRENCY_MISMATCH",
        400,
      );
    }
    const payoutAccountId = chosenAccount?.id ?? accountList[0].id;

    // Insert into payouts table (service role bypasses RLS)
    const supabaseAdmin = getSupabaseAdmin();

    const payoutAccountDetails = {
      ...(notes && { notes }),
      bank_account_id: payoutAccountId,
    };

    // Generate a human-readable payout number: PAY-YYYYMMDD-XXXXX (business calendar date)
    const now = new Date();
    const payoutTz = resolveTz((prow as { timezone?: string | null } | null)?.timezone);
    const dateStamp = formatDateYmd(now, payoutTz).replace(/-/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const payoutNumber = `PAY-${dateStamp}-${randomSuffix}`;

    const maxAvailableBeforeReserve =
      Math.round((availableBalance + breakdown.pendingPayouts) * 100) / 100;

    const payoutPayload = {
      payout_number: payoutNumber,
      amount: numAmount,
      currency: payoutCurrency,
      status: "pending",
      payout_method: "bank_transfer",
      payout_account_details: Object.keys(payoutAccountDetails).length > 0 ? payoutAccountDetails : {},
      platform_fee_amount: 0,
      platform_fee_percentage: Number(payoutSettings.platform_commission_percentage ?? 0),
      net_amount: numAmount,
      scheduled_at: now.toISOString(),
    };

    const { data: payoutRows, error: payoutError } = await supabaseAdmin.rpc(
      "insert_payout_request_guarded",
      {
        p_provider_id: providerId,
        p_max_available_before_reserve: maxAvailableBeforeReserve,
        p_payout: payoutPayload,
      },
    );

    if (payoutError) {
      const msg = payoutError.message ?? "";
      if (msg.includes("INSUFFICIENT_BALANCE")) {
        return errorResponse(
          `Insufficient balance. Available: ${availableRounded}, Requested: ${requestRounded}`,
          "INSUFFICIENT_BALANCE",
          400,
        );
      }
      throw payoutError;
    }

    const payout = Array.isArray(payoutRows) ? payoutRows[0] : payoutRows;
    if (!payout) {
      return errorResponse("Failed to create payout request", "INTERNAL_ERROR", 500);
    }

    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: user.id,
        type: "system",
        title: "Payout Requested",
        message: `Payout request of ${numAmount} ${payoutCurrency} has been submitted`,
        data: { payout_id: payout.id, amount: numAmount },
        action_url: "/provider/payouts",
      });
    } catch {
      // Ignore notification errors
    }

    void slackNotifyPayoutRequested(request, payout as { id: string; provider_id?: string; amount?: number; currency?: string; payout_number?: string }, {
      tenantId: effectiveTenantId,
      providerName: (prow as { business_name?: string | null } | null)?.business_name ?? null,
    });

    return successResponse({
      ...payout,
      requested_at: payout.created_at,
      notes: notes || null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create payout request");
  }
}
