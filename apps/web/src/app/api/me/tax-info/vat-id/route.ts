import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * PATCH /api/me/tax-info/vat-id
 * 
 * Update current user's VAT ID
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { vat_id } = body;

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
          .update({ vat_id })
          .eq("user_id", user.id)
          .select("vat_id")
          .single();

        if (error) {
          // If column doesn't exist, provide helpful error
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('VAT ID column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
          }
          throw error;
        }
        return successResponse({ vat_id: data?.vat_id || null });
      } else {
        // Create new profile with VAT ID
        const { data, error } = await supabase
          .from("user_profiles")
          .insert({
            user_id: user.id,
            vat_id,
          })
          .select("vat_id")
          .single();

        if (error) {
          // If column doesn't exist, provide helpful error
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('VAT ID column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
          }
          throw error;
        }
        return successResponse({ vat_id: data?.vat_id || null });
      }
    } catch (err: any) {
      // Provide helpful error message for missing columns
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        throw new Error('VAT ID column not found. Please run database migration 105_add_tax_info_to_user_profiles.sql');
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "Failed to update VAT ID");
  }
}
