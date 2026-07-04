import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getPlatformSalesDefaults } from "@/lib/platform-sales-settings";
import { locationHasOperatingHours } from "@/lib/provider/location-operating-hours";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { resolveVerificationPolicy } from "@/lib/verification/verification-policy";

export interface SetupStatusStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  /** Web route (Next.js App Router path) — used by `apps/web` get-started page. */
  link: string;
  /**
   * Canonical native (expo-router) route per step. Returned by the server so
   * the mobile checklist UI never needs a client-side WEB_PATH_TO_NATIVE map.
   * `null` when no dedicated mobile screen exists (the wizard is the fallback).
   */
  native_route: string | null;
}

export interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  missing_steps: string[];
  steps: SetupStatusStep[];
  /** Current providers.status when a provider row exists. */
  providerStatus?: string | null;
}

/**
 * Server-canonical mapping: setup step `id` -> native expo-router path in the
 * provider mobile app. Keep this in sync with `apps/provider/app/(app)/**`.
 * When you add a new step, add its native route here.
 * Exported so the mobile checklist UI and tests can reason about it.
 */
export const NATIVE_ROUTE_BY_ID: Record<string, string> = {
  "profile-details": "/(app)/(tabs)/more/settings/business",
  "personal-profile": "/(app)/(tabs)/more/settings/personal-profile",
  "service-address": "/(app)/(tabs)/more/locations",
  "profile-photo": "/(app)/(tabs)/more/gallery",
  services: "/(app)/(tabs)/more/catalogue",
  availability: "/(app)/(tabs)/more/settings/hours",
  "travel-fees": "/(app)/(tabs)/more/settings/travel-fees",
  payment: "/(app)/(tabs)/more/settings/yoco-devices",
  "payment-methods": "/(app)/(tabs)/more/settings/payments",
  payout: "/(app)/(tabs)/more/settings/payout-accounts",
  gallery: "/(app)/(tabs)/more/gallery",
  "identity-verification": "/(app)/(tabs)/more/settings/verification",
};

