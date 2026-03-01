import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/settings/business
 * Returns business details for the current provider in the shape expected by the provider app (snake_case).
 * Used by More → Settings → Business so persisted data is visible before editing.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get all provider business fields (match providers table columns)
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select(
        "id, business_name, business_type, description, email, phone, website, thumbnail_url, avatar_url, timezone, time_format, week_start, appointment_color_source, client_notification_language, default_team_language, social_media_links, years_in_business, languages_spoken"
      )
      .eq("id", providerId)
      .single();

    if (providerError) {
      throw providerError;
    }

    const socialMediaLinks = provider?.social_media_links
      ? typeof provider.social_media_links === "string"
        ? JSON.parse(provider.social_media_links || "{}")
        : provider.social_media_links
      : {};

    // Primary or first location for address (optional)
    let loc: { address_line1?: string; city?: string; state?: string; postal_code?: string; country?: string } | null = null;
    const { data: primaryLocation } = await supabase
      .from("provider_locations")
      .select("address_line1, city, state, postal_code, country")
      .eq("provider_id", providerId)
      .eq("is_primary", true)
      .maybeSingle();
    if (primaryLocation) {
      loc = primaryLocation;
    } else {
      const { data: firstLocation } = await supabase
        .from("provider_locations")
        .select("address_line1, city, state, postal_code, country")
        .eq("provider_id", providerId)
        .limit(1)
        .maybeSingle();
      loc = firstLocation;
    }

    // Return snake_case shape expected by provider app BusinessDetails
    const result = {
      id: provider.id,
      business_name: provider.business_name ?? "",
      business_type: provider.business_type ?? "salon",
      description: provider.description ?? null,
      email: provider.email ?? "",
      phone: provider.phone ?? "",
      website: provider.website ?? null,
      logo_url: provider.thumbnail_url ?? null,
      avatar_url: (provider as any).avatar_url ?? null,
      address_line1: loc?.address_line1 ?? null,
      city: loc?.city ?? null,
      state: loc?.state ?? null,
      postal_code: loc?.postal_code ?? null,
      country: loc?.country ?? null,
      instagram_url: socialMediaLinks.instagram ?? null,
      facebook_url: socialMediaLinks.facebook ?? null,
      tiktok_url: socialMediaLinks.tiktok ?? null,
      twitter_url: socialMediaLinks.x ?? socialMediaLinks.twitter ?? null,
      // Keep camelCase for any consumer that still uses business-details shape
      timezone: provider.timezone ?? "Africa/Johannesburg",
      timeFormat: provider.time_format ?? "24h",
      weekStart: provider.week_start ?? "monday",
      appointmentColorSource: provider.appointment_color_source ?? "service",
      clientNotificationLanguage: provider.client_notification_language ?? "en",
      defaultTeamLanguage: provider.default_team_language ?? "en",
      yearsInBusiness: provider.years_in_business ?? null,
      languagesSpoken: Array.isArray(provider.languages_spoken)
        ? provider.languages_spoken
        : typeof provider.languages_spoken === "string"
          ? JSON.parse(provider.languages_spoken || "[]")
          : ["English"],
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load business details");
  }
}

/**
 * PATCH /api/provider/settings/business
 * Update business details. Accepts both snake_case (provider app) and camelCase (web) fields.
 */
