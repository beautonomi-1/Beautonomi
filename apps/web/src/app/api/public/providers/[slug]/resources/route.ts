import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";

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
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;

    const supabase = getSupabaseAdmin();
    const rawSlug = (await params).slug;
    let slug: string;
    try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const { searchParams } = new URL(request.url);
    const serviceIdsParam = searchParams.get("service_ids");
    const serviceIds = serviceIdsParam
      ? serviceIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // Use admin client to bypass RLS — consistent with the SSR profile loader
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(isUuid ? "id" : "slug", slug)
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
