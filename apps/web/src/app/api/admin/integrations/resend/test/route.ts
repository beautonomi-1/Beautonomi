import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { sendResendEmail } from "@/lib/integrations/resend";

const testSchema = z.object({
  to: z.string().email("Valid recipient email is required"),
});

/**
 * POST /api/admin/integrations/resend/test
 * Send a one-off test email via configured Resend credentials.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    if (!user?.email) {
      return errorResponse("Authenticated admin email required", "VALIDATION_ERROR", 400);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    await sendResendEmail({
      supabase,
      tenantId,
      to: parsed.data.to,
      subject: "Beautonomi — Resend test",
      text: "This is a test email from Beautonomi admin. Resend is configured correctly.",
      html: "<p>This is a <strong>test email</strong> from Beautonomi admin. Resend is configured correctly.</p>",
      headers: { "X-Beautonomi-Test": "resend_integration" },
    });

    return successResponse({ message: `Test email sent to ${parsed.data.to}` });
  } catch (error) {
    return handleApiError(error, "Failed to send Resend test email");
  }
}
