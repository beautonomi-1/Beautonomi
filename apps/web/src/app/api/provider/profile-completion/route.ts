import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { locationHasOperatingHours } from "@/lib/provider/location-operating-hours";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select(
        "id, business_name, description, phone, email, website, thumbnail_url, gallery, years_in_business, avatar_url",
      )
      .eq("id", providerId)
      .maybeSingle();

    if (!provider) {
      return successResponse({
        completed: 0,
        total: 8,
        percentage: 0,
        items: [],
      });
    }

    const { data: accountUser } = await supabaseAdmin
      .from("users")
      .select("email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const hasBusinessName =
      typeof provider.business_name === "string" && provider.business_name.trim().length > 1;
    const hasDescription =
      typeof provider.description === "string" && provider.description.trim().length >= 10;
    const hasContactInfo =
      (typeof provider.phone === "string" && provider.phone.trim().length > 0) ||
      (typeof provider.email === "string" && provider.email.trim().length > 0) ||
      (typeof accountUser?.email === "string" && accountUser.email.trim().length > 0) ||
      (typeof accountUser?.phone === "string" && accountUser.phone.trim().length > 0);

    const avatarUrl = (provider as { avatar_url?: string | null }).avatar_url;
    const hasLogoOrPhoto = !!(
      (provider.thumbnail_url &&
        typeof provider.thumbnail_url === "string" &&
        provider.thumbnail_url.trim().length > 0) ||
      (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim().length > 0)
    );

    const [
      { data: locations },
      { count: activeOfferingCount },
    ] = await Promise.all([
      supabaseAdmin
        .from("provider_locations")
        .select("id, is_active, working_hours")
        .eq("provider_id", providerId),
      supabaseAdmin
        .from("offerings")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_active", true),
    ]);

    const activeLocations = (locations || []).filter((loc) => loc.is_active !== false);
    const locationCount = activeLocations.length;
    const hasOperatingHours = activeLocations.some((loc) =>
      locationHasOperatingHours(loc.working_hours),
    );

    const items = [
      {
        id: "business_name",
        label: "Add business name",
        completed: hasBusinessName,
        required: true,
        route: "/(app)/(tabs)/more/settings/business",
      },
      {
        id: "description",
        label: "Add business description (10+ characters)",
        completed: hasDescription,
        required: true,
        route: "/(app)/(tabs)/more/settings/business",
      },
      {
        id: "thumbnail",
        label: "Upload a logo or profile photo",
        completed: hasLogoOrPhoto,
        required: true,
        route: "/(app)/(tabs)/more/settings/business",
      },
      {
        id: "contact",
        label: "Add a phone or email on your profile",
        completed: hasContactInfo,
        required: true,
        route: "/(app)/(tabs)/more/settings/business",
      },
      {
        id: "location",
        label: "Add at least one location",
        completed: locationCount > 0,
        required: true,
        route: "/(app)/(tabs)/more/settings/locations",
      },
      {
        id: "services",
        label: "Add at least one active service",
        completed: (activeOfferingCount ?? 0) > 0,
        required: true,
        route: "/(app)/(tabs)/more/catalogue",
      },
      {
        id: "hours",
        label: "Set operating hours",
        completed: hasOperatingHours,
        required: true,
        route: "/(app)/(tabs)/more/settings/hours",
      },
      {
        id: "gallery",
        label: "Add portfolio photos",
        completed: (provider.gallery?.length ?? 0) > 0,
        required: false,
        route: "/(app)/(tabs)/more/gallery",
      },
    ];

    const completed = items.filter((i) => i.completed).length;
    const total = items.length;
    const percentage = Math.round((completed / total) * 100);

    return successResponse({
      completed,
      total,
      percentage,
      items,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch profile completion");
  }
}
