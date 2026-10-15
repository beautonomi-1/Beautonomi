import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { testZohoMailboxConnection } from "@/lib/integrations/zoho-mail-test-connection";

const schema = z.object({
  connection_id: z.string().uuid(),
  mailbox_address: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const body = schema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const result = await testZohoMailboxConnection(supabase, {
      connectionId: body.connection_id,
      mailboxAddress: body.mailbox_address,
    });
    if (!result.ok) {
      return errorResponse(result.error ?? "Test failed", "ZOHO_TEST", 400);
    }
    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Zoho connection test failed");
  }
}
