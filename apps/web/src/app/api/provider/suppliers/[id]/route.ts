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
import type { SupplierResponse } from "../route";

const LEGACY_PREFIX = "legacy:";

function isLegacyId(id: string): boolean {
  return id.startsWith(LEGACY_PREFIX);
}

/**
 * GET /api/provider/suppliers/[id]
 * Returns a single supplier. Legacy ids (legacy:...) return 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    if (isLegacyId(id)) {
      return notFoundResponse("Supplier not found");
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: row, error } = await supabase
      .from("product_suppliers")
      .select("id, name, contact_name, email, phone, address, website, notes, category, status, created_at")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !row) {
      return notFoundResponse("Supplier not found");
    }

    const { count: productCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("supplier", row.name);

    const response: SupplierResponse = {
      id: row.id,
      name: row.name,
      email: row.email ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      website: row.website ?? null,
      notes: row.notes ?? null,
      category: row.category || "general",
      status: (row.status as "active" | "inactive") || "active",
      product_count: productCount ?? 0,
      total_orders: 0,
      created_at: row.created_at ?? null,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to fetch supplier");
  }
}

/**
 * PATCH /api/provider/suppliers/[id]
 * Update a supplier. Legacy ids return 404.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_products", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    if (isLegacyId(id)) {
      return notFoundResponse("Supplier not found");
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.contact_name !== undefined) updateData.contact_name = body.contact_name ? String(body.contact_name).trim() : null;
    if (body.email !== undefined) updateData.email = body.email != null && String(body.email).trim() ? String(body.email).trim() : null;
    if (body.phone !== undefined) updateData.phone = body.phone != null && String(body.phone).trim() ? String(body.phone).trim() : null;
    if (body.address !== undefined) updateData.address = body.address != null && String(body.address).trim() ? String(body.address).trim() : null;
    if (body.website !== undefined) updateData.website = body.website != null && String(body.website).trim() ? String(body.website).trim() : null;
    if (body.notes !== undefined) updateData.notes = body.notes != null && String(body.notes).trim() ? String(body.notes).trim() : null;
    if (body.category !== undefined && ["hair", "skincare", "nails", "equipment", "general"].includes(body.category)) {
      updateData.category = body.category;
    }
    if (body.status !== undefined && (body.status === "active" || body.status === "inactive")) {
      updateData.status = body.status;
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const { data: updated, error } = await supabase
      .from("product_suppliers")
      .update(updateData)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select("id, name, email, phone, address, website, notes, category, status, created_at")
      .single();

    if (error) throw error;
    if (!updated) {
      return notFoundResponse("Supplier not found");
    }

    const { count: productCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("supplier", updated.name);

    const response: SupplierResponse = {
      id: updated.id,
      name: updated.name,
      email: updated.email ?? null,
      phone: updated.phone ?? null,
      address: updated.address ?? null,
      website: updated.website ?? null,
      notes: updated.notes ?? null,
      category: updated.category || "general",
      status: (updated.status as "active" | "inactive") || "active",
      product_count: productCount ?? 0,
      total_orders: 0,
      created_at: updated.created_at ?? null,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to update supplier");
  }
}

/**
 * DELETE /api/provider/suppliers/[id]
 * Delete a supplier. Legacy ids return 404.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_products", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    if (isLegacyId(id)) {
      return notFoundResponse("Supplier not found");
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { error } = await supabase
      .from("product_suppliers")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) throw error;

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete supplier");
  }
}
