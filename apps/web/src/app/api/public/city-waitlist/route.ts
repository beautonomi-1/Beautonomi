import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createCityWaitlistSchema = z.object({
  city_name: z.string().min(1, "City name is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  is_building_owner: z.boolean().optional().default(false),
  building_address: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/public/city-waitlist
 * 
 * Join city waitlist (public endpoint, no auth required)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = createCityWaitlistSchema.safeParse(body);

    if (!validationResult.success) {
      return handleApiError(
        new Error(validationResult.error.issues.map((e: any) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const data = validationResult.data;
    const supabase = await getSupabaseServer();

    // Get user_id if authenticated
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    // Check for duplicate entries (same email or phone for same city)
    if (data.email || data.phone) {
      let duplicateQuery = supabase
        .from('city_waitlist')
        .select('id')
        .eq('city_name', data.city_name)
        .eq('status', 'pending');

      if (data.email && data.phone) {
        duplicateQuery = duplicateQuery.or(`email.eq.${data.email.trim()},phone.eq.${data.phone.trim()}`);
      } else if (data.email) {
        duplicateQuery = duplicateQuery.eq('email', data.email.trim());
      } else if (data.phone) {
        duplicateQuery = duplicateQuery.eq('phone', data.phone.trim());
      }

      const { data: existing } = await duplicateQuery.limit(1).maybeSingle();

      if (existing) {
        return handleApiError(
          new Error("You're already on the waitlist for this city"),
          "You're already on the waitlist for this city",
          "DUPLICATE_ENTRY",
          409
        );
      }
    }

    // Create waitlist entry
    const { data: entry, error: insertError } = await supabase
      .from('city_waitlist')
      .insert({
        user_id: userId,
        city_name: data.city_name.trim(),
        name: data.name.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        is_building_owner: data.is_building_owner || false,
        building_address: data.building_address?.trim() || null,
        notes: data.notes?.trim() || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return successResponse({
      entry: {
        id: entry.id,
        city_name: entry.city_name,
        name: entry.name,
        message: "Successfully joined the waitlist! We'll notify you when Beautonomi becomes available in your city.",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to join city waitlist");
  }
}
