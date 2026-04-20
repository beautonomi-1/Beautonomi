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

interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  steps: {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    required: boolean;
    link: string;
  }[];
}

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
        steps: [],
      });
    }

    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select(
        "id, status, business_name, description, gallery, thumbnail_url, avatar_url, business_type, accept_cash, accept_card, accept_online, phone, email"
      )
      .eq("id", providerId)
      .single();

    if (!provider) {
      return successResponse<SetupStatus>({
        isComplete: false,
        completionPercentage: 0,
        steps: [],
      });
    }

    const isFreelancer =
      provider.business_type === "freelancer" || !provider.business_type;

    const { data: accountUser } = await supabaseAdmin
      .from("users")
      .select("email, phone")
      .eq("id", user.id)
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

    const [servicesResult, yocoResult, bankAccountResult] = await Promise.all([
      supabaseAdmin
        .from("offerings")
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
    const hasPaymentSetup = (yocoResult.count ?? 0) > 0;
    const hasPayoutSetup = (bankAccountResult.count ?? 0) > 0;
    const platformSalesDefaults = await getPlatformSalesDefaults();
    const effectiveGiftCardsEnabled = platformSalesDefaults.gift_cards_enabled ?? false;

    const acceptCash = provider.accept_cash ?? true;
    const acceptCard = provider.accept_card ?? true;
    const acceptOnline = provider.accept_online ?? false;
    const hasPaymentMethods =
      acceptCash === true ||
      acceptCard === true ||
      acceptOnline === true ||
      effectiveGiftCardsEnabled === true;

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
              link: "/profile/create-profile",
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
      {
        id: "payment",
        title: "Payment Processing",
        description:
          "Optional: connect Yoco for in-person card payments (not required if you only use cash or online)",
        completed: hasPaymentSetup,
        required: false,
        link: "/provider/settings/sales/yoco-integration",
      },
      {
        id: "payment-methods",
        title: "Payment Methods",
        description:
          "Choose accepted methods (cash, online, in-person card, and gift cards)",
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
    ];

    const requiredSteps = steps.filter((s) => s.required);
    const completedRequired = requiredSteps.filter((s) => s.completed).length;
    const completionPercentage =
      requiredSteps.length > 0
        ? Math.round((completedRequired / requiredSteps.length) * 100)
        : 0;
    const isComplete =
      completedRequired === requiredSteps.length && requiredSteps.length > 0;

    return successResponse<SetupStatus>({
      isComplete,
      completionPercentage,
      steps,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check setup status");
  }
}
