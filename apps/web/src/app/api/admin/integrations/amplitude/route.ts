import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { revalidateTag } from "next/cache";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_API_KEY_CREATED, EVENT_API_KEY_UPDATED } from "@/lib/analytics/amplitude/types";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const { searchParams } = new URL(request.url);
    const environment = searchParams.get("environment") || "production";

    const { data, error } = await supabase
      .from("amplitude_integration_config")
      .select("*")
      .eq("environment", environment)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return successResponse(null);
    }

    return successResponse(data);
  } catch (error: any) {
    return handleApiError(error, "Failed to fetch Amplitude configuration");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const body = await request.json();
    const {
      api_key_public,
      api_key_server,
      ingestion_endpoint,
      environment = "production",
      enabled_client_portal,
      enabled_provider_portal,
      enabled_admin_portal,
      guides_enabled,
      surveys_enabled,
      sampling_rate,
      debug_mode,
    } = body;

    // Validation
    if (!api_key_public) {
      return errorResponse("Public API key is required", "VALIDATION_ERROR", 400);
    }

    if (environment && !["production", "staging", "development"].includes(environment)) {
      return errorResponse("Environment must be production, staging, or development", "VALIDATION_ERROR", 400);
    }

    if (sampling_rate !== undefined && (sampling_rate < 0 || sampling_rate > 1)) {
      return errorResponse("Sampling rate must be between 0 and 1", "VALIDATION_ERROR", 400);
    }

    // Check if config exists for this environment
    const { data: existing } = await supabase
      .from("amplitude_integration_config")
      .select("id")
      .eq("environment", environment)
      .maybeSingle();

    let result;
    if (existing) {
      // Update existing config
      const updateData: any = {
        api_key_public,
        ingestion_endpoint: ingestion_endpoint || "https://api2.amplitude.com/2/httpapi",
        environment,
        updated_by: user.id,
      };

      // Only update optional fields if provided
      if (api_key_server !== undefined) updateData.api_key_server = api_key_server;
      if (enabled_client_portal !== undefined) updateData.enabled_client_portal = enabled_client_portal;
      if (enabled_provider_portal !== undefined) updateData.enabled_provider_portal = enabled_provider_portal;
      if (enabled_admin_portal !== undefined) updateData.enabled_admin_portal = enabled_admin_portal;
      if (guides_enabled !== undefined) updateData.guides_enabled = guides_enabled;
      if (surveys_enabled !== undefined) updateData.surveys_enabled = surveys_enabled;
      if (sampling_rate !== undefined) updateData.sampling_rate = sampling_rate;
      if (debug_mode !== undefined) updateData.debug_mode = debug_mode;

      const { data, error } = await supabase
        .from("amplitude_integration_config")
        .update(updateData)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new config
      const { data, error } = await supabase
        .from("amplitude_integration_config")
        .insert({
          api_key_public,
          api_key_server: api_key_server || null,
          ingestion_endpoint: ingestion_endpoint || "https://api2.amplitude.com/2/httpapi",
          environment,
          enabled_client_portal: enabled_client_portal ?? true,
          enabled_provider_portal: enabled_provider_portal ?? true,
          enabled_admin_portal: enabled_admin_portal ?? true,
          guides_enabled: guides_enabled ?? false,
          surveys_enabled: surveys_enabled ?? false,
          sampling_rate: sampling_rate ?? 1.0,
          debug_mode: debug_mode ?? false,
          created_by: user.id,
          updated_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Write audit log
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "superadmin",
      action: existing ? "admin.amplitude_config.update" : "admin.amplitude_config.create",
      entity_type: "amplitude_integration_config",
      entity_id: result.id,
      metadata: {
        environment,
        enabled_client_portal: result.enabled_client_portal,
        enabled_provider_portal: result.enabled_provider_portal,
        enabled_admin_portal: result.enabled_admin_portal,
        guides_enabled: result.guides_enabled,
        surveys_enabled: result.surveys_enabled,
      },
    });

    // Track Amplitude event
    try {
      await trackServer(
        existing ? EVENT_API_KEY_UPDATED : EVENT_API_KEY_CREATED,
        {
          portal: "admin",
          api_key_id: result.id,
          key_name: "amplitude_integration_config",
          environment,
        },
        user.id
      );
    } catch (amplitudeError) {
      console.error("[Amplitude] Failed to track config update:", amplitudeError);
    }

    // Revalidate cache for public config endpoint
    revalidateTag("amplitude-config", "default");

    return successResponse(result);
  } catch (error: any) {
    return handleApiError(error, "Failed to update Amplitude configuration");
  }
}
