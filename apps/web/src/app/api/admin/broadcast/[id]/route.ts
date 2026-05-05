import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * GET /api/admin/broadcast/[id]
 * Single broadcast log row (compose duplicate-from-history).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const rawParams = await params;
    const parsed = paramsSchema.safeParse(rawParams);
    if (!parsed.success) {
      return errorResponse("Invalid broadcast id", "VALIDATION_ERROR", 400);
    }
    const { id } = parsed.data;

    const supabase = await getSupabaseServer(request);
    const { data, error } = await supabase.from("broadcast_logs").select("*").eq("id", id).maybeSingle();

    if (error) return handleApiError(error, "Failed to fetch broadcast");
    if (!data) return errorResponse("Broadcast not found", "NOT_FOUND", 404);

    return successResponse({ broadcast: data });
  } catch (e) {
    return handleApiError(e, "Failed to fetch broadcast");
  }
}
