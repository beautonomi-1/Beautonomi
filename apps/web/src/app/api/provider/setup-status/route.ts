import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

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
 * Check provider setup completion status for quick start wizard
 * Uses service role client to bypass RLS (provider_staff may not have direct location access)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) {
      return successResponse<SetupStatus>({
        isComplete: false,
        completionPercentage: 0,
        steps: [],
      });
    }

    // Check provider status
    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select("id, status, business_name, description, gallery, thumbnail_url, avatar_url, business_type, website, years_in_business, languages_spoken, social_media_links")
      .eq("id", providerId)
      .single();

    if (!provider) {
      return successResponse<SetupStatus>({
        isComplete: false,
        completionPercentage: 0,
        steps: [],
      });
    }

    // Determine if provider is a freelancer or salon
    const isFreelancer = provider.business_type === "freelancer" || !provider.business_type;

    // Check if provider has profile details (name and description) - REQUIRED for public visibility
    // For freelancers: personal profile, for salons: business details
    // Check both business_name and description exist and are not empty
    // More lenient: allow if either field is filled OR if business_name has at least 2 characters
    const hasBusinessName = provider.business_name && 
                           typeof provider.business_name === 'string' && 
                           provider.business_name.trim().length > 1; // Allow names with 2+ chars
    const _hasDescription = provider.description && 
                           typeof provider.description === 'string' && 
                           provider.description.trim().length > 0;
    // Consider complete if business name exists (description is helpful but not strictly required)
    const hasProfileDetails = !!hasBusinessName;

    // Check if provider has at least one location - REQUIRED for search and discovery
    // Use service role to bypass RLS; include inactive locations (user may have deactivated)
    const { data: locations } = await supabaseAdmin
      .from("provider_locations")
      .select("id, address, address_line1, address_line2, city, state, country, postal_code, working_hours, latitude, longitude, name, is_active")
      .eq("provider_id", providerId);

    const hasServiceAddress = !!(locations && locations.length > 0);

    // Check if provider has profile photo (listing image, profile circle, or gallery) - REQUIRED for public pages
    const avatarUrl = (provider as { avatar_url?: string | null }).avatar_url;
    const hasProfilePhoto = !!(
      (provider.thumbnail_url && typeof provider.thumbnail_url === 'string' && provider.thumbnail_url.trim().length > 0) ||
      (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim().length > 0) ||
      (provider.gallery && Array.isArray(provider.gallery) && provider.gallery.length > 0)
    );

    // Check if provider has operating hours / availability set
    // Availability is tied to locations - booking system uses defaults when working_hours is null
    // If provider has at least one location, consider availability complete (defaults apply)
    const hasOperatingHours = !!(locations && locations.length > 0);

    // Check if provider has gallery images
    const hasGallery = provider.gallery && 
      Array.isArray(provider.gallery) && 
      provider.gallery.length > 0;

    // Check if provider has website URL (optional but recommended for SEO)
    const hasWebsite = !!(provider.website && 
      typeof provider.website === 'string' && 
      provider.website.trim().length > 0);

    // Check if provider has years in business (optional but builds trust)
    const hasYearsInBusiness = provider.years_in_business !== null && 
      provider.years_in_business !== undefined;

    // Check if provider has languages spoken (optional but helps with client matching)
    const hasLanguagesSpoken = provider.languages_spoken && 
      Array.isArray(provider.languages_spoken) && 
      provider.languages_spoken.length > 0;

    // Check if provider has social media links (optional but helps with marketing)
    const hasSocialMediaLinks = provider.social_media_links && 
      typeof provider.social_media_links === 'object' && 
      provider.social_media_links !== null &&
      Object.values(provider.social_media_links).some((link: any) => 
        link && typeof link === 'string' && link.trim().length > 0
      );

    // Run parallel queries for better performance
    const [servicesResult, _categoriesResult, yocoResult, bankAccountResult] = await Promise.all([
      // Check if provider has at least one active service/offering
      supabaseAdmin
        .from("offerings")
        .select("*", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_active", true),
      // Check if provider has categories (which may contain services)
      // Categories themselves don't count as services, but we check if they exist
      // The actual services are in offerings table with category_id
      supabaseAdmin
        .from("provider_categories")
        .select("*", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_active", true),
      // Check if provider has Yoco integration (payment setup)
      supabaseAdmin
        .from("provider_yoco_integrations")
        .select("*", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_active", true),
      // Check if provider has bank account/payout setup
      supabaseAdmin
        .from("provider_payout_accounts")
        .select("*", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("active", true),
    ]);

    // Check if provider has services (offerings table)
    // Note: Categories alone don't count - must have actual services
    const hasServices = (servicesResult.count || 0) > 0;
    
    const hasPaymentSetup = (yocoResult.count || 0) > 0;
    const hasPayoutSetup = (bankAccountResult.count || 0) > 0;

    // Check if user has completed their personal profile (user_profiles table)
    // This is especially important for freelancers who represent themselves personally
    const { data: userProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("id, about, school, work, location, languages, interests, decade_born, favorite_song, obsessed_with, fun_fact, useless_skill, biography_title, spend_time, pets")
      .eq("user_id", user.id)
      .maybeSingle();

    // Consider personal profile complete if user has:
    // - About/bio filled, OR
    // - At least 2 profile questions answered (more lenient), OR
    // - Any languages or interests filled
    const hasPersonalProfile = userProfile ? (
      (userProfile.about && typeof userProfile.about === 'string' && userProfile.about.trim().length > 0) ||
      ([
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
      ].filter(field => field && (typeof field === 'string' ? field.trim().length > 0 : true)).length >= 2) ||
      (userProfile.languages && Array.isArray(userProfile.languages) && userProfile.languages.length > 0) ||
      (userProfile.interests && Array.isArray(userProfile.interests) && userProfile.interests.length > 0)
    ) : false;

    // Define setup steps - language differs for freelancers vs salons
    const steps = [
      {
        id: "profile-details",
        title: isFreelancer ? "Complete Your Business Profile" : "Complete Business Details",
        description: isFreelancer 
          ? "Add your business name and description so customers can find and connect with you"
          : "Add your business name and description so customers can find and learn about your business",
        completed: hasProfileDetails,
        required: true,
        link: "/provider/settings/appointment-activity/business-details",
      },
      {
        id: "personal-profile",
        title: "Complete Personal Profile",
        description: isFreelancer
          ? "Add your personal information (about, work, location, etc.) to help customers get to know you better"
          : "Add your personal information to build trust with customers",
        completed: hasPersonalProfile,
        required: isFreelancer, // Required for freelancers, optional for salons
        link: "/profile/create-profile",
      },
      {
        id: "service-address",
        title: isFreelancer ? "Add Your Service Address" : "Add Your Business Location",
        description: isFreelancer
          ? "Set the address where you provide services from (like your home or studio) so customers can find you"
          : "Set your business location so customers can find you in search results",
        completed: hasServiceAddress,
        required: true,
        link: "/provider/settings/locations",
      },
      {
        id: "profile-photo",
        title: "Add Profile Photo",
        description: isFreelancer
          ? "Upload your photo to help customers recognize and trust you"
          : "Upload a profile photo to help customers recognize your business",
        completed: hasProfilePhoto,
        required: true,
        link: "/provider/settings/gallery",
      },
      {
        id: "services",
        title: "Add Your Services",
        description: "Add at least one service with pricing so customers can book",
        completed: hasServices,
        required: true,
        link: "/provider/catalogue/services",
      },
      {
        id: "availability",
        title: "Set Your Availability",
        description: isFreelancer
          ? "Set when you're available so customers know when they can book with you"
          : "Configure your operating hours so customers know when you're available",
        completed: hasOperatingHours,
        required: true,
        link: "/provider/settings/operating-hours",
      },
      {
        id: "gallery",
        title: isFreelancer ? "Add Portfolio Photos" : "Add Work Photos",
        description: isFreelancer
          ? "Upload photos of your completed work to showcase your skills and attract more customers"
          : "Upload photos of your completed work to attract more customers",
        completed: hasGallery,
        required: false,
        link: "/provider/settings/gallery",
      },
      {
        id: "website",
        title: "Add Website URL",
        description: "Add your website to improve SEO and help customers learn more about you",
        completed: hasWebsite,
        required: false,
        link: "/provider/settings/appointment-activity/business-details",
      },
      {
        id: "years-in-business",
        title: "Add Years in Business",
        description: "Share your experience to build trust with customers",
        completed: hasYearsInBusiness,
        required: false,
        link: "/provider/settings/appointment-activity/business-details",
      },
      {
        id: "languages",
        title: "Add Languages You Speak",
        description: "List the languages you can communicate in to help customers find you",
        completed: hasLanguagesSpoken,
        required: false,
        link: "/provider/settings/appointment-activity/business-details",
      },
      {
        id: "social-media",
        title: "Add Social Media Links",
        description: "Connect your social media accounts to increase visibility and engagement",
        completed: hasSocialMediaLinks,
        required: false,
        link: "/provider/settings/appointment-activity/business-details",
      },
      {
        id: "payment",
        title: "Set Up Payment Processing",
        description: "Connect Yoco to accept payments from customers",
        completed: hasPaymentSetup,
        required: true,
        link: "/provider/settings/sales/yoco-integration",
      },
      {
        id: "payout",
        title: "Set Up Payouts",
        description: "Add your bank account to receive payments",
        completed: hasPayoutSetup,
        required: true,
        link: "/provider/settings/payout-accounts",
      },
    ];

    const requiredSteps = steps.filter((step) => step.required);
    const completedRequiredSteps = requiredSteps.filter((step) => step.completed).length;
    const _totalSteps = steps.length;
    const _completedSteps = steps.filter((step) => step.completed).length;
    
    // Calculate percentage based on required steps only (for progress bar)
    // This ensures accuracy: if 3 of 7 required steps are done, it's 43% (rounded)
    const completionPercentage = requiredSteps.length > 0 
      ? Math.round((completedRequiredSteps / requiredSteps.length) * 100)
      : 0;
    
    // Setup is complete when all required steps are done
    const isComplete = completedRequiredSteps === requiredSteps.length && requiredSteps.length > 0;

    return successResponse<SetupStatus>({
      isComplete,
      completionPercentage,
      steps,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check setup status");
  }
}
