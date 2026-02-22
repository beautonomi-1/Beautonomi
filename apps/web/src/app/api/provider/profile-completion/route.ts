import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { 
  requireRoleInApi, getProviderIdForUser,
  successResponse,
  notFoundResponse, handleApiError,
 } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");


    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select(
        "id, business_name, description, phone, email, website, thumbnail_url, gallery, years_in_business",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (!provider) {
      return successResponse({
        completed: 0,
        total: 8,
        percentage: 0,
        items: [],
      });
    }

    const [
      { count: locationCount },
      { count: serviceCount },
      { count: _staffCount },
      { data: hoursData },
    ] = await Promise.all([
      supabaseAdmin
        .from("provider_locations")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId),
      supabaseAdmin
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId),
      supabaseAdmin
        .from("staff_members")
        .select("id", { count: "exact", head: true })
        .eq("provider_id", providerId),
      supabaseAdmin
        .from("operating_hours")
        .select("id")
        .eq("provider_id", providerId)
        .limit(1),
    ]);

    const items = [
      {
        id: "business_name",
        label: "Add business name",
        completed: !!provider.business_name,
        required: true,
        route: "/(app)/(tabs)/more/settings/business",
      },
      {
        id: "description",
        label: "Add business description",
        completed: !!provider.description,
        required: true,
        route: "/(app)/(tabs)/more/settings/business",
      },
      {
        id: "thumbnail",
        label: "Upload a logo or photo",
        completed: !!provider.thumbnail_url,
        required: true,
        route: "/(app)/(tabs)/more/settings/business",
      },
      {
        id: "contact",
        label: "Add phone & email",
        completed: !!provider.phone && !!provider.email,
        required: true,
        route: "/(app)/(tabs)/more/settings/business",
      },
      {
        id: "location",
        label: "Add at least one location",
        completed: (locationCount ?? 0) > 0,
        required: true,
        route: "/(app)/(tabs)/more/settings/locations",
      },
      {
        id: "services",
        label: "Create your first service",
        completed: (serviceCount ?? 0) > 0,
        required: true,
        route: "/(app)/(tabs)/more/catalogue",
      },
      {
        id: "hours",
        label: "Set operating hours",
        completed: (hoursData?.length ?? 0) > 0,
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
