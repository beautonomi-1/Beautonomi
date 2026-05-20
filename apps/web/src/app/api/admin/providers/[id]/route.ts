import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/providers/[id]
 *
 * Get detailed provider information (superadmin only). Uses admin client to bypass RLS.
 * [id] can be provider UUID or slug.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const { id: idOrSlug } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const byId = UUID_REGEX.test(idOrSlug);

    const { data: provider, error } = await supabase
      .from("providers")
      .select(`
        *,
        locations:provider_locations(*),
        staff:provider_staff(*),
        offerings(*)
      `)
      .eq("tenant_id", tenantId)
      .eq(byId ? "id" : "slug", idOrSlug)
      .single();

    if (error || !provider) {
      return notFoundResponse("Provider not found");
    }

    const providerId = (provider as Record<string, any> & { id: string }).id;

    const prov = provider as Record<string, any> & { user_id?: string };
    let owner: { id: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null } | null = null;
    if (prov.user_id) {
      const { data: ownerRow } = await supabase
        .from("users")
        .select("id, full_name, email, phone, avatar_url")
        .eq("id", prov.user_id)
        .single();
      owner = ownerRow as typeof owner;
    }

    // Get stats (use resolved provider id)
    const { count: bookingCount } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId);

    const { count: reviewCount } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("provider_id", providerId);

    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .eq("provider_id", providerId);

    const avgRating =
      reviews && reviews.length > 0
        ? reviews.reduce((sum: number, r: { rating?: number }) => sum + (r.rating ?? 0), 0) / reviews.length
        : 0;

    const { data: yocoIntegration } = await supabase
      .from("provider_yoco_integrations")
      .select(
        "is_enabled, connected_date, last_sync, public_key, secret_key, credential_mode, environment, created_at, updated_at",
      )
      .eq("provider_id", providerId)
      .maybeSingle();

    const integEnv =
      (yocoIntegration as { environment?: string } | null)?.environment === "sandbox"
        ? "sandbox"
        : "live";

    const { data: yocoOauthToken } = await (supabase
      .from("provider_yoco_oauth_tokens") as any)
      .select("id, expires_at, refresh_expires_at, last_refreshed_at, last_refresh_error, business_id, business_name, user_email")
      .eq("provider_id", providerId)
      .eq("environment", integEnv)
      .maybeSingle();

    const { data: yocoDevices } = await supabase
      .from("provider_yoco_devices")
      .select(
        "id, name, yoco_device_id, location_id, location_name, is_active, last_used, total_transactions, credential_mode, created_at, updated_at",
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: true });

    const { data: yocoLegacyTerminals } = await supabase
      .from("provider_yoco_terminals")
      .select("id, device_id, device_name, location_name, active, created_at, updated_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: true });

    const integ = yocoIntegration as {
      is_enabled?: boolean;
      connected_date?: string | null;
      last_sync?: string | null;
      public_key?: string | null;
      secret_key?: string | null;
      credential_mode?: string | null;
      environment?: string | null;
    } | null;

    const devices = yocoDevices ?? [];
    const legacy = yocoLegacyTerminals ?? [];
    const hasLegacyTerminal = legacy.some((t: { active?: boolean }) => t.active !== false);
    const activeWebDevices = devices.filter((d: { is_active?: boolean }) => d.is_active !== false);
    const hasOauthToken = Boolean(yocoOauthToken);
    const oauthTokenRow = yocoOauthToken as {
      expires_at?: string | null;
      refresh_expires_at?: string | null;
      last_refreshed_at?: string | null;
      last_refresh_error?: string | null;
      business_id?: string | null;
      business_name?: string | null;
      user_email?: string | null;
    } | null;
    const hasRealWebPosDevice = activeWebDevices.some(
      (d: { yoco_device_id?: string | null }) =>
        !String(d.yoco_device_id ?? "").startsWith("virtual:"),
    );

    const yoco_summary = {
      integration: integ
        ? {
            enabled: Boolean(integ.is_enabled),
            connected_at: integ.connected_date ?? null,
            last_sync: integ.last_sync ?? null,
            has_public_key: Boolean(integ.public_key && String(integ.public_key).length > 0),
            has_secret_key: Boolean(integ.secret_key && String(integ.secret_key).trim().length > 0),
            credential_mode:
              integ.credential_mode === "oauth" || integ.credential_mode === "checkout"
                ? integ.credential_mode
                : "none",
            environment: integEnv,
            oauth_token_present: hasOauthToken,
            oauth_token:
              hasOauthToken && oauthTokenRow
                ? {
                    expires_at: oauthTokenRow.expires_at ?? null,
                    refresh_expires_at: oauthTokenRow.refresh_expires_at ?? null,
                    last_refreshed_at: oauthTokenRow.last_refreshed_at ?? null,
                    last_refresh_error: oauthTokenRow.last_refresh_error ?? null,
                    business_id: oauthTokenRow.business_id ?? null,
                    business_name: oauthTokenRow.business_name ?? null,
                    user_email: oauthTokenRow.user_email ?? null,
                  }
                : null,
          }
        : null,
      web_pos_devices: devices,
      legacy_terminals: legacy,
      derived: {
        has_yoco_integration_row: integ != null,
        has_any_registered_machine: devices.length > 0 || legacy.length > 0,
        has_active_web_device: activeWebDevices.length > 0,
        has_active_legacy_terminal: hasLegacyTerminal,
        /** Integration toggled on (credentials path); use with device rows for operational picture */
        integration_enabled: Boolean(integ?.is_enabled),
        /** Best-effort: Web POS on api.yoco.com needs OAuth + a non-virtual device (or legacy terminal). */
        likely_ready_for_terminal_payments:
          Boolean(integ?.is_enabled) &&
          (hasRealWebPosDevice || hasLegacyTerminal) &&
          (hasOauthToken || hasLegacyTerminal),
        /** Hosted-checkout virtual devices only — no physical tap-to-pay. */
        has_virtual_checkout_devices_only:
          Boolean(integ?.is_enabled) &&
          activeWebDevices.length > 0 &&
          !hasRealWebPosDevice &&
          !hasLegacyTerminal,
      },
    };

    return successResponse({
      ...(provider as Record<string, unknown>),
      owner: owner ?? null,
      yoco_summary,
      stats: {
        booking_count: bookingCount || 0,
        review_count: reviewCount || 0,
        average_rating: avgRating,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider");
  }
}

/**
 * PATCH /api/admin/providers/[id]
 *
 * Update provider details. [id] can be provider UUID or slug.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const { id: idOrSlug } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const byId = UUID_REGEX.test(idOrSlug);

    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(byId ? "id" : "slug", idOrSlug)
      .single();

    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    const providerId = (provider as { id: string }).id;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.business_name !== undefined) updateData.business_name = body.business_name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.business_type !== undefined) updateData.business_type = body.business_type;

    const { data: updatedProvider, error: updateError } = await supabase
      .from("providers")
      .update(updateData)
      .eq("id", providerId)
      .eq("tenant_id", tenantId)
      .select("*, locations:provider_locations(*), staff:provider_staff(*), offerings(*)")
      .single();

    if (updateError || !updatedProvider) {
      return handleApiError(updateError, "Failed to update provider");
    }

    const updated = updatedProvider as Record<string, any> & { user_id?: string };
    let owner: { id: string; full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null } | null = null;
    if (updated.user_id) {
      const { data: ownerRow } = await supabase
        .from("users")
        .select("id, full_name, email, phone, avatar_url")
        .eq("id", updated.user_id)
        .single();
      owner = ownerRow as typeof owner;
    }
    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.provider.update",
      entity_type: "provider",
      entity_id: providerId,
      module: "providers_operations",
      risk_level: "high",
      retention_tier: "operational",
      status: "succeeded",
      after_json: updateData,
      changed_fields: Object.keys(updateData).filter((k) => k !== "updated_at"),
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ ...updated, owner: owner ?? null });
  } catch (error) {
    return handleApiError(error, "Failed to update provider");
  }
}
