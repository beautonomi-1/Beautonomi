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

/** Shape returned to app (Suppliers screen) and compatible with product form (.name). */
export interface SupplierResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  category: string;
  status: "active" | "inactive";
  product_count: number;
  total_orders: number;
  created_at: string | null;
}

const LEGACY_PREFIX = "legacy:";

/**
 * GET /api/provider/suppliers
 *
 * Returns full Supplier[] for the provider:
 * - Rows from product_suppliers (with product_count from products.supplier = name).
 * - Legacy: distinct product.supplier names not in product_suppliers, as synthetic entries (id = "legacy:...").
 * Product form still works (uses .name); Suppliers screen gets full objects.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: rows, error: rowsError } = await supabase
      .from("product_suppliers")
      .select("id, name, contact_name, email, phone, address, website, notes, category, status, created_at")
      .eq("provider_id", providerId)
      .order("name");

    if (rowsError) throw rowsError;

    const managedNames = new Set((rows || []).map((r) => r.name.trim().toLowerCase()));

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("supplier")
      .eq("provider_id", providerId)
      .not("supplier", "is", null);

    if (productsError) throw productsError;

    const distinctFromProducts = Array.from(
      new Set((products || []).map((p) => (p.supplier || "").trim()).filter(Boolean))
    ).sort();

    const productCountBySupplier = new Map<string, number>();
    for (const p of products || []) {
      const s = (p.supplier || "").trim();
      if (!s) continue;
      productCountBySupplier.set(s, (productCountBySupplier.get(s) || 0) + 1);
    }

    const list: SupplierResponse[] = [];

    for (const r of rows || []) {
      const count = productCountBySupplier.get(r.name) ?? 0;
      list.push({
        id: r.id,
        name: r.name,
        email: r.email ?? null,
        phone: r.phone ?? null,
        address: r.address ?? null,
        website: r.website ?? null,
        notes: r.notes ?? null,
        category: r.category || "general",
        status: (r.status as "active" | "inactive") || "active",
        product_count: count,
        total_orders: 0,
        created_at: r.created_at ?? null,
      });
    }

    for (const name of distinctFromProducts) {
      if (managedNames.has(name.toLowerCase())) continue;
      const count = productCountBySupplier.get(name) ?? 0;
      list.push({
        id: LEGACY_PREFIX + encodeURIComponent(name),
        name,
        email: null,
        phone: null,
        address: null,
        website: null,
        notes: null,
        category: "general",
        status: "active",
        product_count: count,
        total_orders: 0,
        created_at: null,
      });
    }

    list.sort((a, b) => a.name.localeCompare(b.name));

    return successResponse(list);
  } catch (error) {
    return handleApiError(error, "Failed to fetch suppliers");
  }
}

/**
 * POST /api/provider/suppliers
 *
 * Create a supplier in product_suppliers. Accepts name + optional contact fields.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_products", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const {
      name,
      email,
      phone,
      address,
      website,
      notes,
      category,
      status,
    } = body;

    if (!name || !String(name).trim()) {
      return errorResponse("Supplier name is required", "VALIDATION_ERROR", 400);
    }

    const categoryVal = ["hair", "skincare", "nails", "equipment", "general"].includes(category)
      ? category
      : "general";
    const statusVal = status === "inactive" ? "inactive" : "active";

    const { data: inserted, error } = await supabase
      .from("product_suppliers")
      .insert({
        provider_id: providerId,
        name: String(name).trim(),
        contact_name: body.contact_name ? String(body.contact_name).trim() : null,
        email: email != null && String(email).trim() ? String(email).trim() : null,
        phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
        address: address != null && String(address).trim() ? String(address).trim() : null,
        website: website != null && String(website).trim() ? String(website).trim() : null,
        notes: notes != null && String(notes).trim() ? String(notes).trim() : null,
        category: categoryVal,
        status: statusVal,
      })
      .select("id, name, email, phone, address, website, notes, category, status, created_at")
      .single();

    if (error) throw error;
    if (!inserted) {
      return errorResponse("Failed to create supplier", "INSERT_ERROR", 500);
    }

    const { count: productCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("supplier", inserted.name);

    const response: SupplierResponse = {
      id: inserted.id,
      name: inserted.name,
      email: inserted.email ?? null,
      phone: inserted.phone ?? null,
      address: inserted.address ?? null,
      website: inserted.website ?? null,
      notes: inserted.notes ?? null,
      category: inserted.category || "general",
      status: (inserted.status as "active" | "inactive") || "active",
      product_count: productCount ?? 0,
      total_orders: 0,
      created_at: inserted.created_at ?? null,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to create supplier");
  }
}
