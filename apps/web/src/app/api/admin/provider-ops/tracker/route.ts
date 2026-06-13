import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { chunkIds, unwrapEmbedded } from "@/lib/provider-ops/postgrest-unbounded";
import { fetchProviderOnboardingDraftsForTenantScope } from "@/lib/provider-ops/scoped-onboarding-drafts";
import {
  draftHasAddressLine,
  isOnboardingWizardUserRole,
} from "@/lib/provider-ops/onboarding-wizard-roles";

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
    has_address: draftHasAddressLine(draftData.address as Record<string, unknown> | undefined),
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
    const search = searchParams.get("search")?.trim()?.toLowerCase();
    const { page, limit } = getPaginationParams(request);
    const stallThresholdHours = 24;
    const dropOffThresholdHours = 168;

    type DraftWithUser = {
      id: string;
      user_id: string;
      draft_data: Record<string, unknown>;
      current_step: number;
      created_at: string;
      updated_at: string;
      users: {
        id: string;
        email: string;
        full_name: string;
        phone: string;
        role: string;
        created_at: string;
      };
    };

    const joined = await fetchProviderOnboardingDraftsForTenantScope(
      `
        id,
        user_id,
        draft_data,
        current_step,
        created_at,
        updated_at,
        users!inner(id, email, full_name, phone, role, created_at)
      `,
      tenantId
    );

    const drafts: DraftWithUser[] = joined
      .map((row) => {
        const u = unwrapEmbedded<{
          id: string;
          email: string;
          full_name: string;
          phone: string;
          role: string;
          created_at: string;
        }>(row, "users");
        if (!u || !isOnboardingWizardUserRole(u.role)) return null;
        return {
          id: String(row.id),
          user_id: String(row.user_id),
          draft_data: (row.draft_data as Record<string, unknown>) ?? {},
          current_step: Number(row.current_step ?? 1),
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
          users: u,
        };
      })
      .filter((x): x is DraftWithUser => x != null);

    if (drafts.length === 0) {
      return successResponse({ data: [], meta: { total: 0, page, limit, has_more: false } });
    }

    const userIds = drafts.map((d) => d.user_id);

    const providersFlat: { id: string; user_id: string; status: string; business_name: string }[] =
      [];
    for (const chunk of chunkIds(userIds, 120)) {
      const { data: providers, error: pErr } = await supabase
        .from("providers")
        .select("id, user_id, status, business_name")
        .eq("tenant_id", tenantId)
        .in("user_id", chunk);
      if (pErr) throw pErr;
      providersFlat.push(...((providers || []) as typeof providersFlat));
    }

    const providersMap = new Map<
      string,
      { id: string; status: string; business_name: string }
    >();
    for (const p of providersFlat) {
      providersMap.set(p.user_id, p);
    }

    const trackingRecords: Record<string, unknown>[] = [];
    for (const chunk of chunkIds(userIds, 120)) {
      const { data: tr, error: trErr } = await supabase
        .from("provider_onboarding_tracking")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("user_id", chunk);
      if (trErr) throw trErr;
      trackingRecords.push(...(tr || []));
    }

    const trackingMap = new Map<string, Record<string, unknown>>();
    for (const t of trackingRecords) {
      trackingMap.set(t.user_id as string, t as Record<string, unknown>);
    }

    const results = drafts
      .map((draft) => {
        const user = draft.users;
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
    if (search) {
      filtered = filtered.filter((r: (typeof results)[number]) => {
        if (!r) return false;
        return (
          r.full_name?.toLowerCase().includes(search) ||
          r.email?.toLowerCase().includes(search) ||
          r.phone?.includes(search) ||
          r.draft_summary?.business_name?.toString().toLowerCase().includes(search)
        );
      });
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return successResponse({
      data: paginated,
      meta: { page, limit, total, has_more: total > page * limit },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch tracker data");
  }
}
