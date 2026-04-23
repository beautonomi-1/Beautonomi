import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { z } from "zod";

const patchSchema = z.object({
  paystack_secret_key: z.string().optional(),
  paystack_public_key: z.string().optional(),
  paystack_webhook_secret: z.string().optional(),
});

function maskKey(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return v.slice(0, 6) + "..." + v.slice(-4);
}

const PLATFORM_SECRETS_PAYSTACK_FIELDS =
  "id, tenant_id, paystack_secret_key, paystack_public_key, paystack_webhook_secret, updated_at";

function hasPaystackKeysInRow(row: {
  paystack_secret_key?: string | null;
  paystack_public_key?: string | null;
} | null): boolean {
  if (!row) return false;
  const s = row.paystack_secret_key?.trim();
  const p = row.paystack_public_key?.trim();
  return !!(s || p);
}

/**
 * GET /api/admin/integrations/paystack
 * Returns masked Paystack keys (secrets never returned in full). Superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      (user as { role?: string }).role ?? null
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const supabase = getSupabaseAdmin();

    async function fetchSecretsRow(tenantId: string | null) {
      let q = (supabase.from("platform_secrets") as any)
        .select(PLATFORM_SECRETS_PAYSTACK_FIELDS)
        .order("updated_at", { ascending: false })
        .limit(1);
      q = tenantId == null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    }

    let data = await fetchSecretsRow(scopeTenantId);
    let inherited_from_global = false;

    // Wrong row was previously chosen by "most recently updated" across all tenants; keys often live on the global row.
    if (scopeTenantId != null) {
      if (!hasPaystackKeysInRow(data as { paystack_secret_key?: string | null; paystack_public_key?: string | null })) {
        const globalRow = await fetchSecretsRow(null);
        if (hasPaystackKeysInRow(globalRow as { paystack_secret_key?: string | null; paystack_public_key?: string | null })) {
          data = globalRow;
          inherited_from_global = true;
        }
      }
    }

    const env = {
      has_env_secret_key: !!process.env.PAYSTACK_SECRET_KEY,
      has_env_public_key: !!process.env.PAYSTACK_PUBLIC_KEY,
    };

    const dbConfigured = hasPaystackKeysInRow(
      data as { paystack_secret_key?: string | null; paystack_public_key?: string | null }
    );
    const runtime_configured = dbConfigured || env.has_env_secret_key || env.has_env_public_key;

    if (!data) {
      return successResponse({
        configured: runtime_configured,
        configured_in_db: false,
        masked_secret_key: null,
        masked_public_key: null,
        has_webhook_secret: false,
        inherited_from_global: false,
        secrets_scope: scopeTenantId == null ? "global" : "tenant",
        env,
      });
    }

    return successResponse({
      configured: runtime_configured,
      configured_in_db: dbConfigured,
      masked_secret_key: maskKey(data.paystack_secret_key as string | null | undefined),
      masked_public_key: maskKey(data.paystack_public_key as string | null | undefined),
      has_webhook_secret: !!data.paystack_webhook_secret,
      updated_at: data.updated_at,
      inherited_from_global,
      secrets_scope: inherited_from_global ? "global" : scopeTenantId == null ? "global" : "tenant",
      env,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch Paystack configuration");
  }
}

/**
 * PATCH /api/admin/integrations/paystack
 * Update Paystack keys in platform_secrets. Superadmin only.
 * Only fields explicitly provided are updated (empty string = clear the key).
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);

    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      (user as { role?: string }).role ?? null
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const updates: Record<string, string | null> = {};
    if ("paystack_secret_key" in parsed.data) {
      updates.paystack_secret_key = parsed.data.paystack_secret_key?.trim() || null;
    }
    if ("paystack_public_key" in parsed.data) {
      updates.paystack_public_key = parsed.data.paystack_public_key?.trim() || null;
    }
    if ("paystack_webhook_secret" in parsed.data) {
      updates.paystack_webhook_secret = parsed.data.paystack_webhook_secret?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No fields to update", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    let existingQuery = (supabase.from("platform_secrets") as any)
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1);
    existingQuery =
      scopeTenantId == null ? existingQuery.is("tenant_id", null) : existingQuery.eq("tenant_id", scopeTenantId);
    const { data: existing } = await existingQuery.maybeSingle();

    const payload = {
      ...updates,
      tenant_id: scopeTenantId,
      updated_at: new Date().toISOString(),
    };

    let opError;
    if (existing?.id) {
      const { error } = await (supabase.from("platform_secrets") as any).update(payload).eq("id", existing.id);
      opError = error;
    } else {
      const { error } = await (supabase.from("platform_secrets") as any).insert(payload);
      opError = error;
    }

    if (opError) throw opError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.integrations.paystack.keys.updated",
      entity_type: "platform_secrets",
      metadata: {
        fields_updated: Object.keys(updates),
      },
    });

    return successResponse({ message: "Paystack configuration updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update Paystack configuration");
  }
}
