import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { appleIapEnabledFromEnv, loadAppleConnectConfig, loadAppleIapConfig } from "@/lib/iap/apple/config";
import { appleJwsVerificationEnabled } from "@/lib/iap/apple/jws";

function maskSecret(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return v.slice(0, 6) + "..." + v.slice(-4);
}

const patchSchema = z.object({
  apple_app_store_issuer_id: z.string().optional(),
  apple_app_store_key_id: z.string().optional(),
  apple_app_store_private_key: z.string().optional(),
  apple_app_store_bundle_id: z.string().optional(),
  apple_iap_commission_rate: z.number().min(0.05).max(0.35).optional(),
  apple_asc_vendor_number: z.string().optional(),
  apple_finance_region_code: z.string().min(1).max(8).optional(),
  apple_connect_issuer_id: z.string().optional(),
  apple_connect_key_id: z.string().optional(),
  apple_connect_private_key: z.string().optional(),
});

/** GET /api/admin/integrations/apple */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const config = await loadAppleIapConfig(supabase);
    const { data: row } = await supabase
      .from("platform_secrets")
      .select(
        "apple_app_store_issuer_id, apple_app_store_key_id, apple_app_store_private_key, apple_app_store_bundle_id, apple_iap_commission_rate, apple_asc_vendor_number, apple_finance_region_code, apple_connect_issuer_id, apple_connect_key_id, apple_connect_private_key, updated_at",
      )
      .is("tenant_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const connect = await loadAppleConnectConfig(supabase);
    const r = row as Record<string, unknown> | null;
    return successResponse({
      configured: Boolean(config),
      finance_configured: Boolean(connect),
      issuer_id: r?.apple_app_store_issuer_id ?? null,
      key_id: r?.apple_app_store_key_id ?? null,
      private_key: maskSecret(String(r?.apple_app_store_private_key ?? "")),
      bundle_id: r?.apple_app_store_bundle_id ?? "com.beautonomi.partner",
      commission_rate: Number(r?.apple_iap_commission_rate ?? 0.15),
      vendor_number: r?.apple_asc_vendor_number ?? null,
      finance_region_code: r?.apple_finance_region_code ?? "ZZ",
      connect_issuer_id: r?.apple_connect_issuer_id ?? null,
      connect_key_id: r?.apple_connect_key_id ?? null,
      connect_private_key: maskSecret(String(r?.apple_connect_private_key ?? "")),
      enabled: appleIapEnabledFromEnv(),
      jws_verification_enabled: appleJwsVerificationEnabled(),
      updated_at: r?.updated_at ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/admin/integrations/apple */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = patchSchema.safeParse(await request.json());
    if (!body.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, body.error.flatten());
    }
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("platform_secrets")
      .select("id")
      .is("tenant_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(body.data)) {
      if (v !== undefined) patch[k] = v;
    }

    if (existing?.id) {
      await supabase.from("platform_secrets").update(patch).eq("id", (existing as { id: string }).id);
    } else {
      await supabase.from("platform_secrets").insert({ ...patch, tenant_id: null });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.integrations.apple.updated",
      entity_type: "platform_secrets",
      after_json: Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [
          k,
          k.includes("private_key") ? maskSecret(String(v)) : v,
        ]),
      ),
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
