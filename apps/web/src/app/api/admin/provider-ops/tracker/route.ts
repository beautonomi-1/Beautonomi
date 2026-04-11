import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

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

function computeStallStatus(
  updatedAt: string | null,
  stallThresholdHours: number,
  dropOffThresholdHours: number
): "active" | "slowing" | "stalled" | "dropped_off" {
  if (!updatedAt) return "stalled";
  const diff = Date.now() - new Date(updatedAt).getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours > dropOffThresholdHours) return "dropped_off";
  if (hours > stallThresholdHours) return "stalled";
  if (hours > stallThresholdHours / 2) return "slowing";
  return "active";
}

function extractDraftSummary(
  draftData: Record<string, unknown> | null
): Record<string, unknown> {
  if (!draftData) return {};
  return {
    business_name: draftData.business_name || null,
    owner_name: draftData.owner_name || null,
    owner_email: draftData.owner_email || null,
    owner_phone: draftData.owner_phone || null,
    team_size: draftData.team_size || null,
    business_type: draftData.business_type || null,
    has_address:
      !!(draftData.address as Record<string, unknown>)?.address_line1 || false,
    has_thumbnail: !!draftData.thumbnail_url,
    has_services:
      Array.isArray(draftData.services) && draftData.services.length > 0,
    category_count: Array.isArray(draftData.global_category_ids)
      ? draftData.global_category_ids.length
      : 0,
    has_operating_hours: !!draftData.operating_hours,
    selected_plan_id: draftData.selected_plan_id || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const statusFilter = searchParams.get("status");
    const stepFilter = searchParams.get("step");
    const stallThresholdHours = 24;
    const dropOffThresholdHours = 168;

    // Get all provider_owner users who haven't completed onboarding
    // by joining users -> provider_onboarding_drafts and excluding those with active providers
    const { data: drafts, error: draftsErr } = await supabase
      .from("provider_onboarding_drafts")
      .select(
        `
        id,
        user_id,
        draft_data,
        current_step,
        created_at,
        updated_at
      `
      )
      .order("updated_at", { ascending: false });
    if (draftsErr) throw draftsErr;

    const userIds = (drafts || []).map(
      (d: { user_id: string }) => d.user_id
    );
    if (userIds.length === 0) {
      return successResponse([]);
    }

    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id, email, full_name, phone, role, created_at")
      .eq("tenant_id", tenantId)
      .in("id", userIds);
    if (usersErr) throw usersErr;

    const usersMap = new Map<
      string,
      {
        id: string;
        email: string;
        full_name: string;
        phone: string;
        role: string;
        created_at: string;
      }
    >();
    for (const u of users || []) {
      usersMap.set(
        u.id,
        u as {
          id: string;
          email: string;
          full_name: string;
          phone: string;
          role: string;
          created_at: string;
        }
      );
    }

    const { data: providers } = await supabase
      .from("providers")
      .select("id, user_id, status, business_name")
      .eq("tenant_id", tenantId)
      .in("user_id", userIds);

    const providersMap = new Map<
      string,
      { id: string; status: string; business_name: string }
    >();
    for (const p of providers || []) {
      providersMap.set(
        p.user_id,
        p as { id: string; status: string; business_name: string }
      );
    }

    const { data: trackingRecords } = await supabase
      .from("provider_onboarding_tracking")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("user_id", userIds);

    const trackingMap = new Map<string, Record<string, unknown>>();
    for (const t of trackingRecords || []) {
      trackingMap.set(t.user_id as string, t as Record<string, unknown>);
    }

    type DraftRow = {
      id: string;
      user_id: string;
      draft_data: Record<string, unknown>;
      current_step: number;
      created_at: string;
      updated_at: string;
    };

    const results = (drafts || [])
      .map((draft: DraftRow) => {
        const user = usersMap.get(draft.user_id);
        if (!user) return null;

        const provider = providersMap.get(draft.user_id);
        const tracking = trackingMap.get(draft.user_id);
        const currentStep = draft.current_step || 1;
        const stallStatus = provider
          ? ("completed" as const)
          : computeStallStatus(
              draft.updated_at,
              stallThresholdHours,
              dropOffThresholdHours
            );

        return {
          user_id: draft.user_id,
          draft_id: draft.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          signup_date: user.created_at,
          current_step: currentStep,
          current_step_name: STEP_NAMES[currentStep] || `Step ${currentStep}`,
          last_activity: draft.updated_at,
          stall_status: stallStatus,
          has_provider: !!provider,
          provider_id: provider?.id || null,
          provider_status: provider?.status || null,
          provider_business_name: provider?.business_name || null,
          draft_summary: extractDraftSummary(draft.draft_data),
          assigned_to: (tracking?.assigned_to as string) || null,
          admin_assisted: (tracking?.admin_assisted as boolean) || false,
          admin_notes: (tracking?.admin_notes as string) || null,
          tracking_id: (tracking?.id as string) || null,
        };
      })
      .filter(Boolean);

    let filtered = results;
    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter(
        (r: (typeof results)[number]) => r?.stall_status === statusFilter
      );
    }
    if (stepFilter) {
      const step = parseInt(stepFilter, 10);
      filtered = filtered.filter(
        (r: (typeof results)[number]) =>
          r?.current_step === step && !r?.has_provider
      );
    }

    return successResponse(filtered);
  } catch (error) {
    return handleApiError(error, "Failed to fetch tracker data");
  }
}
