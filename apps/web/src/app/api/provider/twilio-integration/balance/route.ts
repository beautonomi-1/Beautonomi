import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/twilio-integration/balance
 * 
 * Get Twilio account balance (remaining SMS credits/messages)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get Twilio integration
    const { data: integration, error: integrationError } = await supabase
      .from("provider_twilio_integrations")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (integrationError) {
      throw integrationError;
    }

    if (!integration || !integration.account_sid || !integration.auth_token) {
      return successResponse({
        balance: null,
        currency: null,
        hasIntegration: false,
        message: "Twilio integration not configured",
      });
    }

    // Fetch balance from Twilio API
    try {
      const accountSid = integration.account_sid;
      const authToken = integration.auth_token;
      
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
        {
          method: "GET",
          headers: {
            "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Twilio API error: ${response.status}`);
      }

      const accountData = await response.json();
      
      // Twilio returns balance as a string (e.g., "10.50")
      const balance = parseFloat(accountData.balance || "0");
      const currency = accountData.currency || "USD";

      // Estimate messages remaining (assuming average SMS cost)
      // This is approximate - actual cost varies by country/carrier
      const estimatedCostPerSMS = 0.0075; // ~$0.0075 per SMS (varies by region)
      const estimatedMessagesRemaining = Math.floor(balance / estimatedCostPerSMS);

      return successResponse({
        balance,
        currency,
        estimatedMessagesRemaining,
        hasIntegration: true,
        accountStatus: accountData.status,
      });
    } catch (twilioError: any) {
      // If Twilio API fails, return error but don't fail the request
      console.error("Error fetching Twilio balance:", twilioError);
      return successResponse({
        balance: null,
        currency: null,
        hasIntegration: true,
        error: twilioError.message || "Failed to fetch balance from Twilio",
        message: "Unable to fetch balance. Please check your Twilio credentials.",
      });
    }
  } catch (error) {
    return handleApiError(error, "Failed to fetch Twilio balance");
  }
}
