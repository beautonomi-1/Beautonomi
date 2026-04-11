import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const { userId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    if (!body.note?.trim()) {
      return errorResponse("note is required", "VALIDATION_ERROR", 400);
    }

    const { data: targetUser } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!targetUser) {
      const { notFoundResponse } = await import("@/lib/supabase/api-helpers");
      return notFoundResponse("User not found in this tenant");
    }

    const { data: existing } = await supabase
      .from("provider_onboarding_tracking")
      .select("id, admin_notes")
      .eq("user_id", userId)
      .maybeSingle();

    const existingNotes = (existing?.admin_notes as string) || "";
    const timestamp = new Date().toISOString();
    const adminName = user.full_name || user.email;
    const newNote = `[${timestamp}] ${adminName}: ${body.note.trim()}`;
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${newNote}`
      : newNote;

    const { error: upsertErr } = await supabase
      .from("provider_onboarding_tracking")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          admin_notes: updatedNotes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (upsertErr) throw upsertErr;

    return successResponse({ success: true, note: newNote });
  } catch (error) {
    return handleApiError(error, "Failed to add note");
  }
}
