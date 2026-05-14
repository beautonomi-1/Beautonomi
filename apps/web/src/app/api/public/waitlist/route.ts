import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizePublicStaffIdForDatabase } from "@beautonomi/utils";
import { zPublicBookingStaffIdOptional } from "@/lib/public-booking/zod-public-staff-id";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { checkPublicMutationRateLimit } from "@/lib/rate-limit/public-mutation";

const createWaitlistSchema = z.object({
  provider_id: z.string().uuid(),
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  service_id: z.string().uuid().optional(),
  staff_id: z.preprocess((v) => (v === "" ? undefined : v), zPublicBookingStaffIdOptional),
  preferred_date: z.string().date().optional(),
  preferred_time_start: z.string().regex(/^\d{2}:\d{2}$/).optional(), // HH:MM format
  preferred_time_end: z.string().regex(/^\d{2}:\d{2}$/).optional(), // HH:MM format
  notes: z.string().optional(),
});

/**
 * POST /api/public/waitlist
 * 
 * Add self to waitlist (public endpoint, no auth required)
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicMutationRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
    );
  }

  try {
    const body = await request.json();
    const validationResult = createWaitlistSchema.safeParse(body);

    if (!validationResult.success) {
      return handleApiError(
        new Error(validationResult.error.issues.map(e => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const data = validationResult.data;
    const staffForDb = data.staff_id
      ? normalizePublicStaffIdForDatabase(data.staff_id).dbStaffId
      : null;
    const supabase = await getSupabaseServer(request);

    // Check if provider allows online waitlist
    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('id, waitlist_online_enabled, waitlist_max_size')
      .eq('id', data.provider_id)
      .single();

    if (providerError || !provider) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    if (!provider.waitlist_online_enabled) {
      return handleApiError(
        new Error("Online waitlist is not enabled for this provider"),
        "Online waitlist is not enabled",
        "FEATURE_DISABLED",
        403
      );
    }

    // Check waitlist size limit
    if (provider.waitlist_max_size) {
      const { count } = await supabase
        .from('waitlist_entries')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', data.provider_id)
        .eq('status', 'waiting');

      if (count && count >= provider.waitlist_max_size) {
        return handleApiError(
          new Error("Waitlist is full"),
          "Waitlist is currently full. Please try again later.",
          "WAITLIST_FULL",
          409
        );
      }
    }

    // Get customer_id if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    const customerId = user?.id || null;

    // Create waitlist entry
    const { data: entry, error: insertError } = await supabase
      .from('waitlist_entries')
      .insert({
        provider_id: data.provider_id,
        customer_id: customerId,
        customer_name: data.customer_name,
        customer_email: data.customer_email || null,
        customer_phone: data.customer_phone || null,
        service_id: data.service_id || null,
        staff_id: staffForDb,
        preferred_date: data.preferred_date || null,
        preferred_time_start: data.preferred_time_start || null,
        preferred_time_end: data.preferred_time_end || null,
        notes: data.notes || null,
        status: 'waiting',
        priority: 0,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return successResponse({
      entry,
      message: "Added to waitlist successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to add to waitlist");
  }
}
