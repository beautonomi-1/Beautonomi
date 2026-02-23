import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

interface Promotion {
  id: string;
  name: string;
  code: string;
  type: "percentage" | "fixed_amount";
  value: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  valid_from: string;
  valid_until: string;
  usage_limit?: number;
  usage_count: number;
  is_active: boolean;
  applicable_categories?: string[];
  applicable_providers?: string[];
}

/**
 * GET /api/admin/promotions
 * 
 * Get all promotions
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);

    const supabase = await getSupabaseServer(request);

    const { data: promotions, error } = await supabase
      .from("promotions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching promotions:", error);
      throw error;
    }

    // Transform database fields to frontend format
    const transformedPromotions = (promotions || []).map((p: any) => ({
      ...p,
      type: p.type === 'fixed' ? 'fixed_amount' : p.type, // Map 'fixed' to 'fixed_amount' for frontend
      start_date: p.valid_from,
      end_date: p.valid_until,
      min_purchase: p.min_purchase_amount,
      max_discount: p.max_discount_amount,
      used_count: p.usage_count,
      applicable_to: p.applicable_categories?.length > 0 
        ? "category" 
        : p.applicable_providers?.length > 0 
        ? "provider" 
        : "all",
    }));

    return successResponse(transformedPromotions as Promotion[]);
  } catch (error) {
    return handleApiError(error, "Failed to fetch promotions");
  }
}

/**
 * POST /api/admin/promotions
 * 
 * Create a new promotion
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const {
      name,
      code,
      type,
      value,
      min_purchase,
      max_discount,
      start_date,
      end_date,
      usage_limit,
      is_active,
      applicable_to: _applicable_to,
      applicable_categories,
      applicable_providers,
    } = body;

    if (!name || !code || !type || !value || !start_date || !end_date) {
      return errorResponse("name, code, type, value, start_date, and end_date are required", "VALIDATION_ERROR", 400);
    }

    // Convert date strings to ISO timestamps
    const valid_from = new Date(start_date).toISOString();
    const valid_until = new Date(end_date).toISOString();

    // Check if code already exists
    const { data: existing } = await supabase
      .from("promotions")
      .select("id")
      .eq("code", code.toUpperCase())
      .single();

    if (existing) {
      return errorResponse("Promotion code already exists", "DUPLICATE_CODE", 409);
    }

    // Map 'fixed_amount' to 'fixed' for database enum
    const dbType = type === 'fixed_amount' ? 'fixed' : type;

    const { data: promotion, error } = await supabase
      .from("promotions")
      .insert({
        name,
        code: code.toUpperCase(),
        type: dbType,
        value: parseFloat(value),
        min_purchase_amount: min_purchase ? parseFloat(min_purchase) : null,
        max_discount_amount: max_discount ? parseFloat(max_discount) : null,
        valid_from,
        valid_until,
        usage_limit: usage_limit ? parseInt(usage_limit) : null,
        usage_count: 0,
        is_active: is_active ?? true,
        applicable_categories: applicable_categories || [],
        applicable_providers: applicable_providers || [],
      })
      .select()
      .single();

    if (error || !promotion) {
      console.error("Error creating promotion:", error);
      throw error || new Error("Failed to create promotion");
    }

    // Transform response to match frontend format
    const transformedPromotion = {
      ...promotion,
      type: promotion.type === 'fixed' ? 'fixed_amount' : promotion.type, // Map 'fixed' to 'fixed_amount' for frontend
      start_date: promotion.valid_from,
      end_date: promotion.valid_until,
      min_purchase: promotion.min_purchase_amount,
      max_discount: promotion.max_discount_amount,
      used_count: promotion.usage_count,
      applicable_to: promotion.applicable_categories?.length > 0 
        ? "category" 
        : promotion.applicable_providers?.length > 0 
        ? "provider" 
        : "all",
    };

    return successResponse(transformedPromotion as Promotion);
  } catch (error) {
    return handleApiError(error, "Failed to create promotion");
  }
}