/**
 * GET /api/provider/setup-status
 * Check provider setup completion status.
 * Completion % is based on required steps only.
 * Optional steps (gallery) are shown but do not affect the %.
 * Website, social media, years-in-business, and languages are intentionally
 * excluded — they are not needed to start accepting bookings.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const tenantId = await resolveTenantIdWithZaFallback(request);

    // Resolve provider in a tenant-aware, multi-row-safe way.
    // Do NOT use single-row helpers here because many accounts can have
    // multiple provider links across tenants.
    let providerId: string | null = null;
    const { data: ownerProviders } = await supabaseAdmin
      .from("providers")
      .select("id, tenant_id, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (ownerProviders && ownerProviders.length > 0) {
      const tenantMatchedOwner =
        (tenantId
          ? ownerProviders.find((p: any) => p.tenant_id === tenantId)
          : null) ?? null;
      providerId = (tenantMatchedOwner ?? ownerProviders[0])?.id ?? null;
    }

    if (!providerId) {
      const { data: staffRows } = await supabaseAdmin
        .from("provider_staff")
        .select("provider_id, providers:provider_id(tenant_id)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (staffRows && staffRows.length > 0) {
        const tenantMatchedStaff =
          (tenantId
            ? staffRows.find((r: any) => {
                const provider = Array.isArray(r.providers)
                  ? r.providers[0]
                  : r.providers;
                return provider?.tenant_id === tenantId;
              })
            : null) ?? null;
        providerId = (tenantMatchedStaff ?? staffRows[0])?.provider_id ?? null;
      }
    }
    if (!providerId) {
      return successResponse<SetupStatus>({
        isComplete: false,
        completionPercentage: 0,
        missing_steps: [],
        steps: [],
      });
    }

    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select(
        "id, status, business_name, description, gallery, thumbnail_url, avatar_url, business_type, accept_cash, accept_card, accept_online, phone, email, is_verified"
      )
      .eq("id", providerId)
      .single();

    if (!provider) {
      return successResponse<SetupStatus>({
        isComplete: false,
        completionPercentage: 0,
        missing_steps: [],
        steps: [],
      });
    }

    const isFreelancer =
      provider.business_type === "freelancer" || !provider.business_type;

    const { data: accountUser } = await supabaseAdmin
      .from("users")
      .select("email, phone, identity_verified, identity_verification_status")
      .eq("id", user.id)
      .maybeSingle();

    const { data: providerKycRow } = await supabaseAdmin
      .from("provider_verification_status")
      .select("status")
      .eq("provider_id", providerId)
      .maybeSingle();

    // ── Checks ───────────────────────────────────────────────────────────────

    const hasBusinessName =
      typeof provider.business_name === "string" &&
      provider.business_name.trim().length > 1;
    const hasDescription =
      typeof provider.description === "string" &&
      provider.description.trim().length >= 10;
    const hasContactInfo =
      (typeof provider.phone === "string" && provider.phone.trim().length > 0) ||
      (typeof provider.email === "string" && provider.email.trim().length > 0) ||
      (typeof accountUser?.email === "string" && accountUser.email.trim().length > 0) ||
      (typeof accountUser?.phone === "string" && accountUser.phone.trim().length > 0);
    const hasProfileDetails = hasBusinessName && hasDescription && hasContactInfo;

    const { data: locations } = await supabaseAdmin
      .from("provider_locations")
      .select("id, is_active, address_line1, city, working_hours")
      .eq("provider_id", providerId);

    const activeLocations = (locations || []).filter((loc) => loc.is_active !== false);
    const hasServiceAddress = activeLocations.some(
      (loc) =>
        typeof loc.address_line1 === "string" &&
        loc.address_line1.trim().length > 0 &&
        typeof loc.city === "string" &&
        loc.city.trim().length > 0
    );
    const hasOperatingHours = activeLocations.some((loc) =>
      locationHasOperatingHours(loc.working_hours)
    );

    const avatarUrl = (provider as { avatar_url?: string | null }).avatar_url;
    const hasProfilePhoto = !!(
      (provider.thumbnail_url &&
        typeof provider.thumbnail_url === "string" &&
        provider.thumbnail_url.trim().length > 0) ||
      (avatarUrl &&
        typeof avatarUrl === "string" &&
        avatarUrl.trim().length > 0) ||
      (Array.isArray(provider.gallery) && provider.gallery.length > 0)
    );

    const hasGallery =
      Array.isArray(provider.gallery) && provider.gallery.length > 0;

    const [
      servicesResult,
      atHomeServicesResult,
      travelFeeSettingsResult,
      zoneSelectionsResult,
      yocoResult,
      bankAccountResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("offerings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_active", true),
      supabaseAdmin
        .from("offerings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .eq("supports_at_home", true),
      supabaseAdmin
        .from("provider_travel_fee_settings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("enabled", true),
      supabaseAdmin
        .from("provider_zone_selections")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_active", true),
      supabaseAdmin
        .from("provider_yoco_integrations")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_enabled", true),
      supabaseAdmin
        .from("provider_payout_accounts")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("active", true),
    ]);

    const hasServices = (servicesResult.count ?? 0) > 0;
    const hasAtHomeServices = (atHomeServicesResult.count ?? 0) > 0;
    const needsTravelFees = isFreelancer || hasAtHomeServices;
    const hasTravelFees =
      (travelFeeSettingsResult.count ?? 0) > 0 ||
      (zoneSelectionsResult.count ?? 0) > 0;
    const hasPaymentSetup = (yocoResult.count ?? 0) > 0;
    const hasPayoutSetup = (bankAccountResult.count ?? 0) > 0;
    const platformSalesDefaults = await getPlatformSalesDefaults();
    const effectiveGiftCardsEnabled = platformSalesDefaults.gift_cards_enabled ?? false;
    const yocoEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.PAYMENT_YOCO,
      (provider as { tenant_id?: string | null }).tenant_id ?? tenantId,
    );
    const paystackTerminalEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK_VIRTUAL_TERMINAL,
      (provider as { tenant_id?: string | null }).tenant_id ?? tenantId,
    );

    // §provider-setup-2026-05: payment methods step requires a real
    // configuration decision — at least one accept_* flag explicitly true.
    // The earlier `?? true` defaults caused the step to auto-tick before the
    // provider visited the settings screen, hiding the configuration from
    // them and from the checklist progress signal.
    const acceptCash = provider.accept_cash === true;
    const acceptCard = yocoEnabled && provider.accept_card === true;
    const acceptOnline = provider.accept_online === true;
    const hasPaymentMethods =
      acceptCash || acceptCard || acceptOnline || effectiveGiftCardsEnabled === true;

    // Identity verification — completes the checklist step when:
    // 1. Admin manual review approved (users.identity_verified === true), or
    // 2. Didit (or legacy Sumsub) auto-approved the provider KYC (provider_verification_status), or
    // 3. The provider's marketplace verified badge is on (providers.is_verified).
    // Any one of these signals means we have a confirmed identity for the provider.
    const kycStatus = (providerKycRow as { status?: string | null } | null)?.status ?? null;
    const isIdentityVerified =
      (accountUser as { identity_verified?: boolean | null } | null)?.identity_verified === true ||
      kycStatus === "approved" ||
      (provider as { is_verified?: boolean | null }).is_verified === true;

    // Resolve verification policy to determine if identity is a required step.
    const providerTenantId = (provider as { tenant_id?: string | null }).tenant_id ?? tenantId;
    const verificationPolicy = await resolveVerificationPolicy(providerTenantId);

    // Personal profile — required for freelancers only
    const { data: userProfile } = await supabaseAdmin
      .from("user_profiles")
      .select(
        "about, school, work, location, languages, interests, decade_born, favorite_song, obsessed_with, fun_fact, useless_skill, biography_title, spend_time, pets"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    const hasPersonalProfile = userProfile
      ? !!(
          (typeof userProfile.about === "string" &&
            userProfile.about.trim().length > 0) ||
          [
            userProfile.school,
            userProfile.work,
            userProfile.location,
            userProfile.decade_born,
            userProfile.favorite_song,
            userProfile.obsessed_with,
            userProfile.fun_fact,
            userProfile.useless_skill,
            userProfile.biography_title,
            userProfile.spend_time,
            userProfile.pets,
          ].filter(
            (f) =>
              f && (typeof f === "string" ? f.trim().length > 0 : true)
          ).length >= 2 ||
          (Array.isArray(userProfile.languages) &&
            userProfile.languages.length > 0) ||
          (Array.isArray(userProfile.interests) &&
            userProfile.interests.length > 0)
        )
      : false;

    // ── Step definitions ──────────────────────────────────────────────────────
    // Only include steps that are genuinely needed to start accepting bookings.
    // Website, social media, languages, and years-in-business are profile
    // enhancements — they do not gate bookings and are not shown here.

    const steps = [
      {
        id: "profile-details",
        title: isFreelancer ? "Business Profile" : "Business Details",
        description: isFreelancer
          ? "Business name (Business details), description (Business Description), and phone or email on your business or account profile"
          : "Business name (Business details), description (Business Description), and phone or email on your business or account profile",
        completed: hasProfileDetails,
        required: true,
        link: "/provider/settings",
      },
      ...(isFreelancer
        ? [
            {
              id: "personal-profile",
              title: "Personal Profile",
              description:
                "Add a short bio so customers know who they're booking with",
              completed: hasPersonalProfile,
              required: true,
              link: "/provider/account/personal-profile",
            },
          ]
        : []),
      {
        id: "service-address",
        title: isFreelancer ? "Service Address" : "Business Location",
        description: isFreelancer
          ? "Set the address where you provide services"
          : "Set your business location so customers can find you",
        completed: hasServiceAddress,
        required: true,
        link: "/provider/settings/locations",
      },
      {
        id: "profile-photo",
        title: "Profile Photo",
        description: "Upload a photo so customers can recognise you",
        completed: hasProfilePhoto,
        required: true,
        link: "/provider/settings/gallery",
      },
      {
        id: "services",
        title: "Services & Pricing",
        description:
          "Add at least one service with pricing so customers can book",
        completed: hasServices,
        required: true,
        link: "/provider/catalogue/services",
      },
      {
        id: "availability",
        title: "Availability",
        description: "Set your working hours so customers know when to book",
        completed: hasOperatingHours,
        required: true,
        link: "/provider/settings/operating-hours",
      },
      ...(needsTravelFees
        ? [
            {
              id: "travel-fees",
              title: "Travel Fees",
              description:
                "Confirm your house-call travel fee rules or accept the platform defaults",
              completed: hasTravelFees,
              required: true,
              link: "/provider/settings/sales/travel-fees",
            },
          ]
        : []),
      ...(yocoEnabled
        ? [
            {
              id: "payment",
              title: "Payment Processing",
              description:
                "Optional: connect Yoco for in-person card payments (not required if you only use cash or online)",
              completed: hasPaymentSetup,
              required: false,
              link: "/provider/settings/sales/yoco-integration",
            },
          ]
        : []),
      // §provider-launch (2026-06): Paystack Terminal is intentionally NOT part
      // of onboarding (it is a feature-gated, ops-assisted add-on). It remains
      // available under the feature flag in Settings → Sales → Paystack
      // Terminal; it must not appear in the onboarding hub / get-started.
      {
        id: "payment-methods",
        title: "Payment Methods",
        description:
          yocoEnabled || paystackTerminalEnabled
            ? "Choose accepted methods (cash, online, in-person payments, and gift cards)"
            : "Choose accepted methods (cash, online, and gift cards)",
        completed: hasPaymentMethods,
        required: true,
        link: "/provider/settings/payments",
      },
      {
        id: "payout",
        title: "Payout Account",
        description: "Add your bank account to receive earnings",
        completed: hasPayoutSetup,
        required: true,
        link: "/provider/settings/payout-accounts",
      },
      {
        id: "gallery",
        title: "Portfolio Photos",
        description:
          "Add photos of your work to attract more customers",
        completed: hasGallery,
        required: false,
        link: "/provider/settings/gallery",
      },
      {
        id: "identity-verification",
        title: "Identity Verification",
        description:
          "Verify your identity to earn the 'Verified' marketplace badge and increase customer trust",
        completed: isIdentityVerified,
        required: verificationPolicy.requiredForProviders,
        link: "/provider/settings/verification",
      },
    ];

    const requiredSteps = steps.filter((s) => s.required);
    const completedRequired = requiredSteps.filter((s) => s.completed).length;
    const completionPercentage =
      requiredSteps.length > 0
        ? Math.round((completedRequired / requiredSteps.length) * 100)
        : 0;
    const isComplete =
      completedRequired === requiredSteps.length && requiredSteps.length > 0;
    const missingSteps = requiredSteps.filter((s) => !s.completed).map((s) => s.id);

    const stepsWithNativeRoute = steps.map((s) => ({
      ...s,
      native_route: NATIVE_ROUTE_BY_ID[s.id] ?? null,
    }));

    return successResponse<SetupStatus>({
      isComplete,
      completionPercentage: isComplete ? 100 : completionPercentage,
      missing_steps: missingSteps,
      steps: stepsWithNativeRoute,
      providerStatus: (provider as { status?: string | null }).status ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check setup status");
  }
}
