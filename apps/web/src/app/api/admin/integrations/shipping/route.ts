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
import {
  loadEcommerceShippingRuntime,
  maskSecret,
  type EcommerceShippingEnvOverride,
} from "@/lib/orders/shipping-secrets";

const SECRET_KEYS = [
  "courier_guy_api_key",
  "courier_guy_base_url",
  "bob_go_api_key",
  "bob_go_base_url",
  "aramex_account_number",
  "aramex_account_pin",
  "aramex_username",
  "aramex_password",
  "aramex_account_entity",
  "aramex_account_country_code",
  "aramex_source",
  "aramex_base_url",
] as const;

const patchSchema = z.object({
  ecommerce_shipping_enabled: z.boolean().optional(),
  courier_guy_api_key: z.string().optional(),
  courier_guy_base_url: z.string().optional(),
  bob_go_api_key: z.string().optional(),
  bob_go_base_url: z.string().optional(),
  aramex_account_number: z.string().optional(),
  aramex_account_pin: z.string().optional(),
  aramex_username: z.string().optional(),
  aramex_password: z.string().optional(),
  aramex_account_entity: z.string().optional(),
  aramex_account_country_code: z.string().optional(),
  aramex_source: z.string().optional(),
  aramex_base_url: z.string().optional(),
});

function envHas(name: string): boolean {
  return Boolean((process.env[name] ?? "").trim());
}

function statusPayload(
  runtime: Awaited<ReturnType<typeof loadEcommerceShippingRuntime>>,
  envOverride: EcommerceShippingEnvOverride,
) {
  const row = runtime.raw ?? {};
  return {
    enabled: runtime.enabled,
    enabled_in_db: runtime.dbEnabled,
    env_override: envOverride,
    any_courier_configured: runtime.configured["courier-guy"] || runtime.configured["bob-go"] || runtime.configured.aramex,
    couriers: {
      "courier-guy": {
        configured: runtime.configured["courier-guy"],
        from_env: envHas("COURIER_GUY_API_KEY"),
        masked_key: maskSecret(runtime.credentials["courier-guy"]?.apiKey),
        base_url: runtime.credentials["courier-guy"]?.baseUrl || "https://api.shiplogic.com",
      },
      "bob-go": {
        configured: runtime.configured["bob-go"],
        from_env: envHas("BOB_GO_API_KEY"),
        masked_key: maskSecret(runtime.credentials["bob-go"]?.apiKey),
        base_url: runtime.credentials["bob-go"]?.baseUrl || "https://api.bobgo.co.za/v2",
      },
      aramex: {
        configured: runtime.configured.aramex,
        from_env: envHas("ARAMEX_ACCOUNT_NUMBER") && envHas("ARAMEX_PASSWORD"),
        masked_password: maskSecret(runtime.credentials.aramex?.password),
        account_number: runtime.credentials.aramex?.accountNumber
          ? maskSecret(runtime.credentials.aramex.accountNumber)
          : maskSecret(typeof row.aramex_account_number === "string" ? row.aramex_account_number : null),
        username: runtime.credentials.aramex?.username ?? (typeof row.aramex_username === "string" ? row.aramex_username : null),
        account_entity:
          runtime.credentials.aramex?.accountEntity ??
          (typeof row.aramex_account_entity === "string" ? row.aramex_account_entity : null) ??
          "JNB",
        account_country_code:
          runtime.credentials.aramex?.accountCountryCode ??
          (typeof row.aramex_account_country_code === "string" ? row.aramex_account_country_code : null) ??
          "ZA",
        source:
          runtime.credentials.aramex?.source != null
            ? String(runtime.credentials.aramex.source)
            : typeof row.aramex_source === "string"
              ? row.aramex_source
              : "24",
        base_url: runtime.credentials.aramex?.baseUrl || "https://ws.aramex.net/ShippingAPI.V2",
      },
    },
    updated_at: runtime.updatedAt,
  };
}

/** GET /api/admin/integrations/shipping */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const runtime = await loadEcommerceShippingRuntime(supabase);
    return successResponse(statusPayload(runtime, runtime.envOverride));
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/admin/integrations/shipping */
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
    if (body.data.ecommerce_shipping_enabled !== undefined) {
      patch.ecommerce_shipping_enabled = body.data.ecommerce_shipping_enabled;
    }
    for (const key of SECRET_KEYS) {
      const value = body.data[key];
      if (typeof value === "string" && value.trim()) {
        patch[key] = value.trim();
      }
    }

    const write = existing?.id
      ? await supabase.from("platform_secrets").update(patch).eq("id", (existing as { id: string }).id)
      : await supabase.from("platform_secrets").insert({ ...patch, tenant_id: null });
    if (write.error) throw write.error;

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.integrations.shipping.updated",
      entity_type: "platform_secrets",
      after_json: Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [
          k,
          k.includes("key") || k.includes("password") || k.includes("pin") ? maskSecret(String(v)) : v,
        ]),
      ),
    });

    const runtime = await loadEcommerceShippingRuntime(supabase);
    return successResponse(statusPayload(runtime, runtime.envOverride));
  } catch (error) {
    return handleApiError(error);
  }
}