export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const updates: Record<string, unknown> = {};

    // Snake_case (provider app)
    if (body.business_name !== undefined) updates.business_name = body.business_name;
    if (body.business_type !== undefined) updates.business_type = body.business_type;
    if (body.description !== undefined) updates.description = body.description;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.website !== undefined) updates.website = body.website;

    // CamelCase (web / business-details)
    if (body.businessName !== undefined) updates.business_name = body.businessName;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.timeFormat !== undefined) updates.time_format = body.timeFormat;
    if (body.weekStart !== undefined) updates.week_start = body.weekStart;
    if (body.appointmentColorSource !== undefined) {
      updates.appointment_color_source = body.appointmentColorSource;
    }
    if (body.clientNotificationLanguage !== undefined) {
      updates.client_notification_language = body.clientNotificationLanguage;
    }
    if (body.defaultTeamLanguage !== undefined) {
      updates.default_team_language = body.defaultTeamLanguage;
    }
    if (body.yearsInBusiness !== undefined) {
      updates.years_in_business =
        body.yearsInBusiness === "" || body.yearsInBusiness === null
          ? null
          : Number(body.yearsInBusiness);
    }
    if (body.languagesSpoken !== undefined) {
      updates.languages_spoken = Array.isArray(body.languagesSpoken)
        ? body.languagesSpoken
        : [];
    }

    // Social: snake_case (app) and camelCase (web)
    const hasSocial =
      body.facebook !== undefined ||
      body.instagram !== undefined ||
      body.x !== undefined ||
      body.linkedin !== undefined ||
      body.other !== undefined ||
      body.facebook_url !== undefined ||
      body.instagram_url !== undefined ||
      body.twitter_url !== undefined ||
      body.tiktok_url !== undefined;
    if (hasSocial) {
      const { data: existing } = await supabase
        .from("providers")
        .select("social_media_links")
        .eq("id", providerId)
        .single();

      const existingLinks = existing?.social_media_links
        ? typeof existing.social_media_links === "string"
          ? JSON.parse(existing.social_media_links || "{}")
          : existing.social_media_links
        : {};

      const socialMediaLinks = {
        ...existingLinks,
        ...(body.facebook !== undefined && { facebook: body.facebook }),
        ...(body.instagram !== undefined && { instagram: body.instagram }),
        ...(body.x !== undefined && { x: body.x }),
        ...(body.linkedin !== undefined && { linkedin: body.linkedin }),
        ...(body.other !== undefined && { other: body.other }),
        ...(body.facebook_url !== undefined && { facebook: body.facebook_url }),
        ...(body.instagram_url !== undefined && { instagram: body.instagram_url }),
        ...(body.twitter_url !== undefined && { x: body.twitter_url }),
        ...(body.tiktok_url !== undefined && { tiktok: body.tiktok_url }),
      };

      updates.social_media_links = socialMediaLinks;
    }

    // Logo: accept HTTP URL (web) or data URL (mobile app base64). Data URLs are uploaded to storage.
    if (body.logo_base64 !== undefined && body.logo_base64 !== "") {
      const logo = body.logo_base64 as string;
      if (logo.startsWith("http")) {
        updates.thumbnail_url = logo;
      } else if (logo.startsWith("data:")) {
        try {
          const response = await fetch(logo);
          const blob = await response.blob();
          const fileExt = blob.type?.split("/")[1] || "jpg";
          const fileName = `${providerId}/thumbnail-${Date.now()}.${fileExt}`;
          const supabaseAdmin = getSupabaseAdmin();
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from("provider-gallery")
            .upload(fileName, blob, {
              contentType: blob.type || "image/jpeg",
              cacheControl: "3600",
              upsert: true,
            });
          if (!uploadError && uploadData?.path) {
            const { data: { publicUrl } } = supabaseAdmin.storage
              .from("provider-gallery")
              .getPublicUrl(uploadData.path);
            updates.thumbnail_url = publicUrl;
          }
        } catch (e) {
          console.error("Business logo upload failed:", e);
        }
      }
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

    // Address: update primary or first provider_location if address fields sent
    const hasAddress =
      body.address_line1 !== undefined ||
      body.city !== undefined ||
      body.state !== undefined ||
      body.postal_code !== undefined ||
      body.country !== undefined;
    if (hasAddress) {
      let locId: string | null = null;
      const { data: primaryLoc } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("provider_id", providerId)
        .eq("is_primary", true)
        .maybeSingle();
      if (primaryLoc?.id) locId = primaryLoc.id;
      else {
        const { data: firstLoc } = await supabase
          .from("provider_locations")
          .select("id")
          .eq("provider_id", providerId)
          .limit(1)
          .maybeSingle();
        if (firstLoc?.id) locId = firstLoc.id;
      }

      if (locId) {
        const locUpdates: Record<string, unknown> = {};
        if (body.address_line1 !== undefined) locUpdates.address_line1 = body.address_line1;
        if (body.city !== undefined) locUpdates.city = body.city;
        if (body.state !== undefined) locUpdates.state = body.state;
        if (body.postal_code !== undefined) locUpdates.postal_code = body.postal_code;
        if (body.country !== undefined) locUpdates.country = body.country;
        if (Object.keys(locUpdates).length > 0) {
          await supabase.from("provider_locations").update(locUpdates).eq("id", locId);
        }
      }
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to update business details");
  }
}
