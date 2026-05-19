import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkYocoFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";
import { verifyYocoConfig, type YocoEnvironment } from "@/lib/payments/yoco";
import { resolveProviderCredentialMode } from "@/lib/payments/yoco-oauth";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

const updateIntegrationSchema = z.object({
  is_enabled: z.boolean().optional(),
  secret_key: z.string().optional(),
  public_key: z.string().optional(),
  api_key: z.string().optional(), // alias for public_key (provider app sends this)
  webhook_secret: z.string().optional().nullable(),
  environment: z.enum(["sandbox", "live"]).optional(),
});

/**
 * GET /api/provider/yoco/integration
 *
 * Get provider's Yoco integration settings
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"], request);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(auth.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "PROVIDER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check subscription allows Yoco integration (for viewing, allow but show upgrade prompt)
    const yocoAccess = await checkYocoFeatureAccess(providerId, supabase);

    const { data: integration, error } = await supabase
      .from("provider_yoco_integrations")
      .select("*")
      .eq("provider_id", providerId)
      .single();

    if (error && (error as any).code !== "PGRST116") {
      // PGRST116 = not found, which is OK for new providers
      console.error("Error fetching integration:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch integration",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Resolve tenant for the flag check (tenant override wins over global).
    const adminClientForTenant = getSupabaseAdmin();
    const { data: providerRow } = await (adminClientForTenant.from("providers") as any)
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const providerTenantId: string | null = providerRow?.tenant_id ?? null;
    const oauthV2Enabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.YOCO_OAUTH_V2,
      providerTenantId
    );

    if (!integration) {
      return NextResponse.json({
        data: {
          is_enabled: false,
          api_key_set: false,
          webhook_configured: false,
          secret_key: null,
          public_key: null,
          webhook_secret: null,
          connected_date: null,
          last_sync: null,
          subscription_required: !yocoAccess.enabled,
          credential_mode: "none" as const,
          environment: "live" as const,
          oauth_connected: false,
          oauth_business_name: null,
          oauth_expires_at: null,
          oauth_scopes: [] as string[],
          oauth_v2_enabled: oauthV2Enabled,
          reconnect_banner_dismissed_at: null as string | null,
        },
        error: null,
      });
    }

    const integ = integration as {
      is_enabled?: boolean;
      public_key?: string | null;
      secret_key?: string | null;
      webhook_secret?: string | null;
      connected_date?: string | null;
      last_sync?: string | null;
      credential_mode?: "none" | "checkout" | "oauth";
      environment?: YocoEnvironment;
      reconnect_banner_dismissed_at?: string | null;
    };
    /**
     * For Checkout-API providers, having either key is enough to make
     * something work (the public key is informational). For OAuth providers,
     * the secret/public keys are optional fallbacks. Either way, surface
     * api_key_set so the existing mobile UI still lights up "Connected".
     */
    const hasAnyKey = Boolean(integ.public_key?.trim()) || Boolean(integ.secret_key?.trim());

    const credentialMode = await resolveProviderCredentialMode(providerId);
    const adminClient = getSupabaseAdmin();
    const { data: tokenRow } = await (adminClient.from("provider_yoco_oauth_tokens") as any)
      .select(
        "environment, scope, expires_at, refresh_expires_at, business_id, business_name, user_email, last_refresh_error"
      )
      .eq("provider_id", providerId)
      .eq("environment", credentialMode.environment)
      .maybeSingle();

    const oauth = tokenRow as
      | {
          environment?: string;
          scope?: string | null;
          expires_at?: string;
          refresh_expires_at?: string | null;
          business_id?: string | null;
          business_name?: string | null;
          user_email?: string | null;
          last_refresh_error?: string | null;
        }
      | null
      | undefined;

    return NextResponse.json({
      data: {
        is_enabled: integ.is_enabled || false,
        api_key_set: credentialMode.credentialMode !== "none" || hasAnyKey,
        webhook_configured: !!integ.webhook_secret,
        secret_key: integ.secret_key ? "***" : null,
        public_key: integ.public_key || null,
        webhook_secret: integ.webhook_secret ? "***" : null,
        connected_date: integ.connected_date,
        last_sync: integ.last_sync,
        subscription_required: !yocoAccess.enabled,
        credential_mode: credentialMode.credentialMode,
        environment: credentialMode.environment,
        oauth_connected: credentialMode.hasOauthToken,
        oauth_business_id: oauth?.business_id ?? null,
        oauth_business_name: oauth?.business_name ?? null,
        oauth_user_email: oauth?.user_email ?? null,
        oauth_expires_at: oauth?.expires_at ?? null,
        oauth_refresh_expires_at: oauth?.refresh_expires_at ?? null,
        oauth_scopes: oauth?.scope ? oauth.scope.split(/\s+/).filter(Boolean) : [],
        oauth_last_refresh_error: oauth?.last_refresh_error ?? null,
        oauth_v2_enabled: oauthV2Enabled,
        reconnect_banner_dismissed_at: integ.reconnect_banner_dismissed_at ?? null,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/provider/yoco/integration:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch integration",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/provider/yoco/integration
 *
 * Connect Yoco (upsert integration). Provider app sends api_key + secret_key.
 */
export async function POST(request: Request) {
  return PUT(request);
}

/**
 * PUT /api/provider/yoco/integration
 *
 * Update provider's Yoco integration settings
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["provider_owner"], request); // Only owners can update integration
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = updateIntegrationSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(auth.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "PROVIDER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Check subscription allows Yoco integration
    const yocoAccess = await checkYocoFeatureAccess(providerId, supabase);
    if (!yocoAccess.enabled) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Yoco integration requires a subscription upgrade. Please upgrade your plan to use Yoco payment devices.",
            code: "SUBSCRIPTION_REQUIRED",
          },
        },
        { status: 403 }
      );
    }

    // Resolve public key (backend uses public_key, app may send api_key)
    const publicKey =
      validationResult.data.public_key ?? validationResult.data.api_key ?? undefined;

    // For the Checkout API path we only strictly need the secret_key (Bearer).
    // The public key is informational. We keep `verifyYocoConfig` for callers
    // that pass both and want to be told if one is missing.
    if (validationResult.data.secret_key && publicKey === undefined) {
      // Single-key save is fine; nothing to validate here.
    } else if (validationResult.data.secret_key || publicKey) {
      const configCheck = verifyYocoConfig(validationResult.data.secret_key, publicKey);
      if (!configCheck.configured) {
        // Only enforce when the caller explicitly tried to set both fields.
        if (validationResult.data.secret_key !== undefined && publicKey !== undefined) {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: `Missing required keys: ${configCheck.missing.join(", ")}`,
                code: "INCOMPLETE_CONFIG",
              },
            },
            { status: 400 }
          );
        }
      }
    }

    // Look up current state so we can preserve credential_mode='oauth' if the
    // caller did not also pass an explicit value.
    const adminClient = getSupabaseAdmin();
    const { data: existing } = await (adminClient.from("provider_yoco_integrations") as any)
      .select("credential_mode, connected_date, secret_key, environment")
      .eq("provider_id", providerId)
      .maybeSingle();
    const existingRow = existing as {
      credential_mode?: "none" | "checkout" | "oauth";
      connected_date?: string | null;
      secret_key?: string | null;
      environment?: YocoEnvironment;
    } | null;

    // Prepare update data
    const updateData: Record<string, unknown> = {};
    if (validationResult.data.secret_key !== undefined) {
      updateData.secret_key = validationResult.data.secret_key;
      updateData.last_sync = new Date().toISOString();
    }
    if (publicKey !== undefined) {
      updateData.public_key = publicKey;
    }
    if (validationResult.data.webhook_secret !== undefined) {
      updateData.webhook_secret = validationResult.data.webhook_secret;
    }
    if (validationResult.data.environment) {
      updateData.environment = validationResult.data.environment;
    }

    const willHaveSecretKey =
      validationResult.data.secret_key !== undefined
        ? Boolean(validationResult.data.secret_key?.trim())
        : Boolean(existingRow?.secret_key?.trim());
    const targetEnvironment =
      validationResult.data.environment ?? existingRow?.environment ?? "live";
    const { data: existingToken } = await (adminClient.from("provider_yoco_oauth_tokens") as any)
      .select("provider_id")
      .eq("provider_id", providerId)
      .eq("environment", targetEnvironment)
      .maybeSingle();
    const hasOauthToken = Boolean(existingToken);

    // credential_mode resolution:
    //   - Keep 'oauth' only when a matching token exists. Older partial saves
    //     could leave the integration row in oauth mode after token cleanup.
    //   - Else 'checkout' if any secret key remains saved.
    //   - Else 'none'.
    const desiredMode: "none" | "checkout" | "oauth" =
      existingRow?.credential_mode === "oauth" && hasOauthToken
        ? "oauth"
        : willHaveSecretKey
          ? "checkout"
          : "none";
    updateData.credential_mode = desiredMode;

    // When connecting with keys, default to enabled if not explicitly set.
    const willEnable = validationResult.data.is_enabled ?? desiredMode !== "none";
    if (validationResult.data.is_enabled !== undefined) {
      updateData.is_enabled = validationResult.data.is_enabled;
    } else if (willEnable) {
      updateData.is_enabled = true;
    }
    if (updateData.is_enabled) {
      if (!existingRow || !existingRow.connected_date) {
        updateData.connected_date = new Date().toISOString();
      }
    }

    // Upsert integration
    const { data: integration, error: upsertError } = await (
      supabase.from("provider_yoco_integrations") as any
    )
      .upsert(
        {
          provider_id: providerId,
          ...updateData,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "provider_id",
        }
      )
      .select()
      .single();

    if (upsertError || !integration) {
      console.error("Error updating integration:", upsertError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update integration",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const integRow = integration as {
      is_enabled?: boolean;
      secret_key?: string | null;
      public_key?: string | null;
      webhook_secret?: string | null;
      connected_date?: string | null;
      last_sync?: string | null;
      credential_mode?: "none" | "checkout" | "oauth";
      environment?: YocoEnvironment;
    };
    return NextResponse.json({
      data: {
        is_enabled: integRow.is_enabled || false,
        secret_key: integRow.secret_key ? "***" : null,
        public_key: integRow.public_key || null,
        webhook_secret: integRow.webhook_secret ? "***" : null,
        connected_date: integRow.connected_date ?? null,
        last_sync: integRow.last_sync ?? null,
        credential_mode: integRow.credential_mode ?? desiredMode,
        environment: integRow.environment ?? "live",
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/provider/yoco/integration:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update integration",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/provider/yoco/integration
 *
 * Disconnect Yoco: disable integration and clear stored keys.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireRole(["provider_owner"], request);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(auth.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "PROVIDER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const { error } = await (supabase.from("provider_yoco_integrations") as any)
      .update({
        is_enabled: false,
        secret_key: null,
        public_key: null,
        webhook_secret: null,
        credential_mode: "none",
        connected_date: null,
        last_sync: null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_id", providerId);

    // Also wipe any OAuth tokens so the next "Connect" starts fresh. Use the
    // service-role client because the OAuth token table's RLS is strict.
    try {
      const admin = getSupabaseAdmin();
      await (admin.from("provider_yoco_oauth_tokens") as any)
        .delete()
        .eq("provider_id", providerId);
    } catch (cleanupErr) {
      console.warn("Could not wipe OAuth tokens on disconnect:", cleanupErr);
    }

    if (error) {
      console.error("Error disconnecting Yoco:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to disconnect",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { disconnected: true },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/provider/yoco/integration:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to disconnect",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
