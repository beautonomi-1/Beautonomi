import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/public/providers/[slug]/resources
 * Returns resources required or optional for the given service(s).
 * Query: service_ids=id1,id2 (offering IDs). If empty, returns all active resources for the provider.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const serviceIdsParam = searchParams.get("service_ids");
    const serviceIds = serviceIdsParam
      ? serviceIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", decodeURIComponent(slug))
      .eq("status", "active")
      .maybeSingle();

    if (providerError || !provider) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const providerId = (provider as { id: string }).id;

    if (serviceIds.length === 0) {
      const { data: resources, error: resError } = await supabase
        .from("resources")
        .select(`
          id,
          name,
          description,
          capacity,
          group_id,
          resource_groups(id, name)
        `)
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .order("name");

      if (resError) throw resError;

      const list = (resources || []).map((r: any) => {
        const group = Array.isArray(r.resource_groups) ? r.resource_groups[0] : r.resource_groups;
        return {
          id: r.id,
          name: r.name,
          description: r.description ?? null,
          capacity: r.capacity ?? 1,
          resource_group_id: r.group_id ?? null,
          resource_group_name: group?.name ?? null,
          is_required: false,
        };
      });
      return NextResponse.json({ data: list, resources: list, error: null });
    }

    const { data: offeringResources, error: orError } = await supabase
      .from("offering_resources")
      .select("resource_id, required")
      .in("offering_id", serviceIds);

    if (orError) throw orError;

    const resourceIds = [...new Set((offeringResources || []).map((r: any) => r.resource_id))];
    if (resourceIds.length === 0) {
      return NextResponse.json({ data: [], resources: [], error: null });
    }

    const requiredSet = new Set(
      (offeringResources || [])
        .filter((r: any) => r.required === true)
        .map((r: any) => r.resource_id)
    );

    const { data: resources, error: resError } = await supabase
      .from("resources")
      .select(`
        id,
        name,
        description,
        capacity,
        group_id,
        resource_groups(id, name)
      `)
      .in("id", resourceIds)
      .eq("is_active", true)
      .order("name");

    if (resError) throw resError;

    const list = (resources || []).map((r: any) => {
      const group = Array.isArray(r.resource_groups) ? r.resource_groups[0] : r.resource_groups;
      return {
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        capacity: r.capacity ?? 1,
        resource_group_id: r.group_id ?? null,
        resource_group_name: group?.name ?? null,
        is_required: requiredSet.has(r.id),
      };
    });

    return NextResponse.json({ data: list, resources: list, error: null });
  } catch (error) {
    console.error("Error in GET /api/public/providers/[slug]/resources:", error);
    return NextResponse.json(
      { data: null, resources: [], error: { message: "Failed to fetch resources", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
