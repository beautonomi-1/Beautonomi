import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import { checkMarketingFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const putSchema = z.object({
  provider_name: z.enum(["sendgrid", "mailchimp"]),
  api_key: z.string().min(1, "API key is required"),
  api_secret: z.string().optional(),
  from_email: z.string().email("Invalid email format"),
  from_name: z.string().optional().default("Beautonomi"),
  is_enabled: z.boolean().optional().default(false),
});

/**
 * GET /api/provider/email-integration
 * Get provider's email integration settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    // For superadmin, allow viewing any provider's integration
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      const { searchParams } = new URL(request.url);
      const providerIdParam = searchParams.get("provider_id");
      if (providerIdParam) {
        providerId = providerIdParam;
      } else {
        return errorResponse("provider_id is required for superadmin", "VALIDATION_ERROR", 400);
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    const { data: integration, error } = await supabase
      .from("provider_email_integrations")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    // Mask sensitive data in response
    if (integration) {
      integration.api_key = integration.api_key ? "••••••••" : "";
      if (integration.api_secret) {
        integration.api_secret = "••••••••";
      }
    }

    // Return empty object if no integration exists yet
    return successResponse(integration || null);
  } catch (error: any) {
    console.error("Error fetching email integration:", error);
    return handleApiError(error, "Failed to fetch email integration");
  }
}

/**
 * PUT /api/provider/email-integration
 * Create or update provider's email integration
 */
export async function PUT(request: NextRequest) {
  try {
    // Only provider owners and superadmins can update integrations
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // For superadmin, allow updating any provider's integration
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      const { searchParams } = new URL(request.url);
      const providerIdParam = searchParams.get("provider_id");
      if (providerIdParam) {
        providerId = providerIdParam;
      } else {
        return errorResponse("provider_id is required for superadmin", "VALIDATION_ERROR", 400);
      }
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Check subscription allows custom integrations (skip for superadmin)
    if (user.role !== "superadmin") {
      const marketingAccess = await checkMarketingFeatureAccess(providerId);
      if (!marketingAccess.customIntegrations) {
        return errorResponse(
          "Marketing integrations require a subscription upgrade. Please upgrade your plan to use custom email integrations.",
          "SUBSCRIPTION_REQUIRED",
          403
        );
      }
    }

    // Validate input
    const validated = putSchema.parse(body);
    const { provider_name, api_key, api_secret, from_email, from_name, is_enabled } = validated;

    // Validate SendGrid API key format (starts with SG.)
    if (provider_name === "sendgrid" && !api_key.startsWith("SG.")) {
      return errorResponse("Invalid SendGrid API key format. Should start with 'SG.'", "VALIDATION_ERROR", 400);
    }

    // Validate Mailchimp API key format (contains datacenter like -us1)
    if (provider_name === "mailchimp" && !api_key.includes("-")) {
      return errorResponse("Invalid Mailchimp API key format. Should include datacenter (e.g., xxxxx-us1)", "VALIDATION_ERROR", 400);
    }

    // Check if integration exists
    const { data: existing } = await supabase
      .from("provider_email_integrations")
      .select("id, api_key, api_secret, connected_date")
      .eq("provider_id", providerId)
      .maybeSingle();

    // If API key is masked (••••••••), keep the existing value
    const integrationData: any = {
      provider_id: providerId,
      provider_name,
      from_email,
      from_name: from_name || "Beautonomi",
      is_enabled: is_enabled !== undefined ? is_enabled : false,
    };

    // Only update API key if it's not masked
    if (api_key && api_key !== "••••••••") {
      integrationData.api_key = api_key;
    } else if (existing?.api_key) {
      // Keep existing API key if masked value provided
      integrationData.api_key = existing.api_key;
    } else {
      return errorResponse("API key is required", "VALIDATION_ERROR", 400);
    }

    // Only update API secret if provided and not masked
    if (api_secret && api_secret !== "••••••••") {
      integrationData.api_secret = api_secret;
    } else if (existing?.api_secret && api_secret === "••••••••") {
      // Keep existing API secret if masked value provided
      integrationData.api_secret = existing.api_secret;
    }

    if (is_enabled && !existing?.connected_date) {
      integrationData.connected_date = new Date().toISOString();
    }

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("provider_email_integrations")
        .update(integrationData)
        .eq("id", existing.id)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from("provider_email_integrations")
        .insert(integrationData)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    }

    // Mask sensitive data in response
    if (result) {
      result.api_key = result.api_key ? "••••••••" : "";
      if (result.api_secret) {
        result.api_secret = "••••••••";
      }
    }

    return successResponse(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        error.issues
      );
    }
    console.error("Error saving email integration:", error);
    return handleApiError(error, "Failed to save email integration");
  }
}

