import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/settings/business-details
 * Get provider business details settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    // Get provider data - use select with fallback for columns that might not exist yet
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("business_name, website")
      .eq("id", providerId)
      .single();

    if (providerError) {
      throw providerError;
    }

    // Get extended settings (columns that may not exist yet)
    const { data: extendedSettings } = await supabase
      .from("providers")
      .select("timezone, time_format, week_start, appointment_color_source, client_notification_language, default_team_language, social_media_links, years_in_business, languages_spoken")
      .eq("id", providerId)
      .single();

    // Parse social media links if it's a JSONB field
    const socialMediaLinks = extendedSettings?.social_media_links
      ? (typeof extendedSettings.social_media_links === 'string' 
          ? JSON.parse(extendedSettings.social_media_links || '{}')
          : extendedSettings.social_media_links)
      : {};

    // Parse languages_spoken if it's an array
    const languagesSpoken = extendedSettings?.languages_spoken
      ? (Array.isArray(extendedSettings.languages_spoken)
          ? extendedSettings.languages_spoken
          : typeof extendedSettings.languages_spoken === 'string'
          ? JSON.parse(extendedSettings.languages_spoken || '[]')
          : [])
      : ["English"];

    const result = {
      businessName: provider.business_name || "",
      timezone: extendedSettings?.timezone || "Africa/Johannesburg",
      timeFormat: extendedSettings?.time_format || "24h",
      weekStart: extendedSettings?.week_start || "monday",
      appointmentColorSource: extendedSettings?.appointment_color_source || "service",
      clientNotificationLanguage: extendedSettings?.client_notification_language || "en",
      defaultTeamLanguage: extendedSettings?.default_team_language || "en",
      website: provider.website || "",
      facebook: socialMediaLinks.facebook || "",
      instagram: socialMediaLinks.instagram || "",
      x: socialMediaLinks.x || socialMediaLinks.twitter || "",
      linkedin: socialMediaLinks.linkedin || "",
      other: socialMediaLinks.other || "",
      yearsInBusiness: extendedSettings?.years_in_business || null,
      languagesSpoken: languagesSpoken,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load business details");
  }
}

/**
 * PATCH /api/provider/settings/business-details
 * Update provider business details settings
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const updates: any = {};

    if (body.businessName !== undefined) {
      updates.business_name = body.businessName;
    }
    if (body.timezone !== undefined) {
      updates.timezone = body.timezone;
    }
    if (body.timeFormat !== undefined) {
      updates.time_format = body.timeFormat;
    }
    if (body.weekStart !== undefined) {
      updates.week_start = body.weekStart;
    }
    if (body.appointmentColorSource !== undefined) {
      updates.appointment_color_source = body.appointmentColorSource;
    }
    if (body.clientNotificationLanguage !== undefined) {
      updates.client_notification_language = body.clientNotificationLanguage;
    }
    if (body.defaultTeamLanguage !== undefined) {
      updates.default_team_language = body.defaultTeamLanguage;
    }
    if (body.website !== undefined) {
      updates.website = body.website;
    }
    if (body.yearsInBusiness !== undefined) {
      updates.years_in_business = body.yearsInBusiness === "" || body.yearsInBusiness === null ? null : Number(body.yearsInBusiness);
    }
    if (body.languagesSpoken !== undefined) {
      updates.languages_spoken = Array.isArray(body.languagesSpoken) ? body.languagesSpoken : [];
    }

    // Handle social media links
    if (body.facebook !== undefined || body.instagram !== undefined || body.x !== undefined || body.linkedin !== undefined || body.other !== undefined) {
      // Get existing social media links
      const { data: existing } = await supabase
        .from("providers")
        .select("social_media_links")
        .eq("id", providerId)
        .single();

      const existingLinks = existing?.social_media_links
        ? (typeof existing.social_media_links === 'string'
            ? JSON.parse(existing.social_media_links || '{}')
            : existing.social_media_links)
        : {};

      const socialMediaLinks = {
        ...existingLinks,
        ...(body.facebook !== undefined && { facebook: body.facebook }),
        ...(body.instagram !== undefined && { instagram: body.instagram }),
        ...(body.x !== undefined && { x: body.x }),
        ...(body.linkedin !== undefined && { linkedin: body.linkedin }),
        ...(body.other !== undefined && { other: body.other }),
      };

      updates.social_media_links = socialMediaLinks;
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to update business details");
  }
}
