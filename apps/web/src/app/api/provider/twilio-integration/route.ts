import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import { checkMarketingFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const putSchema = z.object({
  account_sid: z.string().min(1, "Account SID is required"),
  auth_token: z.string().min(1, "Auth token is required"),
  sms_from_number: z.string().optional(),
  whatsapp_from_number: z.string().optional(),
  is_sms_enabled: z.boolean().optional().default(false),
  is_whatsapp_enabled: z.boolean().optional().default(false),
});

/**
 * GET /api/provider/twilio-integration
 * Get provider's Twilio integration settings
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
      .from("provider_twilio_integrations")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    // Mask sensitive data in response
    if (integration) {
      integration.account_sid = integration.account_sid ? "••••••••" : "";
      integration.auth_token = integration.auth_token ? "••••••••" : "";
    }

    return successResponse(integration || null);
  } catch (error: any) {
    console.error("Error fetching Twilio integration:", error);
    return handleApiError(error, "Failed to fetch Twilio integration");
  }
}

/**
 * PUT /api/provider/twilio-integration
 * Create or update provider's Twilio integration
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
          "Marketing integrations require a subscription upgrade. Please upgrade your plan to use custom SMS/WhatsApp integrations.",
          "SUBSCRIPTION_REQUIRED",
          403
        );
      }
    }

    // Validate input
    const validated = putSchema.parse(body);
    const { 
      account_sid, 
      auth_token, 
      sms_from_number, 
      whatsapp_from_number,
      is_sms_enabled,
      is_whatsapp_enabled 
    } = validated;

    // Validate Twilio Account SID format (starts with AC)
    if (!account_sid.startsWith("AC")) {
      return errorResponse("Invalid Twilio Account SID format. Should start with 'AC'", "VALIDATION_ERROR", 400);
    }

    // Validate phone number formats if provided
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (sms_from_number) {
      const cleanNumber = sms_from_number.replace(/\D/g, "");
      if (!phoneRegex.test(cleanNumber)) {
        return errorResponse("Invalid SMS from number format. Use E.164 format (e.g., +1234567890)", "VALIDATION_ERROR", 400);
      }
    }

    if (whatsapp_from_number) {
      const cleanNumber = whatsapp_from_number.replace("whatsapp:", "").replace(/\D/g, "");
      if (!phoneRegex.test(cleanNumber)) {
        return errorResponse("Invalid WhatsApp from number format. Use E.164 format (e.g., +1234567890)", "VALIDATION_ERROR", 400);
      }
    }

    // Check if integration exists
    const { data: existing } = await supabase
      .from("provider_twilio_integrations")
      .select("id, account_sid, auth_token, connected_date")
      .eq("provider_id", providerId)
      .maybeSingle();

    const integrationData: any = {
      provider_id: providerId,
      is_sms_enabled: is_sms_enabled !== undefined ? is_sms_enabled : false,
      is_whatsapp_enabled: is_whatsapp_enabled !== undefined ? is_whatsapp_enabled : false,
    };

    // Only update credentials if they're not masked
    if (account_sid && account_sid !== "••••••••") {
      integrationData.account_sid = account_sid;
    } else if (existing?.account_sid) {
      // Keep existing if masked value provided
      integrationData.account_sid = existing.account_sid;
    } else {
      return errorResponse("Account SID is required", "VALIDATION_ERROR", 400);
    }

    if (auth_token && auth_token !== "••••••••") {
      integrationData.auth_token = auth_token;
    } else if (existing?.auth_token) {
      // Keep existing if masked value provided
      integrationData.auth_token = existing.auth_token;
    } else {
      return errorResponse("Auth token is required", "VALIDATION_ERROR", 400);
    }

    if (sms_from_number) {
      integrationData.sms_from_number = sms_from_number;
    }

    if (whatsapp_from_number) {
      // Ensure WhatsApp number is in correct format
      const formatted = whatsapp_from_number.startsWith("whatsapp:") 
        ? whatsapp_from_number 
        : `whatsapp:${whatsapp_from_number}`;
      integrationData.whatsapp_from_number = formatted;
    }

    if ((is_sms_enabled || is_whatsapp_enabled) && !existing?.connected_date) {
      integrationData.connected_date = new Date().toISOString();
    }

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("provider_twilio_integrations")
        .update(integrationData)
        .eq("id", existing.id)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from("provider_twilio_integrations")
        .insert(integrationData)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    }

    // Mask sensitive data in response
    if (result) {
      result.account_sid = result.account_sid ? "••••••••" : "";
      result.auth_token = result.auth_token ? "••••••••" : "";
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
    console.error("Error saving Twilio integration:", error);
    return handleApiError(error, "Failed to save Twilio integration");
  }
}

