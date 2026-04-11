import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { userId } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("provider_onboarding_drafts")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch draft");
  }
}

export async function PATCH(
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
    const body = await request.json();

    // Fetch existing draft
    const { data: existing, error: fetchErr } = await supabase
      .from("provider_onboarding_drafts")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    const existingData =
      (existing?.draft_data as Record<string, unknown>) || {};
    const mergedData = { ...existingData, ...body.draft_data };

    const updates: Record<string, unknown> = {
      draft_data: mergedData,
    };
    if (body.current_step !== undefined) {
      updates.current_step = body.current_step;
    }

    if (existing) {
      const { error: updateErr } = await supabase
        .from("provider_onboarding_drafts")
        .update(updates)
        .eq("user_id", userId);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from("provider_onboarding_drafts")
        .insert({
          user_id: userId,
          draft_data: mergedData,
          current_step: body.current_step || 1,
        });
      if (insertErr) throw insertErr;
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const { error: trackErr } = await supabase
      .from("provider_onboarding_tracking")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          wizard_status: "in_progress",
          current_step: body.current_step || existing?.current_step || 1,
          last_progress_at: new Date().toISOString(),
          admin_assisted: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select();
    if (trackErr) throw trackErr;

    // Log the admin edit
    const { data: linkedTracking } = await supabase
      .from("provider_onboarding_tracking")
      .select("lead_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (linkedTracking?.lead_id) {
      await supabase.from("provider_lead_activities").insert({
        lead_id: linkedTracking.lead_id as string,
        activity_type: "admin_draft_edit",
        description: `Draft edited by admin ${user.full_name || user.email}`,
        metadata: {
          admin_id: user.id,
          updated_fields: Object.keys(body.draft_data || {}),
        },
        performed_by: user.id,
      });
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update draft");
  }
}
