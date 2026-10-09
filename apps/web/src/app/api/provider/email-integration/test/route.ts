import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

export const emailIntegrationTestBodySchema = z
  .object({
    ping: z.literal(true).optional(),
    test_email: z.string().email("Invalid email address").optional(),
  })
  .superRefine((data, ctx) => {
    const hasPing = data.ping === true;
    const hasEmail = Boolean(data.test_email);
    if (hasPing === hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either ping: true or test_email, not both",
      });
    }
  });

/**
 * POST /api/provider/email-integration/test
 * Ping Mailchimp Transactional credentials or send a test email
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validated = emailIntegrationTestBodySchema.parse(body);
    const isPing = validated.ping === true;
    const testEmail = validated.test_email;

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

    const { data: integration, error: fetchError } = await supabase
      .from("provider_email_integrations")
      .select("*")
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !integration) {
      return errorResponse("Email integration not configured", "NOT_FOUND", 404);
    }

    if (isPing) {
      if (integration.provider_name !== "mailchimp") {
        return errorResponse(
          "Connection ping is only available for Mailchimp Transactional. Send a test email instead.",
          "VALIDATION_ERROR",
          400,
        );
      }
      const apiKey = integration.api_key || integration.api_secret;
      if (!apiKey) {
        return errorResponse("Mailchimp Transactional API key not configured", "NOT_FOUND", 404);
      }
      const { pingMailchimpTransactional } = await import("@/lib/marketing/send-via-mailchimp");
      const ping = await pingMailchimpTransactional(apiKey);

      const testError = ping.ok === false ? ping.error : null;
      await supabase
        .from("provider_email_integrations")
        .update({
          test_status: ping.ok ? "success" : "failed",
          test_error: testError,
          last_tested_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      if (ping.ok === false) {
        return errorResponse(ping.error, "TEST_FAILED", 400);
      }
      return successResponse({ message: "Mailchimp Transactional connection successful" });
    }

    if (!integration.is_enabled) {
      return errorResponse("Email integration is not enabled", "INTEGRATION_DISABLED", 400);
    }

    const { sendMessage } = await import("@/lib/marketing/unified-service");

    const result = await sendMessage(providerId, "email", {
      to: testEmail!,
      subject: "Test Email from Beautonomi",
      content:
        "<h1>Test Email</h1><p>This is a test email from your Beautonomi email integration.</p><p>If you received this, your integration is working correctly!</p>",
      from: integration.from_email,
      fromName: integration.from_name,
      supabase,
    });

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
    }
    return errorResponse(result.error || "Failed to send test email", "TEST_FAILED", 400);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, error.issues);
    }
    console.error("Error testing email integration:", error);
    return handleApiError(error, "Failed to test email integration");
  }
}
