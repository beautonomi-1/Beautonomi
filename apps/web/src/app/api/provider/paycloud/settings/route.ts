import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse } from "@/lib/supabase/api-helpers";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { computePaycloudReadiness } from "@/lib/payments/paycloud-readiness";
import { z } from "zod";

const patchSchema = z.object({
  accept_paycloud: z.boolean().optional(),
  qr_payments_enabled: z.boolean().optional(),
  cashback_enabled: z.boolean().optional(),
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

    const { data: provider } = await supabase
      .from("providers")
      .select("accept_paycloud, tenant_id")
      .eq("id", providerId)
      .single();

    const { data: settings } = await supabase
      .from("provider_paycloud_settings")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    const readiness = await computePaycloudReadiness(supabase, providerId);

    return successResponse({
      accept_paycloud: readiness.settings.accept,
      qr_payments_enabled: readiness.settings.qr,
      cashback_enabled: readiness.settings.cashback,
      active_terminal_count: readiness.terminals.active,
      ready: readiness.ready,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      terminals: readiness.terminals,
      plan: readiness.plan,
      account_environment: readiness.account_environment ?? null,
    });
  } catch (error: any) {
    console.error("GET /api/provider/paycloud/settings:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to load settings", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: { message: "Validation failed", code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    const { data: provider } = await supabase.from("providers").select("tenant_id").eq("id", providerId).single();

    if (parsed.data.accept_paycloud !== undefined) {
      await supabase.from("providers").update({ accept_paycloud: parsed.data.accept_paycloud }).eq("id", providerId);
    }

    const settingsPayload = {
      provider_id: providerId,
      tenant_id: provider?.tenant_id,
      ...(parsed.data.accept_paycloud !== undefined ? { accept_paycloud: parsed.data.accept_paycloud } : {}),
      ...(parsed.data.qr_payments_enabled !== undefined ? { qr_payments_enabled: parsed.data.qr_payments_enabled } : {}),
      ...(parsed.data.cashback_enabled !== undefined ? { cashback_enabled: parsed.data.cashback_enabled } : {}),
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("provider_paycloud_settings")
      .upsert(settingsPayload, { onConflict: "provider_id" });

    if (upsertError) {
      console.error("PATCH /api/provider/paycloud/settings upsert failed:", upsertError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: upsertError.message || "Failed to save card machine settings",
            code: "SAVE_FAILED",
          },
        },
        { status: 500 },
      );
    }

    return successResponse({ updated: true });
  } catch (error: any) {
    console.error("PATCH /api/provider/paycloud/settings:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to update settings", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
