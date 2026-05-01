import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";

const STEP_NAMES: Record<number, string> = {
  1: "Team Size",
  2: "Identity + Phone OTP",
  3: "Business Details",
  4: "Payment Setup",
  5: "Current Software",
  6: "Payroll",
  7: "Location",
  8: "Photos",
  9: "Service Zones",
  10: "Categories",
  11: "Services",
  12: "Operating Hours",
  13: "Review",
  14: "Plan Selection",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { userId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const accessibleUser = await getUserRowIfAccessibleToAdminTenant(supabase, tenantId, userId);
    if (!accessibleUser) {
      return notFoundResponse("User not found");
    }

    const [draftRes, providerRes, trackingRes] = await Promise.all([
      supabase
        .from("provider_onboarding_drafts")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("providers")
        .select("id, business_name, status, is_verified, created_at")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("provider_onboarding_tracking")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (draftRes.error) throw draftRes.error;
    if (providerRes.error) throw providerRes.error;
    if (trackingRes.error) throw trackingRes.error;

    const userPayload = {
      id: String(accessibleUser.id),
      email: (accessibleUser.email as string | null | undefined) ?? null,
      full_name: (accessibleUser.full_name as string | null | undefined) ?? null,
      phone: (accessibleUser.phone as string | null | undefined) ?? null,
      role: (accessibleUser.role as string | null | undefined) ?? null,
      avatar_url: (accessibleUser.avatar_url as string | null | undefined) ?? null,
      created_at: (accessibleUser.created_at as string | null | undefined) ?? null,
    };

    const draft = draftRes.data;
    const provider = providerRes.data;
    const tracking = trackingRes.data;
    const currentStep = draft?.current_step || 0;

    // Compute per-step completion from draft_data
    const draftData = (draft?.draft_data as Record<string, unknown>) || {};
    const stepCompletion: Record<
      number,
      { completed: boolean; name: string; data_present: string[] }
    > = {};
    for (let s = 1; s <= 14; s++) {
      stepCompletion[s] = {
        completed: s < currentStep,
        name: STEP_NAMES[s],
        data_present: [],
      };
    }

    if (draftData.team_size) stepCompletion[1].data_present.push("team_size");
    if (draftData.business_type)
      stepCompletion[1].data_present.push("business_type");
    if (draftData.owner_name)
      stepCompletion[2].data_present.push("owner_name");
    if (draftData.owner_phone)
      stepCompletion[2].data_present.push("owner_phone");
    if (draftData.business_name)
      stepCompletion[3].data_present.push("business_name");
    if (draftData.description)
      stepCompletion[3].data_present.push("description");
    if (draftData.yoco_machine)
      stepCompletion[4].data_present.push("yoco_machine");
    const addr = draftData.address as Record<string, unknown> | undefined;
    if (addr?.address_line1) stepCompletion[7].data_present.push("address");
    if (draftData.thumbnail_url)
      stepCompletion[8].data_present.push("thumbnail");
    if (
      Array.isArray(draftData.global_category_ids) &&
      draftData.global_category_ids.length > 0
    )
      stepCompletion[10].data_present.push("categories");
    if (
      Array.isArray(draftData.services) &&
      draftData.services.length > 0
    )
      stepCompletion[11].data_present.push("services");
    if (draftData.operating_hours)
      stepCompletion[12].data_present.push("operating_hours");
    if (draftData.selected_plan_id)
      stepCompletion[14].data_present.push("plan");

    // Check for linked lead
    let linkedLead = null;
    if (tracking?.lead_id) {
      const { data: lead, error: leadErr } = await supabase
        .from("provider_leads")
        .select("id, business_name, commercial_stage, source, created_at")
        .eq("id", tracking.lead_id as string)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (leadErr) throw leadErr;
      linkedLead = lead;
    }

    return successResponse({
      user: userPayload,
      draft: draft
        ? {
            id: draft.id,
            current_step: currentStep,
            current_step_name: STEP_NAMES[currentStep] || `Step ${currentStep}`,
            draft_data: draftData,
            created_at: draft.created_at,
            updated_at: draft.updated_at,
          }
        : null,
      provider: provider || null,
      tracking: tracking || null,
      step_completion: stepCompletion,
      linked_lead: linkedLead,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch user tracker detail");
  }
}
