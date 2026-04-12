import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireSuperadmin,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["view_map", "open_booking", "export", "toggle_filter"]),
  booking_id: z.string().uuid().optional().nullable(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/admin/gods-eye/audit
 * Superadmin only. Insert an audit log entry (who viewed map, opened booking, etc.).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSuperadmin(request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const parse = bodySchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(
        parse.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const { error } = await supabase.from("gods_eye_audit_log").insert({
      admin_user_id: user.id,
      action: parse.data.action,
      booking_id: parse.data.booking_id ?? null,
      meta: parse.data.meta ?? {},
    });

    if (error) throw error;

    return successResponse({ logged: true });
  } catch (error) {
    return handleApiError(error, "Failed to log audit");
  }
}
