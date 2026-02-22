import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const addonSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  type: z.enum(["service", "product", "upgrade"]),
  category: z.string().optional().nullable(),
  price: z.number().min(0, "Price must be non-negative"),
  currency: z.string().length(3).default("ZAR"),
  duration_minutes: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  is_recommended: z.boolean().default(false),
  image_url: z.string().url().optional().nullable(),
  provider_id: z.string().uuid().optional().nullable(), // null = global addon
  service_ids: z.array(z.string().uuid()).optional().default([]), // Services this addon can be added to
  max_quantity: z.number().int().min(1).optional().nullable(),
  requires_service: z.boolean().default(false), // Can only be added with a service
  sort_order: z.number().int().default(0),
});

/**
 * GET /api/admin/addons
 * 
 * List all addons (global and provider-specific)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: "Server error", code: "SERVER_ERROR" } },
        { status: 500 }
      );
    }
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");
    const type = searchParams.get("type");
    const isActive = searchParams.get("is_active");

    let query = supabase
      .from("service_addons")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    } else if (auth.user.role === "provider_owner") {
      // Providers can only see their own addons; superadmin sees all
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("user_id", auth.user.id)
        .single();

      if (provider) {
        query = query.eq("provider_id", (provider as any).id);
      } else {
        return NextResponse.json({
          data: [],
          error: null,
        });
      }
    }

    if (type) {
      query = query.eq("type", type);
    }

    if (isActive !== null) {
      query = query.eq("is_active", isActive === "true");
    }

    const { data: addons, error } = await query;

    if (error) {
      console.error("Error fetching addons:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch addons",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Load service associations
    if (addons && addons.length > 0) {
      const addonIds = addons.map((a: any) => a.id);
      const { data: associations } = await (supabase as any)
        .from("service_addon_associations")
        .select("addon_id, service_id")
        .in("addon_id", addonIds);

      const addonsWithServices = addons.map((addon: any) => ({
        ...addon,
        service_ids: associations
          ?.filter((a: any) => a.addon_id === addon.id)
          .map((a: any) => a.service_id) || [],
      }));

      return NextResponse.json({
        data: addonsWithServices,
        error: null,
      });
    }

    return NextResponse.json({
      data: addons || [],
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/addons:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch addons",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/addons
 * 
 * Create a new addon
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["superadmin", "provider_owner"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: "Server error", code: "SERVER_ERROR" } },
        { status: 500 }
      );
    }
    const body = await request.json();

    const validationResult = addonSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Superadmin can set provider_id = null (global addon); provider_owner must use their provider
    if (auth.user.role === "provider_owner") {
      if (validationResult.data.provider_id) {
        const { data: provider } = await supabase
          .from("providers")
          .select("id")
          .eq("id", validationResult.data.provider_id)
          .eq("user_id", auth.user.id)
          .single();

        if (!provider) {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: "Provider not found or access denied",
                code: "FORBIDDEN",
              },
            },
            { status: 403 }
          );
        }
      } else {
        const { data: provider } = await supabase
          .from("providers")
          .select("id")
          .eq("user_id", auth.user.id)
          .single();

        if (provider) {
          validationResult.data.provider_id = (provider as any).id;
        } else {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: "Provider not found",
                code: "NOT_FOUND",
              },
            },
            { status: 404 }
          );
        }
      }
    }

    const { service_ids, ...addonData } = validationResult.data;

    const { data: addon, error } = await (supabase
      .from("service_addons") as any)
      .insert({
        ...addonData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !addon) {
      console.error("Error creating addon:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create addon",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Create service associations
    if (service_ids && service_ids.length > 0) {
      const associations = service_ids.map((serviceId: string) => ({
        addon_id: (addon as any).id,
        service_id: serviceId,
        created_at: new Date().toISOString(),
      }));

      await (supabase as any).from("service_addon_associations").insert(associations);
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.addon.create",
      entity_type: "service_addon",
      entity_id: (addon as any).id,
      metadata: { provider_id: (addon as any).provider_id || null, type: (addon as any).type, price: (addon as any).price, currency: (addon as any).currency },
    });

    return NextResponse.json({
      data: { ...(addon as Record<string, unknown>), service_ids },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/addons:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create addon",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
