import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  environment: z.enum(["live", "sandbox"]).optional(),
  is_enabled: z.boolean().optional(),
  public_key: z.string().optional(),
  secret_key: z.string().optional(),
  webhook_secret: z.string().optional(),
  credential_mode: z.enum(["none", "checkout", "oauth"]).optional(),
  clear_checkout_credentials: z.boolean().optional(),
  reset_reconnect_banner: z.boolean().optional(),
});

const postSchema = z.object({
  action: z.enum(["disconnect_oauth"]),
});

async function resolveProviderId(request: NextRequest, idOrSlug: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const tenantId = await resolveAdminApiTenantId(request);
  const byId = UUID_REGEX.test(idOrSlug);
  const { data } = await supabase
    .from("providers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq(byId ? "id" : "slug", idOrSlug)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function hasOauthToken(providerId: string, environment: "live" | "sandbox") {
  const supabase = getSupabaseAdmin();
  const { data } = await (supabase.from("provider_yoco_oauth_tokens") as any)
    .select("id")
    .eq("provider_id", providerId)
    .eq("environment", environment)
    .maybeSingle();
  return Boolean(data);
}

/**
 * PATCH /api/admin/providers/[id]/yoco
 *
 * Superadmin break-glass support for provider Yoco state:
 * - enable/disable integration
 * - switch live/sandbox
 * - set or clear hosted-checkout keys
 * - explicitly set credential_mode when support has confirmed the scenario
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { id } = await params;
    const providerId = await resolveProviderId(request, id);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await (supabase.from("provider_yoco_integrations") as any)
      .select("id, secret_key, credential_mode, environment")
      .eq("provider_id", providerId)
      .maybeSingle();
    const row =
      (existing as {
        id?: string;
        secret_key?: string | null;
        credential_mode?: "none" | "checkout" | "oauth" | null;
        environment?: "live" | "sandbox" | null;
      } | null) ?? null;

    const environment = parsed.data.environment ?? row?.environment ?? "live";
    const oauthPresent = await hasOauthToken(providerId, environment);
    const updates: Record<string, unknown> = {
      provider_id: providerId,
      environment,
      updated_at: new Date().toISOString(),
      last_sync: new Date().toISOString(),
    };

    if (parsed.data.is_enabled !== undefined) updates.is_enabled = parsed.data.is_enabled;
    if (parsed.data.public_key !== undefined) updates.public_key = parsed.data.public_key.trim() || null;
    if (parsed.data.webhook_secret !== undefined) updates.webhook_secret = parsed.data.webhook_secret.trim() || null;
    if (parsed.data.secret_key !== undefined) updates.secret_key = parsed.data.secret_key.trim() || null;
    if (parsed.data.clear_checkout_credentials) {
      updates.public_key = null;
      updates.secret_key = null;
      updates.webhook_secret = null;
    }
    if (parsed.data.reset_reconnect_banner) updates.reconnect_banner_dismissed_at = null;

    const willHaveCheckoutKey =
      parsed.data.clear_checkout_credentials === true
        ? false
        : parsed.data.secret_key !== undefined
          ? parsed.data.secret_key.trim().length > 0
          : !!row?.secret_key?.trim();

    updates.credential_mode =
      parsed.data.credential_mode ??
      (oauthPresent ? "oauth" : willHaveCheckoutKey ? "checkout" : "none");

    if (!row?.id) {
      updates.created_at = new Date().toISOString();
      updates.connected_date = new Date().toISOString();
      if (updates.is_enabled === undefined) updates.is_enabled = true;
    }

    let opError: unknown;
    if (row?.id) {
      const { error } = await (supabase.from("provider_yoco_integrations") as any)
        .update(updates)
        .eq("id", row.id);
      opError = error;
    } else {
      const { error } = await (supabase.from("provider_yoco_integrations") as any).insert(updates);
      opError = error;
    }
    if (opError) throw opError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.providers.yoco.integration.updated",
      entity_type: "provider_yoco_integrations",
      entity_id: providerId,
      metadata: {
        provider_id: providerId,
        environment,
        fields_updated: Object.keys(parsed.data),
        credential_mode: updates.credential_mode,
      },
    });

    return successResponse({ message: "Provider Yoco integration updated" });
  } catch (error) {
    return handleApiError(error, "Failed to update provider Yoco integration");
  }
}

/**
 * POST /api/admin/providers/[id]/yoco
 *
 * Support action for stale/expired OAuth connections. Deletes OAuth tokens and
 * falls back to checkout mode if the provider still has hosted-checkout keys.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const { id } = await params;
    const providerId = await resolveProviderId(request, id);
    if (!providerId) return notFoundResponse("Provider not found");

    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Unsupported Yoco admin action", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { error: deleteError } = await (supabase.from("provider_yoco_oauth_tokens") as any)
      .delete()
      .eq("provider_id", providerId);
    if (deleteError) throw deleteError;

    const { data: integration } = await (supabase.from("provider_yoco_integrations") as any)
      .select("secret_key")
      .eq("provider_id", providerId)
      .maybeSingle();
    const stillHasCheckoutKey = !!(integration as { secret_key?: string | null } | null)?.secret_key?.trim();
    const newMode = stillHasCheckoutKey ? "checkout" : "none";

    await (supabase.from("provider_yoco_integrations") as any)
      .update({
        credential_mode: newMode,
        reconnect_banner_dismissed_at: null,
        ...(stillHasCheckoutKey ? {} : { is_enabled: false }),
        last_sync: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("provider_id", providerId);

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.providers.yoco.oauth.disconnected",
      entity_type: "provider_yoco_oauth_tokens",
      entity_id: providerId,
      metadata: { provider_id: providerId, credential_mode: newMode },
    });

    return successResponse({ disconnected: true, credential_mode: newMode });
  } catch (error) {
    return handleApiError(error, "Failed to run provider Yoco admin action");
  }
}
