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

interface TimelineEvent {
  type: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id: providerId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: provider, error: provErr } = await supabase
      .from("providers")
      .select(
        `
        id, user_id, business_name, slug, status, is_verified,
        onboarding_state, lead_id, created_at, updated_at,
        description, business_type, team_size,
        provider_locations (id, city, country, address_line1, latitude, longitude)
      `
      )
      .eq("id", providerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (provErr) throw provErr;
    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    // maybeSingle: a provider can legitimately have no linked user row (admin-created
    // shell, or a deleted owner account). The lifecycle view is designed to render
    // with user === null, so a missing user must not 500 the whole page.
    const { data: user, error: userErr } = provider.user_id
      ? await supabase
          .from("users")
          .select(
            "id, email, full_name, phone, role, created_at, identity_verified, identity_verification_status"
          )
          .eq("id", provider.user_id)
          .maybeSingle()
      : { data: null, error: null };
    if (userErr) throw userErr;

    // Layer 2 — KYC / provider verification snapshot for the lifecycle view.
    // Best-effort: never fail the whole page if this lookup errors.
    let kyc: {
      status: string;
      last_reviewed_at: string | null;
      updated_at: string | null;
    } | null = null;
    try {
      const { data: kycRow } = await supabase
        .from("provider_verification_status")
        .select("status, last_reviewed_at, updated_at")
        .eq("provider_id", providerId)
        .maybeSingle();
      if (kycRow) {
        const r = kycRow as {
          status?: string | null;
          last_reviewed_at?: string | null;
          updated_at?: string | null;
        };
        kyc = {
          status: r.status ?? "pending",
          last_reviewed_at: r.last_reviewed_at ?? null,
          updated_at: r.updated_at ?? null,
        };
      }
    } catch (kycErr) {
      console.error("[lifecycle] provider_verification_status lookup failed:", kycErr);
    }

    const { data: tracking, error: trackErr } = await supabase
      .from("provider_onboarding_tracking")
      .select("*")
      .eq("user_id", provider.user_id)
      .maybeSingle();
    if (trackErr) throw trackErr;

    const { data: draft, error: draftErr } = await supabase
      .from("provider_onboarding_drafts")
      .select("current_step, created_at, updated_at")
      .eq("user_id", provider.user_id)
      .maybeSingle();
    if (draftErr) throw draftErr;

    // Fetch linked lead and activities
    let lead = null;
    let leadActivities: TimelineEvent[] = [];
    if (provider.lead_id) {
      const { data: leadData, error: leadErr } = await supabase
        .from("provider_leads")
        .select("*")
        .eq("id", provider.lead_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (leadErr) throw leadErr;
      lead = leadData;

      const { data: activities } = await supabase
        .from("provider_lead_activities")
        .select("activity_type, description, metadata, created_at")
        .eq("lead_id", provider.lead_id)
        .order("created_at", { ascending: true });

      leadActivities =
        (activities || []).map(
          (a: {
            activity_type: string;
            description: string;
            metadata: Record<string, unknown>;
            created_at: string;
          }) => ({
            type: a.activity_type,
            description: a.description || a.activity_type.replace(/_/g, " "),
            timestamp: a.created_at,
            metadata: a.metadata,
          })
        );
    }

    // Build unified timeline
    const timeline: TimelineEvent[] = [];

    if (lead) {
      timeline.push({
        type: "lead_created",
        description: `Lead captured via ${(lead as Record<string, unknown>).source}`,
        timestamp: (lead as Record<string, unknown>).created_at as string,
      });
      timeline.push(...leadActivities);
    }

    if (user) {
      timeline.push({
        type: "signup",
        description: `Signed up with email ${(user as Record<string, unknown>).email}`,
        timestamp: (user as Record<string, unknown>).created_at as string,
      });
    }

    if (draft) {
      timeline.push({
        type: "wizard_started",
        description: "Started onboarding wizard",
        timestamp: (draft as Record<string, unknown>).created_at as string,
      });
    }

    if (tracking) {
      const t = tracking as Record<string, unknown>;
      if (t.admin_assisted) {
        timeline.push({
          type: "admin_intervention",
          description: `Admin assisted with onboarding`,
          timestamp: (t.admin_completed_at as string) || (t.updated_at as string),
          metadata: { admin_id: t.admin_completed_by },
        });
      }
    }

    timeline.push({
      type: "provider_created",
      description: `Provider profile created: ${provider.business_name}`,
      timestamp: provider.created_at,
    });

    if (provider.status === "active") {
      timeline.push({
        type: "activated",
        description: "Provider activated on marketplace",
        timestamp: provider.updated_at,
      });
    }

    if (provider.status === "suspended") {
      timeline.push({
        type: "suspended",
        description: "Provider suspended",
        timestamp: provider.updated_at,
      });
    }

    timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Profile completeness score
    const locations = provider.provider_locations as Array<Record<string, unknown>> || [];
    const completeness = {
      has_business_name: !!provider.business_name,
      has_description: !!provider.description,
      has_location:
        locations.length > 0 &&
        locations[0]?.latitude != null &&
        locations[0]?.longitude != null,
      is_verified: !!provider.is_verified,
      status: provider.status,
    };

    return successResponse({
      provider,
      user,
      kyc,
      tracking,
      lead,
      timeline,
      completeness,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch lifecycle data");
  }
}
