import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkYocoFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";
import { verifyYocoConfig } from "@/lib/payments/yoco";

const updateIntegrationSchema = z.object({
  is_enabled: z.boolean().optional(),
  secret_key: z.string().optional(),
  public_key: z.string().optional(),
  webhook_secret: z.string().optional().nullable(),
});

/**
 * GET /api/provider/yoco/integration
 * 
 * Get provider's Yoco integration settings
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(auth.user.id, supabase);
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
    const yocoAccess = await checkYocoFeatureAccess(providerId);

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

    // Return default if not found
    if (!integration) {
      return NextResponse.json({
        data: {
          is_enabled: false,
          secret_key: null,
          public_key: null,
          webhook_secret: null,
          connected_date: null,
          last_sync: null,
        },
        error: null,
      });
    }

    return NextResponse.json({
      data: {
        is_enabled: (integration as any).is_enabled || false,
        secret_key: (integration as any).secret_key ? "***" : null, // Don't expose full key
        public_key: (integration as any).public_key || null,
        webhook_secret: (integration as any).webhook_secret ? "***" : null,
        connected_date: (integration as any).connected_date,
        last_sync: (integration as any).last_sync,
        subscription_required: !yocoAccess.enabled,
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
 * PUT /api/provider/yoco/integration
 * 
 * Update provider's Yoco integration settings
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireRole(["provider_owner"]); // Only owners can update integration
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
    const providerId = await getProviderIdForUser(auth.user.id);
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
    const yocoAccess = await checkYocoFeatureAccess(providerId);
    if (!yocoAccess.enabled) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Yoco integration requires a subscription upgrade. Please upgrade your plan to use Yoco payment devices.",
            code: "SUBSCRIPTION_REQUIRED",
          },
        },
        { status: 403 }
      );
    }

    // If keys are being updated, verify configuration
    if (validationResult.data.secret_key || validationResult.data.public_key) {
      const configCheck = verifyYocoConfig(
        validationResult.data.secret_key,
        validationResult.data.public_key
      );
      if (!configCheck.configured) {
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

    // Prepare update data
    const updateData: any = {};
    if (validationResult.data.is_enabled !== undefined) {
      updateData.is_enabled = validationResult.data.is_enabled;
    }
    if (validationResult.data.secret_key !== undefined) {
      updateData.secret_key = validationResult.data.secret_key;
      updateData.last_sync = new Date().toISOString();
    }
    if (validationResult.data.public_key !== undefined) {
      updateData.public_key = validationResult.data.public_key;
    }
    if (validationResult.data.webhook_secret !== undefined) {
      updateData.webhook_secret = validationResult.data.webhook_secret;
    }

    // If enabling for the first time, set connected_date
    if (validationResult.data.is_enabled) {
      const { data: existing } = await supabase
        .from("provider_yoco_integrations")
        .select("connected_date")
        .eq("provider_id", providerId)
        .single();

      if (!existing || !(existing as any).connected_date) {
        updateData.connected_date = new Date().toISOString();
      }
    }

    // Upsert integration
    const { data: integration, error: upsertError } = await (supabase
      .from("provider_yoco_integrations") as any)
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

    return NextResponse.json({
      data: {
        is_enabled: (integration as any).is_enabled || false,
        secret_key: (integration as any).secret_key ? "***" : null,
        public_key: (integration as any).public_key || null,
        webhook_secret: (integration as any).webhook_secret ? "***" : null,
        connected_date: (integration as any).connected_date,
        last_sync: (integration as any).last_sync,
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
