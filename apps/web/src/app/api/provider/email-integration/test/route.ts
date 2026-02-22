import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const testSchema = z.object({
  test_email: z.string().email("Invalid email address"),
});

/**
 * POST /api/provider/email-integration/test
 * Test the email integration by sending a test email
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validated = testSchema.parse(body);
    const { test_email } = validated;

    // For superadmin, allow testing any provider's integration
    let providerId: string | null = null;
    if (user.role === "superadmin") {
      // Get provider_id from query param if provided
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
      .from("provider_email_integrations")
      .select("*")
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !integration) {
      return errorResponse("Email integration not configured", "NOT_FOUND", 404);
    }

    if (!integration.is_enabled) {
      return errorResponse("Email integration is not enabled", "INTEGRATION_DISABLED", 400);
    }

    // Import unified marketing service
    const { sendMessage } = await import("@/lib/marketing/unified-service");

    // Send test email
    const result = await sendMessage(
      providerId,
      "email",
      {
        to: test_email,
        subject: "Test Email from Beautonomi",
        content: "<h1>Test Email</h1><p>This is a test email from your Beautonomi email integration.</p><p>If you received this, your integration is working correctly!</p>",
        from: integration.from_email,
        fromName: integration.from_name,
      }
    );

    // Update test status
    await supabase
      .from("provider_email_integrations")
      .update({
        test_status: result.success ? "success" : "failed",
        test_error: result.error || null,
        last_tested_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    if (result.success) {
      return successResponse({ message: "Test email sent successfully" });
    } else {
      return errorResponse(result.error || "Failed to send test email", "TEST_FAILED", 400);
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
    console.error("Error testing email integration:", error);
    return handleApiError(error, "Failed to test email integration");
  }
}
