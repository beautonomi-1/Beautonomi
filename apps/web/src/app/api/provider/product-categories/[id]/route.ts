import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data, error } = await supabase
      .from("provider_product_categories")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !data) return notFoundResponse("Category not found");
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch product category");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_products", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const { id } = await params;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = await request.json();
    const result = patchSchema.safeParse(body);
    if (!result.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      );
    }

    const { data: existing } = await supabase
      .from("provider_product_categories")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) return notFoundResponse("Category not found");

    const { data, error } = await supabase
      .from("provider_product_categories")
      .update(result.data)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update product category");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_products", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const { id } = await params;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: existing } = await supabase
      .from("provider_product_categories")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existing) return notFoundResponse("Category not found");

    const { error } = await supabase
      .from("provider_product_categories")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) throw error;
    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete product category");
  }
}
