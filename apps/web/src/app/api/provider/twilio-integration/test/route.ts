import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const testSchema = z.object({
  test_phone: z.string().min(1, "Phone number is required"),
  channel: z.enum(["sms", "whatsapp"] as const, "Channel must be 'sms' or 'whatsapp'"),
});

/**
 * POST /api/provider/twilio-integration/test
 * Test the Twilio integration by sending a test SMS or WhatsApp
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validated = testSchema.parse(body);
    const { test_phone, channel } = validated;

    // Validate phone number format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleanPhone = test_phone.replace(/\D/g, "");
    if (!phoneRegex.test(cleanPhone)) {
      return errorResponse("Invalid phone number format. Use E.164 format (e.g., +1234567890)", "VALIDATION_ERROR", 400);
    }

    // For superadmin, allow testing any provider's integration
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

    // Get integration
    const { data: integration, error: fetchError } = await supabase
      .from("provider_twilio_integrations")
      .select("*")
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !integration) {
      return errorResponse("Twilio integration not configured", "NOT_FOUND", 404);
    }

    if (channel === "sms" && (!integration.is_sms_enabled || !integration.sms_from_number)) {
      return errorResponse("SMS is not enabled or configured", "VALIDATION_ERROR", 400);
    }

    if (channel === "whatsapp" && (!integration.is_whatsapp_enabled || !integration.whatsapp_from_number)) {
      return errorResponse("WhatsApp is not enabled or configured", "VALIDATION_ERROR", 400);
    }

    // Import unified marketing service
    const { sendMessage } = await import("@/lib/marketing/unified-service");

    // Send test message
    const result = await sendMessage(
      providerId,
      channel,
      {
        to: test_phone,
        content: `Test ${channel.toUpperCase()} from Beautonomi. If you received this, your integration is working correctly!`,
      }
    );

    // Update test status
    const updateData: any = {
      last_tested_at: new Date().toISOString(),
    };

    if (channel === "sms") {
      updateData.sms_test_status = result.success ? "success" : "failed";
      updateData.sms_test_error = result.error || null;
    } else {
      updateData.whatsapp_test_status = result.success ? "success" : "failed";
      updateData.whatsapp_test_error = result.error || null;
    }

    await supabase
      .from("provider_twilio_integrations")
      .update(updateData)
      .eq("id", integration.id);

    if (result.success) {
      return successResponse({ message: `Test ${channel.toUpperCase()} sent successfully` });
    } else {
      return errorResponse(result.error || `Failed to send test ${channel}`, "TEST_FAILED", 400);
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        error.issues
      );
    }
    console.error("Error testing Twilio integration:", error);
    return handleApiError(error, "Failed to test Twilio integration");
  }
}
