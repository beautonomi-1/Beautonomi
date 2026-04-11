import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import type { UserRole } from "@/types/beautonomi";

const SIGNUP_SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  social_instagram: "Instagram",
  social_facebook: "Facebook",
  social_twitter: "X / Twitter",
  friend_or_family: "Friend or family",
  blog_or_article: "Blog or article",
  app_store: "App Store / Play Store",
  provider_referral: "Provider referral",
  other: "Other",
  "": "Not specified",
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);

    if ((user.role as UserRole) !== "superadmin") {
      return errorResponse("Marketing insights require superadmin", "FORBIDDEN", 403);
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    if (!supabaseAdmin) {
      return handleApiError(new Error("Database unavailable"), "Failed to load marketing insights");
    }

    const now = new Date();
    const start7 = new Date(now);
    start7.setDate(start7.getDate() - 7);
    const start14 = new Date(now);
    start14.setDate(start14.getDate() - 14);

    const [
      resBook7,
      resBookPrior7,
      resUsersHome,
      rpcSignup,
      rpcPrev,
      rpcCustAge,
      rpcDecade,
      rpcProvYib,
      rpcProvPersonAge,
    ] = await Promise.all([
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", start7.toISOString()),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", start14.toISOString())
        .lt("created_at", start7.toISOString()),
      supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("preferred_home_tenant_id", tenantId),
      supabaseAdmin.rpc("admin_dashboard_signup_sources_by_tenant", { p_tenant_id: tenantId }),
      supabaseAdmin.rpc("admin_dashboard_previous_software_by_tenant", { p_tenant_id: tenantId }),
      supabaseAdmin.rpc("admin_dashboard_customer_age_brackets_by_tenant", { p_tenant_id: tenantId }),
      supabaseAdmin.rpc("admin_dashboard_customer_decade_born_by_tenant", { p_tenant_id: tenantId }),
      supabaseAdmin.rpc("admin_dashboard_provider_years_in_business_by_tenant", { p_tenant_id: tenantId }),
      supabaseAdmin.rpc("admin_dashboard_provider_person_age_brackets_by_tenant", { p_tenant_id: tenantId }),
    ]);

    const bookingsLast7 = resBook7.error ? 0 : resBook7.count ?? 0;
    const bookingsPrior7Count = resBookPrior7.error ? 0 : resBookPrior7.count ?? 0;
    const totalUsersPreferredHome = resUsersHome.error ? 0 : resUsersHome.count ?? 0;

    const bookingVelocityPct =
      bookingsPrior7Count > 0
        ? Math.round(((bookingsLast7 - bookingsPrior7Count) / bookingsPrior7Count) * 100)
        : bookingsLast7 > 0
          ? 100
          : 0;

    type SignupRow = { signup_source: string | null; user_count: number | string };
    type PrevRow = { previous_software: string | null; provider_count: number | string };
    type BracketRow = { bracket: string | null; user_count: number | string };
    type DecadeRow = { decade_label: string | null; user_count: number | string };
    type YibRow = { bracket: string | null; provider_count: number | string };

    let signupRows: SignupRow[] = [];
    if (rpcSignup.error) {
      console.warn("admin_dashboard_signup_sources_by_tenant:", rpcSignup.error.message);
    } else if (Array.isArray(rpcSignup.data)) {
      signupRows = rpcSignup.data as SignupRow[];
    }

    let prevRows: PrevRow[] = [];
    if (rpcPrev.error) {
      console.warn("admin_dashboard_previous_software_by_tenant:", rpcPrev.error.message);
    } else if (Array.isArray(rpcPrev.data)) {
      prevRows = rpcPrev.data as PrevRow[];
    }

    const parseBracketRows = (rpc: { error: { message: string } | null; data: unknown }, label: string) => {
      if (rpc.error) {
        console.warn(`${label}:`, rpc.error.message);
        return [] as BracketRow[];
      }
      return Array.isArray(rpc.data) ? (rpc.data as BracketRow[]) : [];
    };

    const customerAgeRows = parseBracketRows(rpcCustAge, "admin_dashboard_customer_age_brackets_by_tenant");
    let customerDecadeRows: DecadeRow[] = [];
    if (rpcDecade.error) {
      console.warn("admin_dashboard_customer_decade_born_by_tenant:", rpcDecade.error.message);
    } else if (Array.isArray(rpcDecade.data)) {
      customerDecadeRows = rpcDecade.data as DecadeRow[];
    }
    let providerYibRows: YibRow[] = [];
    if (rpcProvYib.error) {
      console.warn("admin_dashboard_provider_years_in_business_by_tenant:", rpcProvYib.error.message);
    } else if (Array.isArray(rpcProvYib.data)) {
      providerYibRows = rpcProvYib.data as YibRow[];
    }
    const providerPersonAgeRows = parseBracketRows(
      rpcProvPersonAge,
      "admin_dashboard_provider_person_age_brackets_by_tenant"
    );

    const { data: swOpt } = await supabaseAdmin
      .from("previous_software_options")
      .select("slug, name")
      .eq("is_active", true);
    const softwareLabelBySlug = new Map<string, string>(
      (swOpt ?? []).map((r: { slug: string; name: string }) => [r.slug, r.name])
    );

    const signupSources = signupRows.map((r) => {
      const key = r.signup_source ?? "";
      const count = Number(r.user_count);
      return {
        source: key || null,
        label: SIGNUP_SOURCE_LABELS[key] ?? (key ? key : "Not specified"),
        count,
      };
    });

    const withSource = signupSources.filter((s) => s.source && s.source.length > 0).reduce((a, b) => a + b.count, 0);
    const signupSourceAttributionRate =
      totalUsersPreferredHome > 0 ? Math.round((withSource / totalUsersPreferredHome) * 1000) / 1000 : 0;

    const previousBookingSystems = prevRows.map((r) => {
      const slug = r.previous_software ?? "";
      const count = Number(r.provider_count);
      const label =
        slug === ""
          ? "Not specified"
          : softwareLabelBySlug.get(slug) ?? (slug === "other" ? "Other (custom)" : slug);
      return { slug: slug || null, label, count };
    });

    const customer_age_brackets = customerAgeRows.map((r) => ({
      label: r.bracket ?? "Unknown",
      count: Number(r.user_count),
    }));
    const customer_decade_born = customerDecadeRows.map((r) => ({
      label: r.decade_label ?? "Unknown",
      count: Number(r.user_count),
    }));
    const provider_years_in_business = providerYibRows.map((r) => ({
      label: r.bracket ?? "Unknown",
      count: Number(r.provider_count),
    }));
    const provider_person_age_brackets = providerPersonAgeRows.map((r) => ({
      label: r.bracket ?? "Unknown",
      count: Number(r.user_count),
    }));

    return successResponse({
      tenant_id: tenantId,
      signup_sources: signupSources,
      previous_booking_systems: previousBookingSystems,
      customer_age_brackets,
      customer_decade_born,
      provider_years_in_business,
      provider_person_age_brackets,
      product_signals: {
        bookings_last_7d: bookingsLast7,
        bookings_prior_7d: bookingsPrior7Count,
        booking_velocity_pct_vs_prior_week: bookingVelocityPct,
        users_with_preferred_home: totalUsersPreferredHome,
        signup_source_attribution_rate: signupSourceAttributionRate,
      },
      marketing_funnel_events: {
        description:
          "Canonical funnel names (see docs/analytics/EVENT_TAXONOMY.md). Use Amplitude to chart conversion.",
        suggested_funnel: [
          "booking_start",
          "booking_hold_created",
          "booking_details_completed",
          "booking_confirmed",
        ],
        acquisition_events: ["signup_start", "signup_complete", "login_success"],
        engagement_events: ["search_result_clicked", "provider_profile_view", "explore_feed_view"],
      },
      metrics_notes: {
        signup_source_basis:
          "Counts per signup_source for users with preferred_home_tenant_id = tenant (all roles). Does not include bookers without preferred home.",
        previous_software_basis:
          "Provider rows in tenant; previous_software from onboarding (prior booking system).",
        booking_velocity_basis: "Bookings created in tenant: last 7 calendar days vs prior 7 days (UTC).",
        attribution_rate:
          "Share of preferred-home users who set signup_source (non-empty).",
        customer_age_basis:
          "Customers (role=customer, preferred home = tenant): age from users.date_of_birth at current date (UTC). Unknown = no DOB.",
        customer_decade_basis:
          "Same customer scope; decade_born from user_profiles (social profile). Coarser than DOB. Unknown = missing or empty.",
        provider_years_in_business_basis:
          "Business tenure from providers.years_in_business only (not duplicated on users). All provider rows in tenant.",
        provider_person_age_basis:
          "Distinct users: provider owner user_id + active provider_staff with user_id (tenant-scoped). Age from users.date_of_birth. Not business tenure (see years in business).",
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to load marketing insights");
  }
}
