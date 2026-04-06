import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/provider/payouts
 *
 * List provider payouts from payouts table.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

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

    if (startDate) {
      query = query.gte("created_at", `${startDate}T00:00:00`);
    }

    if (endDate) {
      query = query.lte("created_at", `${endDate}T23:59:59`);
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
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { amount, bank_account_id, notes } = body;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id, currency")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null; currency?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
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

    const { availableBalance } = await getAvailablePayoutBalance(getSupabaseAdmin(), providerId, {
      holdDays,
      tenantId: (prow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
    });

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
      .select("id, recipient_code, account_name, account_number_last4, bank_name")
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
    const payoutAccountId = chosenAccount?.id ?? accountList[0].id;

    // Insert into payouts table (service role bypasses RLS)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    const payoutAccountDetails = {
      ...(notes && { notes }),
      bank_account_id: payoutAccountId,
    };

    const { data: payout, error: payoutError } = await supabaseAdmin
      .from("payouts")
      .insert({
        provider_id: providerId,
        payout_number: "",
        amount: numAmount,
        currency: payoutCurrency,
        status: "pending",
        payout_method: "bank_transfer",
        payout_account_details: Object.keys(payoutAccountDetails).length > 0 ? payoutAccountDetails : {},
        platform_fee_amount: 0,
        platform_fee_percentage: Number(payoutSettings.platform_commission_percentage ?? 15),
        net_amount: numAmount,
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (payoutError) {
      throw payoutError;
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

    return successResponse({
      ...payout,
      requested_at: payout.created_at,
      notes: notes || null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create payout request");
  }
}
