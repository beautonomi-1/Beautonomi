import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_ECOMMERCE } from "@/lib/admin-sections";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  buildOfferingInsertFromAddonBody,
  mapOfferingRowToAddonApi,
  OFFERING_ADDON_SELECT,
  shouldReturnEmptyForAddonTypeFilter,
  type OfferingAddonRow,
} from "@/lib/offerings/addon-offering-api";

const addonSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  type: z.enum(["service", "product", "upgrade"]),
  category: z.string().optional().nullable(),
  price: z.number().min(0, "Price must be non-negative"),
  currency: z.string().length(3).optional(),
  duration_minutes: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  is_recommended: z.boolean().default(false),
  image_url: z.string().url().optional().nullable(),
  provider_id: z.string().uuid().optional().nullable(),
  service_ids: z.array(z.string().uuid()).optional().default([]),
  max_quantity: z.number().int().min(1).optional().nullable(),
  requires_service: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

/**
 * GET /api/admin/addons
 *
 * List all addons (provider-scoped offerings)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);

    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");
    const type = searchParams.get("type");
    const isActive = searchParams.get("is_active");

    if (shouldReturnEmptyForAddonTypeFilter(type)) {
      return successResponse([]);
    }

    let query = admin
      .from("offerings")
      .select(OFFERING_ADDON_SELECT)
      .eq("service_type", "addon")
      .order("display_order", { ascending: true })
      .order("title", { ascending: true });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    if (isActive !== null && isActive !== "") {
      query = query.eq("is_active", isActive === "true");
    } else {
      query = query.eq("is_active", true);
    }

    const { data: addons, error } = await query;

    if (error) {
      console.error("Error fetching addons:", error);
      return errorResponse("Failed to fetch addons", "FETCH_ERROR", 500);
    }

    return successResponse((addons ?? []).map((row) => mapOfferingRowToAddonApi(row as OfferingAddonRow)));
  } catch (error) {
    console.error("Unexpected error in /api/admin/addons:", error);
    return handleApiError(error, "Failed to fetch addons");
  }
}

/**
 * POST /api/admin/addons
 *
 * Create a new addon
 */
export async function POST(request: NextRequest) {
  try {
    const { user: authUser } = await requireAdminSection(ADMIN_SECTION_ECOMMERCE, request);

    const admin = getSupabaseAdmin();
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
        { status: 400 },
      );
    }

    const {
      service_ids,
      provider_id,
      type: _type,
      max_quantity: _mq,
      requires_service: _rs,
      ...rest
    } = validationResult.data;

    if (!provider_id) {
      return errorResponse(
        "provider_id is required; addons are stored per provider offering.",
        "VALIDATION_ERROR",
        400,
      );
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const lastResortCurrency =
      (await getTenantRegionConfig(tenantId))?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const insertRow = buildOfferingInsertFromAddonBody(
      provider_id,
      { ...rest, service_ids },
      lastResortCurrency,
    );

    const { data: addon, error } = await admin
      .from("offerings")
      .insert(insertRow)
      .select(OFFERING_ADDON_SELECT)
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
        { status: 500 },
      );
    }

    const mapped = mapOfferingRowToAddonApi(addon as OfferingAddonRow);
    await writeAuditLog({
      actor_user_id: authUser.id,
      actor_role: authUser.role ?? "superadmin",
      action: "admin.addon.create",
      entity_type: "service_addon",
      entity_id: mapped.id,
      metadata: {
        provider_id,
        type: "service",
        price: mapped.price,
        currency: mapped.currency,
      },
    });

    return NextResponse.json({
      data: mapped,
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
      { status: 500 },
    );
  }
}
