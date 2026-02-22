import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const packageItemSchema = z.object({
  offering_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  quantity: z.number().int().positive().default(1),
}).refine(
  (data) => (data.offering_id !== undefined) !== (data.product_id !== undefined),
  {
    message: "Either offering_id or product_id must be provided, but not both",
  }
);

const updatePackageSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  currency: z.string().optional(),
  discount_percentage: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
  items: z.array(packageItemSchema).optional(),
});

/**
 * GET /api/provider/packages/[id]
 * 
 * Get a specific service package
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: packageData, error } = await supabase
      .from("service_packages")
      .select(`
        *,
        items:service_package_items(
          id,
          offering_id,
          product_id,
          quantity,
          offerings:offering_id(
            id,
            title,
            duration_minutes,
            price
          ),
          products:product_id(
            id,
            name,
            retail_price,
            sku,
            brand
          )
        )
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !packageData) {
      return notFoundResponse("Package not found");
    }

    return successResponse({ package: packageData });
  } catch (error) {
    return handleApiError(error, "Failed to fetch package");
  }
}

/**
 * PATCH /api/provider/packages/[id]
 * 
 * Update a service package
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const validated = updatePackageSchema.parse(body);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify package belongs to provider
    const { data: existingPackage } = await supabase
      .from("service_packages")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingPackage) {
      return notFoundResponse("Package not found");
    }

    // Update package fields
    const updateData: any = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.price !== undefined) updateData.price = validated.price;
    if (validated.currency !== undefined) updateData.currency = validated.currency;
    if (validated.discount_percentage !== undefined) updateData.discount_percentage = validated.discount_percentage;
    if (validated.is_active !== undefined) updateData.is_active = validated.is_active;

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("service_packages")
        .update(updateData)
        .eq("id", id);

      if (updateError) {
        throw updateError;
      }
    }

    // Update items if provided
    if (validated.items) {
      // Delete existing items
      await supabase
        .from("service_package_items")
        .delete()
        .eq("package_id", id);

      // Insert new items
      const items = validated.items.map((item) => ({
        package_id: id,
        ...(item.offering_id ? { offering_id: item.offering_id } : {}),
        ...(item.product_id ? { product_id: item.product_id } : {}),
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("service_package_items")
        .insert(items);

      if (itemsError) {
        throw itemsError;
      }
    }

    // Fetch updated package
    const { data: updatedPackage } = await supabase
      .from("service_packages")
      .select(`
        *,
        items:service_package_items(
          id,
          offering_id,
          product_id,
          quantity,
          offerings:offering_id(
            id,
            title,
            duration_minutes,
            price
          ),
          products:product_id(
            id,
            name,
            retail_price,
            sku,
            brand
          )
        )
      `)
      .eq("id", id)
      .single();

    return successResponse({
      package: updatedPackage,
      message: "Package updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to update package");
  }
}

/**
 * DELETE /api/provider/packages/[id]
 * 
 * Delete a service package
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify package belongs to provider
    const { data: existingPackage } = await supabase
      .from("service_packages")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingPackage) {
      return notFoundResponse("Package not found");
    }

    // Delete package (items will be cascade deleted)
    const { error } = await supabase
      .from("service_packages")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({
      message: "Package deleted successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete package");
  }
}
