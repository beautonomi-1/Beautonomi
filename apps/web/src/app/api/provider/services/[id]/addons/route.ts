import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError, getProviderIdForUser, requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/services/[id]/addons
 * 
 * Get all add-ons applicable to a specific service
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serviceId } = await params;
    
    // Authenticate user
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    
    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // First get the service and verify it belongs to provider
    const { data: service, error: serviceError } = await supabase
      .from("offerings")
      .select("id, provider_id, title")
      .eq("id", serviceId)
      .eq("provider_id", providerId)
      .single();

    if (serviceError || !service) {
      return notFoundResponse("Service not found");
    }

    // Get all add-ons for this provider that are applicable to this service
    const { data: addons, error } = await supabase
      .from("offerings")
      .select(`
        id,
        title,
        description,
        price,
        duration_minutes,
        currency,
        addon_category,
        is_recommended,
        applicable_service_ids,
        display_order
      `)
      .eq("provider_id", service.provider_id)
      .eq("service_type", "addon")
      .eq("is_active", true)
      .or(`applicable_service_ids.is.null,applicable_service_ids.cs.{${serviceId}}`)
      .order("is_recommended", { ascending: false })
      .order("addon_category")
      .order("display_order");

    if (error) {
      throw error;
    }

    // Group add-ons by category
    const groupedAddons: Record<string, any[]> = {};
    
    (addons || []).forEach((addon: any) => {
      const category = addon.addon_category || "general";
      if (!groupedAddons[category]) {
        groupedAddons[category] = [];
      }
      groupedAddons[category].push(addon);
    });

    const mapped = (addons || []).map((a: any) => ({
      id: a.id,
      name: a.title,
      price: a.price,
      duration_minutes: a.duration_minutes,
      is_active: a.is_active ?? true,
      addon_category: a.addon_category,
      is_recommended: a.is_recommended,
      display_order: a.display_order,
    }));

    return successResponse(mapped);
  } catch (error) {
    return handleApiError(error, "Failed to fetch add-ons");
  }
}

/**
 * POST /api/provider/services/[id]/addons
 *
 * Create a new add-on for a service
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: serviceId } = await params;
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: service, error: serviceError } = await supabase
      .from("offerings")
      .select("id, provider_id")
      .eq("id", serviceId)
      .eq("provider_id", providerId)
      .single();

    if (serviceError || !service) return notFoundResponse("Service not found");

    const body = await request.json();
    const { name, price, duration_minutes } = body;

    if (!name || price == null) {
      return NextResponse.json({ error: "name and price are required" }, { status: 400 });
    }

    const { data: addon, error } = await supabase
      .from("offerings")
      .insert({
        provider_id: providerId,
        title: name,
        price: Number(price),
        duration_minutes: Number(duration_minutes) || 0,
        service_type: "addon",
        is_active: true,
        applicable_service_ids: [serviceId],
        currency: "ZAR",
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse(addon);
  } catch (error) {
    return handleApiError(error, "Failed to create add-on");
  }
}
