import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const mapboxConfigSchema = z.object({
  // access_token is a secret and is stored in platform_secrets; only update when provided
  access_token: z.string().optional().nullable(),
  // public token; optional on update (leave blank to keep current); required when creating new config
  public_access_token: z.string().optional().nullable(),
  style_url: z.string().url().optional().nullable(),
  is_enabled: z.boolean().default(true),
});

function isMaskedOrEmptyToken(value: string | null | undefined): boolean {
  if (!value || value === "***") return true;
  if (value.length <= 12 || value.endsWith("...")) return true;
  return false;
}

/**
 * GET /api/admin/mapbox/config
 * 
 * Get Mapbox configuration
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    const { data: config, error } = await supabase
      .from("mapbox_config")
      .select("*")
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found, which is okay
      console.error("Error fetching Mapbox config:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch Mapbox configuration",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Response contains only non-secret config; secret token lives in platform_secrets
    if (config) {
      const maskedConfig = {
        ...(config as Record<string, unknown>),
        public_access_token: (config as any).public_access_token
          ? `${(config as any).public_access_token.substring(0, 8)}...`
          : null,
        access_token: "***",
      };
      return NextResponse.json({ data: maskedConfig, error: null });
    }

    return NextResponse.json({
      data: null,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/mapbox/config:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch Mapbox configuration",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/mapbox/config
 * 
 * Update Mapbox configuration
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = mapboxConfigSchema.safeParse(body);
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

    const admin = getSupabaseAdmin();

    // If secret access_token provided (and not placeholder), store in platform_secrets
    const newAccessToken = validationResult.data.access_token?.trim();
    if (newAccessToken && newAccessToken !== "***") {
      const { data: existingSecrets } = await (admin.from("platform_secrets") as any).select("id").limit(1).maybeSingle();
      if (existingSecrets?.id) {
        await (admin.from("platform_secrets") as any)
          .update({ mapbox_access_token: newAccessToken, updated_at: new Date().toISOString() })
          .eq("id", existingSecrets.id);
      } else {
        await (admin.from("platform_secrets") as any).insert({ mapbox_access_token: newAccessToken });
      }
    }

    // Resolve effective public token: new value if provided and not masked, else existing from DB
    const { data: existingConfig } = await supabase.from("mapbox_config").select("id, public_access_token").single();
    const existingPublicToken = (existingConfig as any)?.public_access_token as string | null | undefined;
    const sentPublicToken = validationResult.data.public_access_token?.trim();
    const useNewPublicToken = sentPublicToken && !isMaskedOrEmptyToken(sentPublicToken);
    const effectivePublicToken = useNewPublicToken ? sentPublicToken : (existingPublicToken || null);

    if (!existingConfig && !effectivePublicToken) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Public access token is required when creating Mapbox configuration",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    let config: any;
    if (existingConfig) {
      const { data, error } = await (supabase
        .from("mapbox_config") as any)
        .update({
          ...(effectivePublicToken != null && { public_access_token: effectivePublicToken }),
          style_url: validationResult.data.style_url ?? null,
          is_enabled: validationResult.data.is_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existingConfig as any).id)
        .select()
        .single();

      if (error) {
        console.error("Error updating Mapbox config:", error);
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Failed to update Mapbox configuration",
              code: "UPDATE_ERROR",
            },
          },
          { status: 500 }
        );
      }
      config = data;
    } else {
      const { data, error } = await (supabase
        .from("mapbox_config") as any)
        .insert({
          public_access_token: effectivePublicToken!,
          style_url: validationResult.data.style_url || null,
          is_enabled: validationResult.data.is_enabled,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating Mapbox config:", error);
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Failed to create Mapbox configuration",
              code: "CREATE_ERROR",
            },
          },
          { status: 500 }
        );
      }
      config = data;
    }

    // Sync to platform_settings so web, customer, and provider apps get same config via third-party-config
    const publicTokenForClients = effectivePublicToken ?? (config?.public_access_token as string) ?? "";
    try {
      const { data: psRow } = await (admin.from("platform_settings") as any).select("id, settings").single();
      if (psRow?.settings) {
        const settings = { ...(psRow.settings as Record<string, unknown>) };
        const mapbox = (settings.mapbox as Record<string, unknown>) || {};
        settings.mapbox = {
          ...mapbox,
          public_token: (publicTokenForClients || (mapbox.public_token as string)) ?? "",
          enabled: validationResult.data.is_enabled,
        };
        await (admin.from("platform_settings") as any)
          .update({ settings, updated_at: new Date().toISOString() })
          .eq("id", psRow.id);
      }
    } catch (syncErr) {
      console.warn("Mapbox config sync to platform_settings failed (non-blocking):", syncErr);
    }
    revalidateTag("platform-settings", "default");

    // Mask token in response
    const maskedConfig = {
      ...config,
      access_token: "***",
      public_access_token: config.public_access_token
        ? `${config.public_access_token.substring(0, 8)}...`
        : null,
    };

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.mapbox.config.update",
      entity_type: "mapbox_config",
      entity_id: (config as any)?.id || null,
      metadata: {
        is_enabled: validationResult.data.is_enabled,
        style_url: validationResult.data.style_url || null,
        public_access_token_set: !!validationResult.data.public_access_token,
        access_token_set: !!validationResult.data.access_token,
      },
    });

    return NextResponse.json({
      data: maskedConfig,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/mapbox/config:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update Mapbox configuration",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
