import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { resolveSingleActivePaycloudMerchant } from "@/lib/payments/paycloud-merchant-helpers";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { checkPaycloudFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const createTerminalSchema = z.object({
  terminal_sn: z.string().min(1, "Terminal serial number is required"),
  display_name: z.string().min(1, "Name is required"),
  location_id: z.string().uuid().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { data: terminals, error } = await supabase
      .from("paycloud_terminals")
      .select(`
        id, display_name, terminal_sn, location_id, status, source,
        is_active, total_transactions, total_amount, last_used_at, last_error,
        in_flight_payment_id,
        terminal_asset_id, assigned_at, created_at, updated_at,
        provider_locations:location_id ( name ),
        merchant:paycloud_merchants ( label, merchant_no, store_no )
      `)
      .eq("provider_id", providerId)
      .not("status", "eq", "decommissioned")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const mapped = (terminals ?? []).map((t: any) => ({
      id: t.id,
      name: t.display_name,
      display_name: t.display_name,
      terminal_sn: t.terminal_sn,
      serial_number: t.terminal_sn,
      location_id: t.location_id,
      location_name: t.provider_locations?.name ?? (t.location_id ? null : "All locations"),
      is_active: t.is_active,
      status: t.status,
      source: t.source,
      total_transactions: t.total_transactions ?? 0,
      total_amount: Number(t.total_amount ?? 0),
      last_used: t.last_used_at,
      last_error: t.last_error,
      in_flight_payment_id: t.in_flight_payment_id ?? null,
      created_at: t.created_at,
      merchant: t.merchant
        ? {
            label: t.merchant.label ?? "",
            merchant_no: t.merchant.merchant_no ?? "",
            store_no: t.merchant.store_no ?? "",
          }
        : null,
    }));

    const { data: settings } = await supabase
      .from("provider_paycloud_settings")
      .select("accept_paycloud, qr_payments_enabled, cashback_enabled")
      .eq("provider_id", providerId)
      .maybeSingle();

    return NextResponse.json({
      data: {
        terminals: mapped,
        accept_paycloud: settings?.accept_paycloud ?? false,
        qr_payments_enabled: settings?.qr_payments_enabled ?? false,
        cashback_enabled: settings?.cashback_enabled ?? false,
      },
      error: null,
    });
  } catch (error: any) {
    console.error("GET /api/provider/paycloud/terminals:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to load card machines", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const parsed = createTerminalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: { message: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.issues } }, { status: 400 });
    }

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const paycloudAccess = await checkPaycloudFeatureAccess(providerId, supabase);
    if (!paycloudAccess.enabled) {
      return NextResponse.json({ data: null, error: { message: "Card machines require a plan upgrade.", code: "SUBSCRIPTION_REQUIRED" } }, { status: 403 });
    }

    const { count } = await supabase
      .from("paycloud_terminals")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .not("status", "eq", "decommissioned");

    if (paycloudAccess.maxTerminals != null && (count ?? 0) >= paycloudAccess.maxTerminals) {
      return NextResponse.json({ data: null, error: { message: "You've reached the card machine limit on your plan. Upgrade to add more.", code: "TERMINAL_LIMIT_REACHED" } }, { status: 403 });
    }

    const { data: provider } = await supabase.from("providers").select("tenant_id").eq("id", providerId).single();
    if (!provider?.tenant_id) {
      return NextResponse.json({ data: null, error: { message: "Provider tenant not found", code: "TENANT_NOT_FOUND" } }, { status: 400 });
    }

    const merchantPick = await resolveSingleActivePaycloudMerchant(supabase, provider.tenant_id);
    if ("error" in merchantPick) {
      const message =
        merchantPick.error === "MERCHANT_AMBIGUOUS"
          ? "Multiple card machine accounts are configured. Ask Beautonomi to assign your machine to the correct test or live account."
          : "Card machine account isn't ready yet. Beautonomi must register a merchant before you can add a serial.";
      return NextResponse.json(
        { data: null, error: { message, code: merchantPick.error } },
        { status: 400 },
      );
    }

    const { data: terminal, error } = await supabase
      .from("paycloud_terminals")
      .insert({
        tenant_id: provider.tenant_id,
        provider_id: providerId,
        paycloud_merchant_id: merchantPick.id,
        terminal_sn: parsed.data.terminal_sn.trim(),
        display_name: parsed.data.display_name.trim(),
        location_id: parsed.data.location_id ?? null,
        status: "active",
        source: "self_add",
        is_active: true,
        assigned_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ data: null, error: { message: "This serial number is already registered.", code: "DUPLICATE_TERMINAL" } }, { status: 409 });
      }
      throw error;
    }

    try {
      const { markPendingIntegrationOrdersComplete } = await import(
        "@/lib/terminal/terminal-integration-setup"
      );
      await markPendingIntegrationOrdersComplete(supabase, providerId, "paycloud");
    } catch (completeErr) {
      console.error(
        "POST /api/provider/paycloud/terminals: markPendingIntegrationOrdersComplete failed",
        completeErr,
      );
    }

    return NextResponse.json({ data: terminal, error: null }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/provider/paycloud/terminals:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to add card machine", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
