import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { validateWhatsAppApprovalReadiness } from "@/lib/whatsapp/approval-readiness";
import type { NotificationTemplateWhatsAppRow } from "@/lib/whatsapp/content-templates";

const bodySchema = z.object({
  key: z.string().optional(),
  body: z.string().optional(),
  whatsapp_body: z.string().optional(),
  whatsapp_category: z.enum(["utility", "authentication", "marketing"]).optional(),
  whatsapp_approval_name: z.string().optional(),
  whatsapp_content_variables: z
    .array(z.object({ ordinal: z.number(), var: z.string(), sample: z.string().optional() }))
    .optional(),
  whatsapp_content_type: z.string().optional(),
});

/**
 * POST /api/admin/notification-templates/whatsapp/validate-readiness
 * Live approval-readiness check for the admin SPA editor.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const body = bodySchema.parse(await request.json());

    const template = {
      id: "draft",
      key: body.key ?? "draft_template",
      body: body.body ?? body.whatsapp_body ?? "",
      whatsapp_body: body.whatsapp_body ?? body.body ?? "",
      whatsapp_category: body.whatsapp_category ?? "utility",
      whatsapp_approval_name: body.whatsapp_approval_name ?? null,
      whatsapp_content_variables: body.whatsapp_content_variables ?? [],
      whatsapp_content_type: body.whatsapp_content_type ?? "twilio/text",
    } as NotificationTemplateWhatsAppRow;

    const result = validateWhatsAppApprovalReadiness(template);
    const score = Math.max(0, 100 - result.fatal.length * 25 - result.warnings.length * 5);

    return successResponse({ ...result, score });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to validate readiness");
  }
}
