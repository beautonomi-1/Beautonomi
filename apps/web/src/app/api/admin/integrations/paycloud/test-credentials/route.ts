import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { queryPaycloudOrder } from "@/lib/payments/paycloud-client";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";
import { z } from "zod";

const testSchema = z.object({
  environment: z.enum(["live", "sandbox"]).default("sandbox"),
});

async function loadAppCredentials(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  env: PaycloudEnvironment,
  scopeTenantId: string | null,
) {
  if (scopeTenantId) {
    const { data: tenantRow } = await (supabase.from("tenant_paycloud_apps") as any)
      .select("app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled")
      .eq("tenant_id", scopeTenantId)
      .eq("environment", env)
      .maybeSingle();
    if (tenantRow?.app_id && tenantRow?.app_rsa_private_key && tenantRow?.gateway_rsa_public_key) {
      return {
        source: "tenant" as const,
        credentials: {
          app_id: tenantRow.app_id,
          app_rsa_private_key: tenantRow.app_rsa_private_key,
          gateway_rsa_public_key: tenantRow.gateway_rsa_public_key,
          api_base_url: tenantRow.api_base_url ?? undefined,
        },
        is_enabled: tenantRow.is_enabled !== false,
      };
    }
  }

  const { data: globalRow } = await (supabase.from("tenant_paycloud_apps") as any)
    .select("app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled")
    .is("tenant_id", null)
    .eq("environment", env)
    .maybeSingle();

  if (!globalRow?.app_id || !globalRow?.app_rsa_private_key || !globalRow?.gateway_rsa_public_key) {
    return null;
  }

  return {
    source: "global" as const,
    credentials: {
      app_id: globalRow.app_id,
      app_rsa_private_key: globalRow.app_rsa_private_key,
      gateway_rsa_public_key: globalRow.gateway_rsa_public_key,
      api_base_url: globalRow.api_base_url ?? undefined,
    },
    is_enabled: globalRow.is_enabled !== false,
  };
}

/**
 * POST /api/admin/integrations/paycloud/test-credentials
 * Soft-check: signed orderquery reaches PayCloud gateway (order-not-found is OK).
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      "superadmin",
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const parsed = testSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const env = parsed.data.environment;
    const supabase = getSupabaseAdmin();
    const app = await loadAppCredentials(supabase, env, scopeTenantId);
    if (!app) {
      return successResponse({
        ok: false,
        environment: env,
        message: "App credentials incomplete — add app_id and both RSA keys before testing.",
      });
    }
    if (!app.is_enabled) {
      return successResponse({
        ok: false,
        environment: env,
        message: "PayCloud app row is disabled for this environment.",
      });
    }

    let merchantNo = "000000000000";
    let merchantsQuery = supabase
      .from("paycloud_merchants")
      .select("merchant_no")
      .eq("environment", env)
      .eq("is_active", true)
      .limit(1);
    if (scopeTenantId) merchantsQuery = merchantsQuery.eq("tenant_id", scopeTenantId);
    const { data: merchantRow } = await merchantsQuery.maybeSingle();
    if (merchantRow?.merchant_no) merchantNo = merchantRow.merchant_no;

    const probeOrderNo = `beautonomi-credential-test-${Date.now()}`;
    const response = await queryPaycloudOrder(env, app.credentials, merchantNo, probeOrderNo);

    const gatewayReachable =
      Object.keys(response.raw).length > 0 ||
      !!response.response_code ||
      !!response.error_message;

    return successResponse({
      ok: gatewayReachable,
      environment: env,
      credential_source: app.source,
      merchant_no_used: merchantNo,
      probe_order_no: probeOrderNo,
      response_code: response.response_code ?? null,
      message: gatewayReachable
        ? response.success
          ? "Gateway responded successfully."
          : response.error_message || "Gateway reachable (expected order-not-found for probe)."
        : "Could not reach PayCloud gateway — check API base URL and network.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to test PayCloud credentials");
  }
}
