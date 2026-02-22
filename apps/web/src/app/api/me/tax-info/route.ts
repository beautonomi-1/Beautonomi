import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/tax-info
 * 
 * Get current user's tax information
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();

    // Get tax info from user_profiles table
    // Use a try-catch to handle cases where columns might not exist yet
    let profileData: any = null;
    let taxInfo: any = null;
    let vatId: string | null = null;

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("tax_info, vat_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        // If column doesn't exist, return null values instead of throwing
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('Tax columns may not exist in user_profiles table:', error.message);
          taxInfo = null;
          vatId = null;
        } else {
          throw error;
        }
      } else {
        profileData = data;
        taxInfo = profileData?.tax_info || null;
        vatId = profileData?.vat_id || null;
      }
    } catch (err: any) {
      // Handle column not found errors gracefully
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        console.warn('Tax columns may not exist in user_profiles table:', err.message);
        taxInfo = null;
        vatId = null;
      } else {
        throw err;
      }
    }

    return successResponse({
      tax_info: taxInfo,
      vat_id: vatId,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch tax information");
  }
}

/**
 * POST /api/me/tax-info
 * 
 * Create or update current user's tax information
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { country, tax_id, full_name, address } = body;

    const taxInfo = {
      country,
      tax_id,
      full_name,
      address,
      updated_at: new Date().toISOString(),
    };

    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    try {
      if (existingProfile) {
        // Update existing profile
        const { data, error } = await supabase
          .from("user_profiles")
          .update({ tax_info: taxInfo })
          .eq("user_id", user.id)
          .select("tax_info")
          .single();

        if (error) {
          // If column doesn't exist, provide helpful error
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('Tax information columns not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
          }
          throw error;
        }
        return successResponse(data?.tax_info || taxInfo);
      } else {
        // Create new profile with tax info
        const { data, error } = await supabase
          .from("user_profiles")
          .insert({
            user_id: user.id,
            tax_info: taxInfo,
          })
          .select("tax_info")
          .single();

        if (error) {
          // If column doesn't exist, provide helpful error
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('Tax information columns not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
          }
          throw error;
        }
        return successResponse(data?.tax_info || taxInfo);
      }
    } catch (err: any) {
      // Provide helpful error message for missing columns
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        throw new Error('Tax information columns not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "Failed to save tax information");
  }
}

/**
 * PATCH /api/me/tax-info
 * 
 * Update current user's tax information
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Get existing tax info
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("tax_info")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentTaxInfo = existingProfile?.tax_info || {};
    const updatedTaxInfo = {
      ...currentTaxInfo,
      ...body,
      updated_at: new Date().toISOString(),
    };

    // Update or insert
    const { data: profileData, error: checkError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    let result;
    if (profileData) {
      const { data, error } = await supabase
        .from("user_profiles")
        .update({ tax_info: updatedTaxInfo })
        .eq("user_id", user.id)
        .select("tax_info")
        .single();

      if (error) {
        throw error;
      }
      result = data?.tax_info || {};
    } else {
      const { data, error } = await supabase
        .from("user_profiles")
        .insert({
          user_id: user.id,
          tax_info: updatedTaxInfo,
        })
        .select("tax_info")
        .single();

      if (error) {
        throw error;
      }
      result = data?.tax_info || {};
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update tax information");
  }
}
