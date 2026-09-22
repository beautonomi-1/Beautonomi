import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireAdminSection, unauthorizedResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["pending", "contacted", "approved", "cancelled"]).optional(),
  notes: z.string().optional(),
});

/**
 * PATCH /api/admin/city-waitlist/[id]
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { id } = await context.params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

    const { data: row, error } = await supabase
      .from("city_waitlist")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "city_waitlist.update",
      entity_type: "city_waitlist",
      entity_id: id,
      metadata: { status: parsed.data.status, notes: parsed.data.notes },
    });

    return NextResponse.json({ data: row, error: null });
  } catch (error) {
    return handleApiError(error, "Failed to update entry");
  }
}
