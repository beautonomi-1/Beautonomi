import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const notificationChannelSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  push: z.boolean().optional(),
});

const patchSchema = z.object({
  booking_updates: notificationChannelSchema.optional(),
  booking_cancellations: notificationChannelSchema.optional(),
  booking_reminders: notificationChannelSchema.optional(),
  new_reviews: notificationChannelSchema.optional(),
  review_responses: notificationChannelSchema.optional(),
  client_messages: notificationChannelSchema.optional(),
  payment_received: notificationChannelSchema.optional(),
  payout_updates: notificationChannelSchema.optional(),
  waitlist_notifications: notificationChannelSchema.optional(),
  system_updates: notificationChannelSchema.optional(),
  marketing: notificationChannelSchema.optional(),
  unsubscribe_marketing: z.boolean().optional(),
}).passthrough(); // Allow additional fields for flexibility

/**
 * GET /api/provider/notification-preferences
 * 
 * Get provider's notification preferences
 * Uses the same endpoint as /api/me/notification-preferences but scoped for providers
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    // For superadmin, allow viewing any provider's notification preferences
    let targetUserId: string = user.id;
    if (user.role === "superadmin") {
      const { searchParams } = new URL(request.url);
      const userIdParam = searchParams.get("user_id");
      const providerIdParam = searchParams.get("provider_id");
      
      if (userIdParam) {
        targetUserId = userIdParam;
      } else if (providerIdParam) {
        // Get user_id from provider_id
        const { data: provider, error: providerError } = await supabase
          .from("providers")
          .select("user_id")
          .eq("id", providerIdParam)
          .maybeSingle();
        
        if (providerError || !provider) {
          return errorResponse("Provider not found", "NOT_FOUND", 404);
        }
        targetUserId = provider.user_id;
      } else {
        return errorResponse("user_id or provider_id is required for superadmin", "VALIDATION_ERROR", 400);
      }
    }

    // Get notification preferences from user_profiles
    let profileData: any = null;
    let preferences: any = null;

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("notification_preferences")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('Notification preferences column may not exist:', error.message);
          profileData = null;
        } else {
          throw error;
        }
      } else {
        profileData = data;
      }
    } catch (err: any) {
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        console.warn('Notification preferences column may not exist:', err.message);
        profileData = null;
      } else {
        throw err;
      }
    }

    // Default notification preferences for providers
    const defaultPreferences = {
      booking_updates: { email: true, sms: true, push: true },
      booking_cancellations: { email: true, sms: true, push: true },
      booking_reminders: { email: true, sms: true, push: true },
      new_reviews: { email: true, sms: false, push: true },
      review_responses: { email: true, sms: false, push: true },
      client_messages: { email: true, sms: true, push: true },
      payment_received: { email: true, sms: false, push: true },
      payout_updates: { email: true, sms: true, push: true },
      waitlist_notifications: { email: true, sms: false, push: true },
      system_updates: { email: true, sms: false, push: false },
      marketing: { email: true, sms: false, push: false },
      unsubscribe_marketing: false,
    };

    preferences = profileData?.notification_preferences || defaultPreferences;

    return successResponse(preferences);
  } catch (error) {
    return handleApiError(error, "Failed to fetch notification preferences");
  }
}

/**
 * PATCH /api/provider/notification-preferences
 * 
 * Update provider's notification preferences
 */
export async function PATCH(request: NextRequest) {
  try {
    // Only provider owners and superadmins can update preferences
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validatedBody = patchSchema.parse(body);

    // For superadmin, allow updating any provider's notification preferences
    let targetUserId: string = user.id;
    if (user.role === "superadmin") {
      const { searchParams } = new URL(request.url);
      const userIdParam = searchParams.get("user_id");
      const providerIdParam = searchParams.get("provider_id");
      
      if (userIdParam) {
        targetUserId = userIdParam;
      } else if (providerIdParam) {
        // Get user_id from provider_id
        const { data: provider, error: providerError } = await supabase
          .from("providers")
          .select("user_id")
          .eq("id", providerIdParam)
          .maybeSingle();
        
        if (providerError || !provider) {
          return errorResponse("Provider not found", "NOT_FOUND", 404);
        }
        targetUserId = provider.user_id;
      } else {
        return errorResponse("user_id or provider_id is required for superadmin", "VALIDATION_ERROR", 400);
      }
    }

    // Get existing preferences
    let existingProfile: any = null;
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("notification_preferences")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('Notification preferences column may not exist:', error.message);
          existingProfile = null;
        } else {
          throw error;
        }
      } else {
        existingProfile = data;
      }
    } catch (err: any) {
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        console.warn('Notification preferences column may not exist:', err.message);
        existingProfile = null;
      } else {
        throw err;
      }
    }

    const defaultPreferences = {
      booking_updates: { email: true, sms: true, push: true },
      booking_cancellations: { email: true, sms: true, push: true },
      booking_reminders: { email: true, sms: true, push: true },
      new_reviews: { email: true, sms: false, push: true },
      review_responses: { email: true, sms: false, push: true },
      client_messages: { email: true, sms: true, push: true },
      payment_received: { email: true, sms: false, push: true },
      payout_updates: { email: true, sms: true, push: true },
      waitlist_notifications: { email: true, sms: false, push: true },
      system_updates: { email: true, sms: false, push: false },
      marketing: { email: true, sms: false, push: false },
      unsubscribe_marketing: false,
    };

    const currentPreferences = existingProfile?.notification_preferences || defaultPreferences;
    
    // Merge with new preferences (deep merge for nested objects)
    const updatedPreferences: any = { ...currentPreferences };
    
    for (const [key, value] of Object.entries(validatedBody)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        updatedPreferences[key] = { ...updatedPreferences[key], ...value };
      } else {
        updatedPreferences[key] = value;
      }
    }

    // Update or insert
    let profileData: any = null;
    try {
      const { data, error: checkError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      profileData = data;
    } catch (err: any) {
      if (err.code !== 'PGRST116') {
        throw err;
      }
    }

    let result;
    try {
      if (profileData) {
        const { data, error } = await supabase
          .from("user_profiles")
          .update({ notification_preferences: updatedPreferences })
          .eq("user_id", targetUserId)
          .select("notification_preferences")
          .single();

        if (error) {
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('Notification preferences column not found. Please run database migration.');
          }
          throw error;
        }
        result = data?.notification_preferences || {};
      } else {
        const { data, error } = await supabase
          .from("user_profiles")
          .insert({
            user_id: targetUserId,
            notification_preferences: updatedPreferences,
          })
          .select("notification_preferences")
          .single();

        if (error) {
          if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
            throw new Error('Notification preferences column not found. Please run database migration.');
          }
          throw error;
        }
        result = data?.notification_preferences || {};
      }
    } catch (err: any) {
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        throw new Error('Notification preferences column not found. Please run database migration.');
      }
      throw err;
    }

    return successResponse(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        `Validation error: ${error.issues.map(e => e.message).join(", ")}`,
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to update notification preferences");
  }
}
