import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const visibilityModeSchema = z.enum(["all", "booked_only", "none"]);

const customerVisibilityUpdateSchema = z.object({
  show_customer_list_to_salon: z.boolean().optional(),
  show_salon_list_to_customer: z.boolean().optional(),
  customer_visibility_mode: visibilityModeSchema.optional(),
  salon_visibility_mode: visibilityModeSchema.optional(),
}).partial();

/**
 * GET /api/provider/customer-visibility
 * 
 * Get provider's customer visibility settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    const { data: settings, error } = await supabase
      .from('provider_customer_visibility_settings')
      .select('*')
      .eq('provider_id', providerId)
      .single();

    // Return default if not found
    if (error && error.code === 'PGRST116') {
      return successResponse({
        show_customer_list_to_salon: false,
        show_salon_list_to_customer: false,
        customer_visibility_mode: "none",
        salon_visibility_mode: "none",
      });
    }

    if (error) {
      throw error;
    }

    return successResponse({
      show_customer_list_to_salon: settings?.show_customer_list_to_salon ?? false,
      show_salon_list_to_customer: settings?.show_salon_list_to_customer ?? false,
      customer_visibility_mode: settings?.customer_visibility_mode || "none",
      salon_visibility_mode: settings?.salon_visibility_mode || "none",
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer visibility settings');
  }
}

/**
 * PATCH /api/provider/customer-visibility
 * 
 * Update provider's customer visibility settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const body = await request.json();

    // Validate input
    const validatedData = customerVisibilityUpdateSchema.parse(body);

    const { data: settings, error } = await supabase
      .from('provider_customer_visibility_settings')
      .upsert(
        {
          provider_id: providerId,
          ...validatedData,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'provider_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to update customer visibility settings');
  }
}
