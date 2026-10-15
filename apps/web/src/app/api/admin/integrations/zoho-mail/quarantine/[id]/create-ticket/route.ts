import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { createTicketFromQuarantineMail } from "@/lib/support/create-ticket-from-quarantine-mail";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, _request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const result = await createTicketFromQuarantineMail(supabase, id);
    return successResponse(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "create_failed";
    if (msg === "mail_not_found") {
      return errorResponse("Mail row not found", "NOT_FOUND", 404);
    }
    return handleApiError(error, "Failed to create ticket from quarantine");
  }
}
