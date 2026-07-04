import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {  requireRoleInApi, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { geocodeProviderLocation } from "@/lib/mapbox/geocodeProviderLocation";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { syncVariantOfferings } from "../services/_helpers/sync-variants";
import { buildOnboardingCompletionResponse } from "@/lib/provider/build-onboarding-completion-response";
import { markProviderOnboardingLifecycleComplete } from "@/lib/provider-ops/mark-provider-onboarding-lifecycle-complete";
import { inferProviderTimezoneFromLocation } from "@/lib/regions/infer-provider-timezone";
import { resolveVerificationPolicy, isProviderVerificationApproved } from "@/lib/verification/verification-policy";

const slugifyCategory = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "uncategorized";

const onboardingSchema = z.object({
  // New fields
  team_size: z.enum(["freelancer", "small", "medium", "large"]).optional().nullable(),
  owner_name: z.string().min(1, "Owner name is required").optional(),
  owner_email: z.string().email("Invalid email address").optional(),
  owner_phone: z.string().min(1, "Phone is required").optional(),
  // Terminal capture (replaces yoco_machine)
  terminal_ownership_status: z.enum(["has_terminal", "no_terminal", "planning_to_get_terminal", "unsure"]).optional().nullable(),
  terminal_provider: z.string().optional().nullable(),
  terminal_provider_other: z.string().optional().nullable(),
  terminal_count_range: z.enum(["one", "two_to_three", "four_to_ten", "more_than_ten", "unsure"]).optional().nullable(),
  terminal_active_usage_status: z.enum(["yes", "no", "sometimes", "unsure"]).optional().nullable(),
  interested_in_platform_terminal: z.enum(["yes", "maybe_later", "no"]).optional().nullable(),
  interested_in_terminal_subscription: z.boolean().optional().nullable(),
  payroll_type: z.enum(["commission", "hourly", "both", "other"]).optional().nullable(),
  payroll_details: z.string().optional().nullable(),
  is_vat_registered: z.boolean().optional().nullable(),
  vat_number: z.string().optional().nullable(),
  // Business fields
  business_name: z.string().min(1, "Business name is required"),
  business_type: z.enum(["salon", "mobile", "both"]),
  description: z.string().optional().nullable(),
  previous_software: z.string().optional().nullable(),
  previous_software_other: z.string().optional().nullable(),
  // Legacy fields (for backward compatibility)
  phone: z.string().min(1, "Phone is required").optional(),
  email: z.string().email("Invalid email address").optional(),
  address: z.object({
    line1: z.string().min(1, "Address line 1 is required"),
    line2: z.string().optional().nullable(),
    city: z.string().min(1, "City is required"),
    state: z.string().optional().nullable(), // Optional to match UI
    postal_code: z.string().optional().nullable(), // Optional to match UI
    country: z.string().min(1, "Country is required"),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
  }),
  global_category_ids: z.array(z.string().uuid()).min(1, "At least one category is required"),
  // §provider-launch (2026-06): provider-owned menu categories from the wizard.
  // Each optionally maps to a global category for marketplace discovery.
  provider_categories: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        global_category_id: z.string().uuid().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
  selected_zone_ids: z.array(z.string().uuid()).optional().default([]),
  // §provider-launch (2026-06): travel-fee intent captured in the wizard for
  // mobile / both providers. When omitted or `use_platform_default`, the route
  // seeds the platform standard (prior behavior).
  travel_fees: z
    .object({
      enabled: z.boolean().optional().default(true),
      use_platform_default: z.boolean().optional().default(true),
      pricing_model: z.enum(["per_km", "tiered"]).nullable().optional(),
      rate_per_km: z.number().min(0).nullable().optional(),
      minimum_fee: z.number().min(0).nullable().optional(),
      maximum_fee: z.number().min(0).nullable().optional(),
      free_within_km: z.number().min(0).nullable().optional(),
      tiers: z
        .array(z.object({ max_km: z.number().min(0), fee: z.number().min(0) }))
        .optional()
        .default([]),
    })
    .optional()
    .nullable(),
  operating_hours: z.object({
    monday: z.object({
      open: z.string(),
      close: z.string(),
      closed: z.boolean(),
    }).optional(),
    tuesday: z.object({
      open: z.string(),
      close: z.string(),
      closed: z.boolean(),
    }).optional(),
    wednesday: z.object({
      open: z.string(),
      close: z.string(),
      closed: z.boolean(),
    }).optional(),
    thursday: z.object({
      open: z.string(),
      close: z.string(),
      closed: z.boolean(),
    }).optional(),
    friday: z.object({
      open: z.string(),
      close: z.string(),
      closed: z.boolean(),
    }).optional(),
    saturday: z.object({
      open: z.string(),
      close: z.string(),
      closed: z.boolean(),
    }).optional(),
    sunday: z.object({
      open: z.string(),
      close: z.string(),
      closed: z.boolean(),
    }).optional(),
  }),
  services: z.array(z.object({
    title: z.string().min(1, "Service title is required"),
    description: z.string().optional().nullable(),
    duration_minutes: z.number().min(1, "Duration must be at least 1 minute"),
    price: z.number().min(0, "Price must be non-negative"),
    currency: z.string().optional(),
    supports_at_home: z.boolean().default(false),
    supports_at_salon: z.boolean().default(true),
    category_id: z.string().uuid().optional().nullable(),
    // Provider-owned menu category name this service belongs to (resolved to a
    // `provider_categories` row on create).
    provider_category_name: z.string().trim().optional().nullable(),
    // §provider-onboarding-2026-05: catalog-parity advanced fields. Each is
    // optional so the wizard can submit "beginner-friendly" services without
    // forcing the user to fill in tax/availability/etc.
    service_type: z.string().optional().nullable(),
    pricing_name: z.string().optional().nullable(),
    aftercare_description: z.string().optional().nullable(),
    service_available_for: z.string().optional().nullable(),
    online_booking_enabled: z.boolean().optional().nullable(),
    at_home_radius_km: z.number().min(0).optional().nullable(),
    at_home_price_adjustment: z.number().optional().nullable(),
    tax_rate: z.number().min(0).max(100).optional().nullable(),
    extra_time_enabled: z.boolean().optional().nullable(),
    extra_time_duration: z.number().min(0).optional().nullable(),
    team_member_ids: z.array(z.string().uuid()).optional().nullable(),
    pricing_options: z.array(z.object({
      id: z.string().optional(),
      duration: z.number().min(1),
      priceType: z.string().optional(),
      price_type: z.string().optional(),
      price: z.number().min(0),
      pricingName: z.string().optional(),
      pricing_name: z.string().optional(),
    })).optional().default([]),
    addons: z.array(z.object({
      name: z.string().min(1, "Addon name is required"),
      description: z.string().optional().nullable(),
      price: z.number().min(0, "Price must be non-negative"),
      currency: z.string().optional(),
      duration_minutes: z.number().optional().nullable(),
    })).optional().default([]),
  })).optional().default([]),
  service_addons: z.array(z.object({
    parent_service_index: z.number().int().min(0),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    price: z.number().min(0),
    currency: z.string().optional(),
    duration_minutes: z.number().optional().nullable(),
    addon_category: z.string().optional().nullable(),
  })).optional().default([]),
  // New fields for public homepage optimization. Required at final onboarding
  // submit so customer web/app provider cards always have both a hero
  // thumbnail and a circular profile/avatar image. Accept URL-like strings
  // and browser data URLs; the route uploads them to provider-gallery below.
  thumbnail_url: z.string().trim().min(1, "Thumbnail photo is required"),
  avatar_url: z.string().trim().min(1, "Profile image/avatar is required"),
  gallery: z.array(z.string().url()).optional().default([]),
  years_in_business: z.number().int().min(0).optional().nullable(),
  accepts_custom_requests: z.boolean().optional().default(true),
  response_rate: z.number().int().min(0).max(100).optional().default(100),
  response_time_hours: z.number().int().min(0).optional().default(1),
  languages_spoken: z.array(z.string()).optional().default(["English"]),
  social_media_links: z.object({
    facebook: z.string().url().optional().nullable(),
    instagram: z.string().url().optional().nullable(),
    twitter: z.string().url().optional().nullable(),
    linkedin: z.string().url().optional().nullable(),
  }).optional().default({}),
  website: z.string().url().optional().nullable(),
  tax_rate_percent: z.number().min(0).max(100).optional().nullable(),
  tips_enabled: z.boolean().optional().default(true),
  cancellation_window_hours: z.number().int().min(0).optional().default(24),
  requires_deposit: z.boolean().optional().default(false),
  deposit_percentage: z.number().min(0).max(100).optional().nullable(),
  no_show_fee_enabled: z.boolean().optional().default(false),
  no_show_fee_amount: z.number().min(0).optional().nullable(),
  include_in_search_engines: z.boolean().optional().default(true),
  selected_plan_id: z.string().uuid("Invalid plan ID").optional().nullable(),
});/**
 * POST /api/provider/onboarding
 * 
 * Complete provider onboarding - create provider profile and associate with global categories
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'superadmin'], request);

    const _supabase = await getSupabaseServer(request);
    const body = await request.json();
    
    console.log("Onboarding request received for user:", user.id, "role:", user.role);

    // Validate request body
    const validationResult = onboardingSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      );
    }

    const {
      // New fields
      team_size,
      owner_name,
      owner_email,
      owner_phone,
      terminal_ownership_status,
      terminal_provider,
      terminal_provider_other,
      terminal_count_range,
      terminal_active_usage_status,
      interested_in_platform_terminal,
      interested_in_terminal_subscription,
      payroll_type,
      payroll_details,
      // Business fields
      business_name,
      business_type,
      description,
      previous_software,
      previous_software_other,
      // Legacy fields (fallback)
      phone: legacyPhone,
      email: legacyEmail,
      address,
      global_category_ids,
      provider_categories,
      selected_zone_ids,
      travel_fees,
      operating_hours,
      services,
      service_addons,
      thumbnail_url,
      avatar_url,
      gallery,
      years_in_business,
      accepts_custom_requests,
      response_rate,
      response_time_hours,
      languages_spoken,
      social_media_links,
      website,
      tax_rate_percent,
      tips_enabled,
      cancellation_window_hours,
      requires_deposit,
      deposit_percentage,
      no_show_fee_enabled,
      no_show_fee_amount,
      include_in_search_engines,
      selected_plan_id,
      is_vat_registered,
      vat_number,
    } = validationResult.data;

    // Use service role client to bypass RLS for checking existing provider
    // This avoids infinite recursion in RLS policies
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    const tenantId = await resolveTenantIdWithZaFallback(request);


    // Check if provider already exists using admin client to avoid RLS recursion
    const { data: existingProvider, error: checkError } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error("Error checking existing provider:", checkError);
      return errorResponse("Failed to check existing provider", "CHECK_ERROR", 500, checkError);
    }

    if (existingProvider) {
      const { data: providerRow, error: providerLoadError } = await supabaseAdmin
        .from("providers")
        .select("*")
        .eq("id", existingProvider.id)
        .single();

      if (providerLoadError || !providerRow) {
        console.error("Error loading existing provider for idempotent onboarding:", providerLoadError);
        return errorResponse("Failed to load existing provider", "LOAD_ERROR", 500, providerLoadError);
      }

      const completion = await buildOnboardingCompletionResponse({
        supabaseAdmin,
        tenantId,
        provider: providerRow as Record<string, unknown>,
        selectedPlanId: selected_plan_id,
        message:
          "Your provider profile is already set up. Continue in the app to finish any remaining steps.",
        autoApprove: (providerRow as { status?: string }).status === "active",
        alreadyCompleted: true,
      });

      return successResponse(completion);
    }

    const { data: tenantRow } = await supabaseAdmin
      .from("tenants")
      .select("default_currency")
      .eq("id", tenantId)
      .maybeSingle();
    const tenantDefaultCurrency = String(
      (tenantRow as { default_currency?: string | null } | null)?.default_currency ?? LAST_RESORT_CURRENCY,
    )
      .trim()
      .toUpperCase();

    // Generate slug from business name
    const generateSlug = (name: string): string => {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .substring(0, 100); // Limit length
    };

    let slug = generateSlug(business_name);
    let slugSuffix = 1;
    
    // Ensure slug is unique
    while (true) {
      const { data: existingSlug } = await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      
      if (!existingSlug) break;
      slug = `${generateSlug(business_name)}-${slugSuffix}`;
      slugSuffix++;
    }

    // Fetch platform settings for this tenant with global fallback.
    const scopedPlatformSettings = await fetchScopedSingle<Record<string, unknown>>({
      supabase: supabaseAdmin,
      table: "platform_settings",
      tenantId,
      select: "settings",
      apply: (q) => q.eq("is_active", true),
      orderBy: { column: "updated_at", ascending: false },
    });
    const platformSettings =
      (scopedPlatformSettings.data as { settings?: Record<string, unknown> } | null)?.settings ?? null;

    const autoApprove = (platformSettings as any)?.features?.auto_approve_providers === true;

    // Create provider profile using admin client to avoid RLS issues
    // §Timezone-truthfulness audit 2026-06: set the provider's display zone
    // explicitly from the onboarding location so non-SA providers don't silently
    // inherit the column DEFAULT 'Africa/Johannesburg'. Prefers coordinates
    // (geo-tz), else maps single-zone countries; `undefined` lets the column
    // default apply as the final safe floor (later resolvable in Settings).
    const derivedTimezone =
      inferProviderTimezoneFromLocation({
        country: address.country,
        city: address.city,
        latitude: address.latitude,
        longitude: address.longitude,
      }) ?? undefined;

    // Note: Address and operating_hours are stored in provider_locations, not providers table
    const { data: provider, error: providerError } = await (supabaseAdmin
      .from("providers") as any)
      .insert({
        tenant_id: tenantId,
        user_id: user.id,
        timezone: derivedTimezone,
        business_name,
        business_type: business_type === "mobile" ? "freelancer" : "salon", // Map: "mobile" -> "freelancer", "salon"/"both" -> "salon"
        slug: slug,
        description: description || null,
        previous_software: previous_software || null,
        previous_software_other: previous_software === "other" ? (previous_software_other || null) : null,
        phone: owner_phone || legacyPhone || "",
        email: owner_email || legacyEmail || "",
        status: autoApprove ? "active" : "pending_approval", // Auto-approve if enabled, otherwise pending
        onboarding_state: autoApprove ? "activated" : "ready_for_activation",
        // New onboarding metadata fields
        team_size: team_size || null,
        // Terminal data is now stored in provider_payment_terminal_profile (upserted below)
        payroll_type: payroll_type || null,
        payroll_details: payroll_type === "other" ? (payroll_details || null) : null,
        // VAT registration fields
        is_vat_registered: is_vat_registered === true,
        vat_number: is_vat_registered === true ? (vat_number || null) : null,
        // New fields for public homepage optimization
        years_in_business: years_in_business || null,
        accepts_custom_requests: accepts_custom_requests ?? true,
        response_rate: response_rate || 100,
        response_time_hours: response_time_hours || 1,
        languages_spoken: languages_spoken || ["English"],
        social_media_links: social_media_links || {},
        website: website || null,
        tax_rate_percent: is_vat_registered === true ? 15 : (tax_rate_percent ?? 0),
        tips_enabled: tips_enabled !== false,
        cancellation_window_hours: cancellation_window_hours || 24,
        requires_deposit: requires_deposit || false,
        deposit_percentage: deposit_percentage || null,
        no_show_fee_enabled: no_show_fee_enabled || false,
        no_show_fee_amount: no_show_fee_amount || null,
        // Note: include_in_search_engines is stored in users table, not providers table
      })
      .select()
      .single();

    if (providerError) {
      console.error("Provider creation error:", providerError);
      return errorResponse(
        `Failed to create provider profile: ${providerError.message}`,
        "PROVIDER_CREATION_ERROR",
        500,
        providerError
      );
    }

    if (!provider) {
      return errorResponse("Failed to create provider profile", "PROVIDER_CREATION_ERROR", 500);
    }
    const providerId = provider.id as string;

    // Upsert terminal profile (gated: provider_terminal_capture_enabled, default ON)
    // Runs after provider row exists. Non-fatal if feature flag is off or data absent.
    if (terminal_ownership_status) {
      try {
        const { isFeatureEnabledServer } = await import("@/lib/server/feature-flags");
        const { FEATURE_FLAG_KEYS } = await import("@/lib/server/feature-flag-keys");
        const captureEnabled = await isFeatureEnabledServer(
          FEATURE_FLAG_KEYS.PROVIDER_TERMINAL_CAPTURE,
          tenantId,
        );
        if (captureEnabled) {
          const terminalProfileData: Record<string, unknown> = {
            tenant_id: tenantId,
            provider_id: providerId,
            has_payment_terminal: terminal_ownership_status === "has_terminal" ? true
              : terminal_ownership_status === "no_terminal" ? false : null,
            terminal_ownership_status: terminal_ownership_status ?? null,
            terminal_provider: terminal_provider ?? null,
            terminal_provider_other: terminal_provider === "other" ? (terminal_provider_other ?? null) : null,
            terminal_count_range: terminal_count_range ?? null,
            terminal_active_usage_status: terminal_active_usage_status ?? null,
            interested_in_platform_terminal: interested_in_platform_terminal ?? null,
            interested_in_terminal_subscription: interested_in_terminal_subscription ?? null,
            source: "onboarding",
            created_by: user.id,
            updated_by: user.id,
          };
          const { error: profileErr } = await supabaseAdmin
            .from("provider_payment_terminal_profile")
            .upsert(terminalProfileData, { onConflict: "provider_id" });
          if (profileErr) {
            console.warn("[onboarding] terminal profile upsert (non-fatal):", profileErr.message);
          }
        }
      } catch (terminalErr) {
        console.warn("[onboarding] terminal profile upsert (non-fatal):", terminalErr);
      }
    }

    // If auto-approve was applied but the verification policy requires providers to
    // be verified before going live, downgrade the new provider to pending_approval.
    let providerWentLive = autoApprove;
    if (autoApprove) {
      const onboardingPolicy = await resolveVerificationPolicy(tenantId);
      if (onboardingPolicy.requiredForProviders) {
        const alreadyVerified = await isProviderVerificationApproved(providerId);
        if (!alreadyVerified) {
          await supabaseAdmin
            .from("providers")
            .update({ status: "pending_approval", onboarding_state: "ready_for_activation" })
            .eq("id", providerId);
          providerWentLive = false;
        }
      }
    }

    // Notify the provider that they are approved and live when auto-approve activates them.
    if (providerWentLive) {
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        await sendTemplateNotification(
          "provider_approved",
          [user.id],
          { business_name: business_name || "" },
          ["push", "email", "sms"],
          { appType: "provider" },
        );
      } catch (notifErr) {
        console.warn("[onboarding] auto-approve notification failed:", notifErr);
      }
    }

    // Upload thumbnail, avatar (profile circle), and gallery images to storage
    let uploadedThumbnailUrl: string | null = null;
    let uploadedAvatarUrl: string | null = null;
    const uploadedGalleryUrls: string[] = [];

    if (thumbnail_url) {
      try {
        // Convert data URL to Blob
        const response = await fetch(thumbnail_url);
        const blob = await response.blob();
        
        // Upload to storage
        const fileExt = blob.type.split('/')[1] || 'jpg';
        const fileName = `${providerId}/thumbnail-${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('provider-gallery')
          .upload(fileName, blob, {
            contentType: blob.type,
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          console.error("Error uploading thumbnail:", uploadError);
        } else {
          const { data: { publicUrl } } = supabaseAdmin.storage
            .from('provider-gallery')
            .getPublicUrl(uploadData.path);
          uploadedThumbnailUrl = publicUrl;
        }
      } catch (error) {
        console.error("Error processing thumbnail upload:", error);
        // Don't fail the entire request if image upload fails
      }
    }

    if (avatar_url) {
      try {
        const response = await fetch(avatar_url);
        const blob = await response.blob();
        const _fileExt = blob.type.split("/")[1] || "jpg";
        const fileName = `${providerId}/avatar`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from("provider-gallery")
          .upload(fileName, blob, { contentType: blob.type, cacheControl: "3600", upsert: true });
        if (!uploadError) {
          const { data: { publicUrl } } = supabaseAdmin.storage.from("provider-gallery").getPublicUrl(uploadData.path);
          uploadedAvatarUrl = publicUrl;
        }
      } catch (err) {
        console.error("Error processing avatar upload:", err);
      }
    }

    if (gallery && gallery.length > 0) {
      for (const imageUrl of gallery) {
        try {
          // Convert data URL to Blob
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          
          // Upload to storage
          const fileExt = blob.type.split('/')[1] || 'jpg';
          const fileName = `${providerId}/gallery-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('provider-gallery')
            .upload(fileName, blob, {
              contentType: blob.type,
              cacheControl: '3600',
            });

          if (uploadError) {
            console.error("Error uploading gallery image:", uploadError);
          } else {
            const { data: { publicUrl } } = supabaseAdmin.storage
              .from('provider-gallery')
              .getPublicUrl(uploadData.path);
            uploadedGalleryUrls.push(publicUrl);
          }
        } catch (error) {
          console.error("Error processing gallery image upload:", error);
          // Continue with other images even if one fails
        }
      }
    }

    // Update provider with uploaded image URLs if any were uploaded
    if (uploadedThumbnailUrl || uploadedAvatarUrl || uploadedGalleryUrls.length > 0) {
      const updateData: any = {};
      if (uploadedThumbnailUrl) updateData.thumbnail_url = uploadedThumbnailUrl;
      if (uploadedAvatarUrl) updateData.avatar_url = uploadedAvatarUrl;
      if (uploadedGalleryUrls.length > 0) updateData.gallery = uploadedGalleryUrls;

      const { error: updateImagesError } = await supabaseAdmin
        .from("providers")
        .update(updateData)
        .eq("id", providerId);

      if (updateImagesError) {
        console.error("Error updating provider with image URLs:", updateImagesError);
        // Don't fail the entire request, but log the error
      }
    }

    // Update user's profile information (stored in users table)
    const userUpdates: any = {};
    if (include_in_search_engines !== undefined) {
      userUpdates.include_in_search_engines = include_in_search_engines !== false;
    }
    // Update owner name (full_name) if provided
    if (owner_name && owner_name.trim()) {
      userUpdates.full_name = owner_name.trim();
    }

    // Read Supabase Auth's own confirmation state — the source of truth for verification.
    // NEVER blindly trust the client-submitted owner_phone/owner_email as "verified";
    // only mark a contact verified when Supabase Auth has actually confirmed that exact
    // value (set via verifyOtp during Step 2). This prevents a direct POST from spoofing
    // verification, while preserving any flags the /api/me/*/verify routes already wrote.
    const {
      data: { user: authUser },
    } = await _supabase.auth.getUser();
    const authPhoneConfirmedAt =
      (authUser as { phone_confirmed_at?: string | null } | null)?.phone_confirmed_at ?? null;
    const authEmailConfirmedAt = authUser?.email_confirmed_at ?? null;
    const authPhoneDigits = authUser?.phone ? authUser.phone.replace(/\D/g, "") : "";
    const authEmailLower = authUser?.email?.trim().toLowerCase() ?? "";

    // Update phone if provided; mark verified only when Auth confirms this exact number.
    if (owner_phone && owner_phone.trim()) {
      const normalizedPhone = owner_phone.trim();
      userUpdates.phone = normalizedPhone;
      const submittedPhoneDigits = normalizedPhone.replace(/\D/g, "");
      if (
        authPhoneConfirmedAt &&
        authPhoneDigits &&
        submittedPhoneDigits === authPhoneDigits
      ) {
        userUpdates.phone_verified = true;
        userUpdates.phone_verified_at = new Date().toISOString();
      }
    }
    // Update email if provided; mark verified only when Auth confirms this exact address.
    if (owner_email && owner_email.trim()) {
      const normalizedEmail = owner_email.trim();
      userUpdates.email = normalizedEmail;
      if (
        authEmailConfirmedAt &&
        authEmailLower &&
        normalizedEmail.toLowerCase() === authEmailLower
      ) {
        userUpdates.email_verified = true;
      }
    }

    if (Object.keys(userUpdates).length > 0) {
      const { error: updateUserError } = await supabaseAdmin
        .from("users")
        .update(userUpdates)
        .eq("id", user.id);

      if (updateUserError) {
        console.error("Error updating user profile:", updateUserError);
        // Don't fail the request, but log the error
      }
    }

    // Create primary location with geocoding and operating hours using admin client
    // location_type: "base" = mobile-only (distance/travel); "salon" = clients can visit (salon/both)
    const locationType = business_type === "mobile" ? "base" : "salon";
    const locationName = business_type === "mobile" ? "Home base" : "Main Location";
    const hasCoords = address.latitude != null && address.longitude != null && (address.latitude !== 0 || address.longitude !== 0);
    const { data: insertedLocation, error: locationError } = await supabaseAdmin
      .from("provider_locations")
      .insert({
        provider_id: providerId,
        name: locationName,
        address_line1: address.line1,
        address_line2: address.line2 || null,
        city: address.city,
        state: address.state || null,
        postal_code: address.postal_code || null,
        country: address.country,
        latitude: hasCoords ? address.latitude : null,
        longitude: hasCoords ? address.longitude : null,
        working_hours: operating_hours, // Store operating_hours as working_hours JSONB
        is_active: true,
        is_primary: true,
        location_type: locationType,
      })
      .select("id")
      .single();

    if (locationError) {
      console.error("Error creating provider location:", locationError);
      return errorResponse(
        `Failed to create provider location: ${locationError.message}`,
        "LOCATION_CREATION_ERROR",
        500,
        locationError
      );
    }

    // If address was entered without Mapbox coords, geocode now so zones and map features work
    if (insertedLocation?.id && !hasCoords && address.line1 && address.city && address.country) {
      try {
        await geocodeProviderLocation(supabaseAdmin, insertedLocation.id);
      } catch (geocodeErr) {
        console.warn("Geocode primary location after onboarding:", geocodeErr);
      }
    }

    // Associate provider with selected global categories using admin client
    if (global_category_ids && global_category_ids.length > 0) {
      const associations = global_category_ids.map((categoryId) => ({
        provider_id: providerId,
        global_category_id: categoryId,
      }));

      const { error: assocError } = await supabaseAdmin
        .from("provider_global_category_associations")
        .insert(associations);

      if (assocError) {
        console.error("Error creating category associations:", assocError);
        // Don't fail the entire request, but log the error
        // The associations can be added later
      }
    }

    const selectedGlobalCategoryIds = Array.from(
      new Set((global_category_ids || []).filter((id): id is string => typeof id === "string" && id.length > 0)),
    );
    const globalCategoryDetailsById = new Map<string, { id: string; name: string; slug: string }>();
    const providerCategoryByGlobalId = new Map<string, string>();

    if (selectedGlobalCategoryIds.length > 0) {
      const { data: globalCategories, error: globalCategoriesError } = await supabaseAdmin
        .from("global_categories")
        .select("id, name, slug")
        .in("id", selectedGlobalCategoryIds);

      if (globalCategoriesError) {
        console.error("Error fetching selected global categories:", globalCategoriesError);
      }

      const normalizedGlobalCategories = (globalCategories || []).map((category: any) => ({
        id: String(category.id),
        name: String(category.name || "Uncategorized"),
        slug: slugifyCategory(String(category.slug || category.name || "uncategorized")),
      }));
      normalizedGlobalCategories.forEach((category) => {
        globalCategoryDetailsById.set(category.id, category);
      });

      if (normalizedGlobalCategories.length > 0) {
        const globalSlugs = Array.from(new Set(normalizedGlobalCategories.map((category) => category.slug)));
        const { data: existingProviderCategories, error: existingProviderCategoriesError } = await supabaseAdmin
          .from("provider_categories")
          .select("id, slug")
          .eq("provider_id", providerId)
          .in("slug", globalSlugs);

        if (existingProviderCategoriesError) {
          console.error("Error fetching provider categories:", existingProviderCategoriesError);
        }

        const providerCategoryBySlug = new Map<string, string>();
        (existingProviderCategories || []).forEach((category: any) => {
          providerCategoryBySlug.set(String(category.slug), String(category.id));
        });

        const { data: maxProviderCategoryOrder } = await supabaseAdmin
          .from("provider_categories")
          .select("display_order")
          .eq("provider_id", providerId)
          .order("display_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        let nextDisplayOrder =
          typeof maxProviderCategoryOrder?.display_order === "number" ? maxProviderCategoryOrder.display_order + 1 : 0;

        for (const globalCategory of normalizedGlobalCategories) {
          if (providerCategoryBySlug.has(globalCategory.slug)) {
            providerCategoryByGlobalId.set(globalCategory.id, providerCategoryBySlug.get(globalCategory.slug)!);
            continue;
          }

          const { data: createdProviderCategory, error: createProviderCategoryError } = await supabaseAdmin
            .from("provider_categories")
            .insert({
              provider_id: providerId,
              name: globalCategory.name,
              slug: globalCategory.slug,
              display_order: nextDisplayOrder,
              is_active: true,
            })
            .select("id, slug")
            .single();

          if (createProviderCategoryError || !createdProviderCategory) {
            console.error("Error creating provider category from onboarding global category:", {
              global_category_id: globalCategory.id,
              provider_id: providerId,
              message: createProviderCategoryError?.message || "No category returned",
            });
            continue;
          }

          nextDisplayOrder += 1;
          providerCategoryBySlug.set(String(createdProviderCategory.slug), String(createdProviderCategory.id));
          providerCategoryByGlobalId.set(globalCategory.id, String(createdProviderCategory.id));
        }
      }
    }

    const ensureProviderCategoryForGlobalCategory = async (globalCategoryId: string | null | undefined) => {
      if (!globalCategoryId) return null;
      if (providerCategoryByGlobalId.has(globalCategoryId)) {
        return providerCategoryByGlobalId.get(globalCategoryId)!;
      }

      let globalCategory = globalCategoryDetailsById.get(globalCategoryId);
      if (!globalCategory) {
        const { data: fetchedGlobalCategory, error: fetchedGlobalCategoryError } = await supabaseAdmin
          .from("global_categories")
          .select("id, name, slug")
          .eq("id", globalCategoryId)
          .maybeSingle();
        if (fetchedGlobalCategoryError || !fetchedGlobalCategory) {
          if (fetchedGlobalCategoryError) {
            console.error("Error fetching global category for onboarding service:", fetchedGlobalCategoryError);
          }
          return null;
        }
        globalCategory = {
          id: String(fetchedGlobalCategory.id),
          name: String(fetchedGlobalCategory.name || "Uncategorized"),
          slug: slugifyCategory(String(fetchedGlobalCategory.slug || fetchedGlobalCategory.name || "uncategorized")),
        };
        globalCategoryDetailsById.set(globalCategory.id, globalCategory);
      }

      const { data: existingProviderCategory } = await supabaseAdmin
        .from("provider_categories")
        .select("id")
        .eq("provider_id", providerId)
        .eq("slug", globalCategory.slug)
        .maybeSingle();
      if (existingProviderCategory?.id) {
        const existingId = String(existingProviderCategory.id);
        providerCategoryByGlobalId.set(globalCategory.id, existingId);
        return existingId;
      }

      const { data: maxProviderCategoryOrder } = await supabaseAdmin
        .from("provider_categories")
        .select("display_order")
        .eq("provider_id", providerId)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const displayOrder =
        typeof maxProviderCategoryOrder?.display_order === "number" ? maxProviderCategoryOrder.display_order + 1 : 0;
      const { data: createdProviderCategory, error: createProviderCategoryError } = await supabaseAdmin
        .from("provider_categories")
        .insert({
          provider_id: providerId,
          name: globalCategory.name,
          slug: globalCategory.slug,
          display_order: displayOrder,
          is_active: true,
        })
        .select("id")
        .single();
      if (createProviderCategoryError || !createdProviderCategory?.id) {
        if (createProviderCategoryError) {
          console.error("Error creating provider category for onboarding service:", createProviderCategoryError);
        }
        return null;
      }
      const createdId = String(createdProviderCategory.id);
      providerCategoryByGlobalId.set(globalCategory.id, createdId);
      return createdId;
    };

    // §provider-launch (2026-06): resolve/create a provider-owned menu category
    // by its NAME (the wizard now lets providers name their own categories and
    // assign each service to one). Matches the live catalog behavior.
    const providerCategoryByName = new Map<string, string>();
    const ensureProviderCategoryByName = async (
      rawName: string | null | undefined,
      globalCategoryId?: string | null,
    ): Promise<string | null> => {
      const name = (rawName || "").trim();
      if (!name) return null;
      const key = name.toLowerCase();
      if (providerCategoryByName.has(key)) return providerCategoryByName.get(key)!;

      const slug = slugifyCategory(name);
      const { data: existing } = await supabaseAdmin
        .from("provider_categories")
        .select("id")
        .eq("provider_id", providerId)
        .eq("slug", slug)
        .maybeSingle();
      if (existing?.id) {
        const existingId = String(existing.id);
        providerCategoryByName.set(key, existingId);
        if (globalCategoryId) providerCategoryByGlobalId.set(globalCategoryId, existingId);
        return existingId;
      }

      const { data: maxOrder } = await supabaseAdmin
        .from("provider_categories")
        .select("display_order")
        .eq("provider_id", providerId)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const displayOrder =
        typeof maxOrder?.display_order === "number" ? maxOrder.display_order + 1 : 0;
      const { data: created, error: createError } = await supabaseAdmin
        .from("provider_categories")
        .insert({
          provider_id: providerId,
          name,
          slug,
          display_order: displayOrder,
          is_active: true,
        })
        .select("id")
        .single();
      if (createError || !created?.id) {
        if (createError) {
          console.error("Error creating provider menu category from onboarding:", createError);
        }
        return null;
      }
      const createdId = String(created.id);
      providerCategoryByName.set(key, createdId);
      if (globalCategoryId) providerCategoryByGlobalId.set(globalCategoryId, createdId);
      return createdId;
    };

    // Create the provider's named menu categories up-front so service rows can
    // map to them by name below.
    for (const providerCategory of provider_categories || []) {
      await ensureProviderCategoryByName(
        providerCategory.name,
        providerCategory.global_category_id ?? null,
      );
    }

    // Auto-generate basic services if none provided but categories selected
    let servicesToCreate = services || [];
    let servicesWereAutoGenerated = false;
    if (servicesToCreate.length === 0 && selectedGlobalCategoryIds.length > 0) {
      const categories = selectedGlobalCategoryIds
        .map((id) => globalCategoryDetailsById.get(id))
        .filter((category): category is { id: string; name: string; slug: string } => Boolean(category));
      // Generate basic services based on categories
      const serviceTemplates: Record<string, any[]> = {
        "hair": [
          { title: "Haircut", duration_minutes: 45, price: 200, supports_at_home: business_type === "mobile" || business_type === "both" },
          { title: "Hair Coloring", duration_minutes: 90, price: 400, supports_at_home: false },
        ],
        "barbering": [
          { title: "Men's Haircut", duration_minutes: 45, price: 150, supports_at_home: business_type === "mobile" || business_type === "both" },
          { title: "Beard Trim", duration_minutes: 30, price: 100, supports_at_home: business_type === "mobile" || business_type === "both" },
        ],
        "nails": [
          { title: "Manicure", duration_minutes: 45, price: 150, supports_at_home: business_type === "mobile" || business_type === "both" },
          { title: "Pedicure", duration_minutes: 60, price: 200, supports_at_home: business_type === "mobile" || business_type === "both" },
        ],
        "massage": [
          { title: "Relaxation Massage", duration_minutes: 60, price: 300, supports_at_home: business_type === "mobile" || business_type === "both" },
          { title: "Deep Tissue Massage", duration_minutes: 60, price: 350, supports_at_home: business_type === "mobile" || business_type === "both" },
        ],
        "facial": [
          { title: "Facial Treatment", duration_minutes: 60, price: 250, supports_at_home: business_type === "mobile" || business_type === "both" },
        ],
        "waxing": [
          { title: "Full Leg Wax", duration_minutes: 45, price: 200, supports_at_home: business_type === "mobile" || business_type === "both" },
          { title: "Bikini Wax", duration_minutes: 30, price: 150, supports_at_home: false },
        ],
      };

      const generatedServices: any[] = [];
      (categories || []).forEach((category) => {
        const categorySlug = category.slug?.toLowerCase() || category.name?.toLowerCase() || "";
        const templates = serviceTemplates[categorySlug] || 
          Object.values(serviceTemplates).find((templates, idx) => {
            const keys = Object.keys(serviceTemplates);
            return categorySlug.includes(keys[idx]) || keys[idx].includes(categorySlug);
          });

        if (templates) {
          templates.forEach((template) => {
            generatedServices.push({
              title: template.title,
              description: `Professional ${template.title.toLowerCase()} service`,
              duration_minutes: template.duration_minutes,
              price: template.price,
              currency: tenantDefaultCurrency,
              supports_at_home: template.supports_at_home || false,
              supports_at_salon: business_type === "salon" || business_type === "both",
              category_id: category.id,
              provider_category_name: category.name,
            });
          });
        } else {
          // Generic service for unknown categories
          generatedServices.push({
            title: `${category.name} Service`,
            description: `Professional ${category.name.toLowerCase()} service`,
            duration_minutes: 60,
            price: 200,
            currency: tenantDefaultCurrency,
            supports_at_home: business_type === "mobile" || business_type === "both",
            supports_at_salon: business_type === "salon" || business_type === "both",
            category_id: category.id,
            provider_category_name: category.name,
          });
        }
      });

      // Limit to 5 services max for auto-generation
      servicesToCreate = generatedServices.slice(0, 5);
      servicesWereAutoGenerated = servicesToCreate.length > 0;
    }

    // Create services/offerings if provided or auto-generated
    if (servicesToCreate.length > 0) {
      const defaultGlobalCategoryId = selectedGlobalCategoryIds[0] || null;
      const offerings = [];
      for (const service of servicesToCreate) {
        const resolvedGlobalCategoryId =
          (typeof service?.category_id === "string" && service.category_id.length > 0
            ? service.category_id
            : defaultGlobalCategoryId) || null;
        // Prefer the provider's own named menu category (wizard category step);
        // fall back to deriving one from the global category for back-compat.
        const providerCategoryName = (service as any)?.provider_category_name as string | undefined;
        const resolvedProviderCategoryId =
          (await ensureProviderCategoryByName(providerCategoryName, resolvedGlobalCategoryId)) ??
          (await ensureProviderCategoryForGlobalCategory(resolvedGlobalCategoryId));
        // §provider-onboarding-2026-05: persist catalog-parity advanced fields
        // (service_type/pricing_name/aftercare/service_available_for/
        // online_booking_enabled/at_home_radius_km/at_home_price_adjustment/
        // tax_rate/extra_time_enabled/extra_time_duration) so the provider
        // doesn't have to re-edit every service in the catalog after going
        // live. Server-side defaults match `service-form.tsx` so the wizard's
        // "beginner mode" still creates working services.
        const supportsAtSalon = service.supports_at_salon !== false;
        const supportsAtHome = service.supports_at_home === true;
        offerings.push({
        provider_id: providerId,
        title: service.title,
        description: service.description || null,
        duration_minutes: service.duration_minutes,
        price: service.price,
        currency: service.currency || tenantDefaultCurrency,
        supports_at_home: supportsAtHome,
        supports_at_salon: supportsAtSalon,
        category_id: resolvedGlobalCategoryId,
        provider_category_id: resolvedProviderCategoryId,
        is_onboarding_auto_generated: servicesWereAutoGenerated,
        is_active: true,
        is_bookable: true,
        service_type: (service as any).service_type || "basic",
        pricing_name: (service as any).pricing_name || null,
        aftercare_description: (service as any).aftercare_description || null,
        service_available_for: (service as any).service_available_for || "everyone",
        online_booking_enabled:
          (service as any).online_booking_enabled === false ? false : true,
        at_home_radius_km:
          supportsAtHome && Number.isFinite(Number((service as any).at_home_radius_km))
            ? Number((service as any).at_home_radius_km)
            : null,
        at_home_price_adjustment:
          supportsAtHome && Number.isFinite(Number((service as any).at_home_price_adjustment))
            ? Number((service as any).at_home_price_adjustment)
            : 0,
        tax_rate: Number.isFinite(Number((service as any).tax_rate))
          ? Number((service as any).tax_rate)
          : 0,
        extra_time_enabled: (service as any).extra_time_enabled === true,
        extra_time_duration:
          (service as any).extra_time_enabled === true &&
          Number.isFinite(Number((service as any).extra_time_duration))
            ? Number((service as any).extra_time_duration)
            : 0,
        pricing_options: Array.isArray((service as any).pricing_options)
          ? (service as any).pricing_options
          : [],
        });
      }

      // §provider-onboarding-2026-05: when the provider explicitly entered
      // services in the wizard, we want a hard error if the insert fails so
      // they don't go live thinking their catalog is set up when it isn't.
      // Auto-generated fallback services remain best-effort so we never block
      // a provider from finishing setup because of a generated row.
      const userSuppliedServices = !servicesWereAutoGenerated;
      let createdOfferings: any[] | null = null;
      let servicesError: any = null;
      try {
        const insertRes = await supabaseAdmin
          .from("offerings")
          .insert(offerings)
          .select();
        createdOfferings = insertRes.data ?? null;
        servicesError = insertRes.error ?? null;
      } catch (e) {
        servicesError = e;
      }

      // Retry once without the advanced fields when older databases lack the
      // new columns. PostgREST surfaces missing columns as code 42703.
      if (
        servicesError &&
        typeof servicesError === "object" &&
        (servicesError as any)?.code === "42703"
      ) {
        const ALLOWED_ADVANCED = [
          "service_type",
          "pricing_name",
          "aftercare_description",
          "service_available_for",
          "online_booking_enabled",
          "at_home_radius_km",
          "at_home_price_adjustment",
          "tax_rate",
          "extra_time_enabled",
          "extra_time_duration",
        ];
        const stripped = offerings.map((row) => {
          const copy: Record<string, unknown> = { ...row };
          for (const k of ALLOWED_ADVANCED) delete copy[k];
          return copy;
        });
        try {
          const retry = await supabaseAdmin.from("offerings").insert(stripped).select();
          createdOfferings = retry.data ?? null;
          servicesError = retry.error ?? null;
        } catch (e) {
          servicesError = e;
        }
      }

      if (servicesError) {
        console.error("Error creating services:", servicesError);
        if (userSuppliedServices) {
          // Hard fail so the provider can address the error instead of going
          // live with an empty catalogue.
          return errorResponse(
            "Failed to create your services. Please review and try again.",
            "ONBOARDING_SERVICES_FAILED",
            422,
          );
        }
        // Auto-generated fallback: don't fail the entire request
      } else if (createdOfferings && createdOfferings.length > 0) {
        for (const offering of createdOfferings) {
          const pricingOpts = (offering as { pricing_options?: unknown[] }).pricing_options;
          if (Array.isArray(pricingOpts) && pricingOpts.length > 0) {
            const syncResult = await syncVariantOfferings(
              supabaseAdmin,
              offering as Record<string, unknown>,
              pricingOpts,
            );
            if (syncResult.errors.length > 0) {
              console.error(
                "[onboarding] variant sync failed for offering",
                offering.id,
                syncResult.errors,
              );
            }
          }
        }

        const addonRows: Record<string, unknown>[] = [];
        const legacyNestedAddons: Array<{ parentIndex: number; addon: { name: string; description?: string | null; price: number; currency?: string; duration_minutes?: number | null } }> = [];
        servicesToCreate.forEach((serviceData, index) => {
          const nested = serviceData?.addons || [];
          nested.forEach((addon) => legacyNestedAddons.push({ parentIndex: index, addon }));
        });

        const topLevelAddons = service_addons || [];
        const allAddonSpecs = [
          ...topLevelAddons.map((a) => ({
            parentIndex: a.parent_service_index,
            addon: a,
          })),
          ...legacyNestedAddons,
        ];

        for (const spec of allAddonSpecs) {
          const parent = createdOfferings[spec.parentIndex];
          if (!parent?.id) continue;
          const parentCategoryId = parent.provider_category_id ?? null;
          addonRows.push({
            provider_id: providerId,
            title: spec.addon.name,
            description: spec.addon.description || null,
            duration_minutes: spec.addon.duration_minutes || 0,
            price: spec.addon.price,
            currency: spec.addon.currency || tenantDefaultCurrency,
            supports_at_home: false,
            supports_at_salon: true,
            provider_category_id: parentCategoryId,
            is_active: true,
            service_type: "addon",
            addon_category: (spec.addon as { addon_category?: string }).addon_category || "general",
            applicable_service_ids: [parent.id],
          });
        }

        if (addonRows.length > 0) {
          const { error: addonOfferingsError } = await supabaseAdmin
            .from("offerings")
            .insert(addonRows);
          if (addonOfferingsError) {
            console.error("Error creating onboarding addon offerings:", addonOfferingsError);
          }
        }
      }
    }

    // Upgrade user role to provider_owner (customer or legacy provider_onboarding)
    const userRole = user.role;
    if (userRole === "customer" || userRole === "provider_onboarding") {
      const { error: roleError } = await supabaseAdmin
        .from("users")
        .update({ role: "provider_owner" })
        .eq("id", user.id);

      if (roleError) {
        console.error("Error upgrading user role:", roleError);
      }
    }

    const supportsHouseCalls = business_type === "mobile" || business_type === "both";

    if (supportsHouseCalls) {
      const platformTravelFees = (platformSettings as any)?.travel_fees || {};
      const allowCustomization = platformTravelFees.allow_provider_customization !== false;
      const allowTiered = platformTravelFees.allow_provider_tiered !== false;

      // §provider-launch (2026-06): persist the wizard's Travel-fees step instead
      // of always hard-coding the platform default. When the step is skipped,
      // disabled customization, or `use_platform_default`, fall back to the
      // platform standard (prior behavior).
      const wantsCustom =
        allowCustomization &&
        travel_fees != null &&
        travel_fees.enabled !== false &&
        travel_fees.use_platform_default === false;

      const travelFeeRow: Record<string, unknown> = {
        provider_id: providerId,
        enabled: travel_fees?.enabled !== false,
        currency: platformTravelFees.default_currency || tenantDefaultCurrency,
        use_platform_default: wantsCustom ? false : true,
        rate_per_km: platformTravelFees.default_rate_per_km ?? 8,
        minimum_fee: platformTravelFees.default_minimum_fee ?? 20,
        maximum_fee: platformTravelFees.default_maximum_fee ?? null,
        updated_at: new Date().toISOString(),
      };

      if (wantsCustom) {
        const model: "per_km" | "tiered" =
          travel_fees!.pricing_model === "tiered" && allowTiered ? "tiered" : "per_km";
        travelFeeRow.pricing_model = model;
        if (model === "tiered") {
          const tiers = (travel_fees!.tiers ?? [])
            .filter((t) => Number.isFinite(t.max_km) && Number.isFinite(t.fee))
            .sort((a, b) => a.max_km - b.max_km);
          // Guard: a tiered choice with no valid tiers reverts to platform default.
          if (tiers.length > 0) {
            travelFeeRow.tiers = tiers;
          } else {
            travelFeeRow.use_platform_default = true;
            travelFeeRow.pricing_model = "per_km";
          }
        } else {
          travelFeeRow.tiers = null;
          travelFeeRow.rate_per_km = travel_fees!.rate_per_km ?? travelFeeRow.rate_per_km;
          travelFeeRow.minimum_fee = travel_fees!.minimum_fee ?? travelFeeRow.minimum_fee;
          travelFeeRow.maximum_fee =
            travel_fees!.maximum_fee != null ? travel_fees!.maximum_fee : null;
          travelFeeRow.free_within_km =
            travel_fees!.free_within_km != null ? travel_fees!.free_within_km : null;
        }
      }

      const { error: travelFeeSettingsError } = await supabaseAdmin
        .from("provider_travel_fee_settings")
        .upsert(travelFeeRow, { onConflict: "provider_id" });

      if (travelFeeSettingsError) {
        console.error("Error creating travel fee defaults:", travelFeeSettingsError);
        // Non-fatal: the settings API still falls back to platform defaults.
      }
    }

    // Auto-select service zones if provided
    if (selected_zone_ids && selected_zone_ids.length > 0) {
      const platformTravelFees = (platformSettings as any)?.travel_fees || {
        default_rate_per_km: 8.00,
        default_minimum_fee: 20.00,
        default_maximum_fee: null,
        default_currency: tenantDefaultCurrency,
      };

      // Create zone selections with default pricing
      const zoneSelections = selected_zone_ids.map((zoneId) => ({
        provider_id: providerId,
        platform_zone_id: zoneId,
        travel_fee: platformTravelFees.default_minimum_fee || 20.00,
        currency: platformTravelFees.default_currency || tenantDefaultCurrency,
        travel_time_minutes: 30,
        is_active: true,
      }));

      const { error: zonesError } = await supabaseAdmin
        .from("provider_zone_selections")
        .insert(zoneSelections);

      if (zonesError) {
        console.error("Error creating zone selections:", zonesError);
        // Don't fail the request, zones can be added later
      }
    }

    // For freelancers, ensure they're set up as staff and mark as mobile-ready
    if (business_type === "mobile") {
      try {
        // First try to use the RPC function if it exists
        try {
          const { error: freelancerSetupError } = await supabaseAdmin.rpc(
            "ensure_freelancer_setup",
            { p_provider_id: providerId }
          );
          
          if (freelancerSetupError && !freelancerSetupError.message?.includes("function") && !freelancerSetupError.message?.includes("does not exist")) {
            console.error("Error calling ensure_freelancer_setup:", freelancerSetupError);
          } else {
            // Geocode any location created without coords (e.g. from user_addresses)
            try {
              const { data: locs } = await supabaseAdmin
                .from("provider_locations")
                .select("id, latitude, longitude")
                .eq("provider_id", providerId)
                .eq("is_active", true)
                .not("address_line1", "is", null)
                .not("city", "is", null)
                .not("country", "is", null);
              const toGeocode = (locs ?? []).filter((l: any) => l.latitude == null || l.longitude == null);
              for (const loc of toGeocode) {
                await geocodeProviderLocation(supabaseAdmin, loc.id);
              }
            } catch (geocodeErr) {
              console.warn("Geocode provider locations after freelancer setup:", geocodeErr);
            }
          }
        } catch {
          // RPC function might not exist, create staff record manually
          console.log("RPC function not available, creating staff record manually");
          
          // Check if staff record already exists
          const { data: existingStaff } = await supabaseAdmin
            .from("provider_staff")
            .select("id")
            .eq("provider_id", providerId)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!existingStaff) {
            // Create staff record manually
            const { error: createStaffError } = await supabaseAdmin
              .from("provider_staff")
              .insert({
                provider_id: providerId,
                user_id: user.id,
                name: business_name,
                email: owner_email || legacyEmail,
                phone: owner_phone || legacyPhone,
                role: "owner",
                is_active: true,
                mobile_ready: true, // Mark as mobile-ready for freelancers
              });

            if (createStaffError) {
              console.error("Error creating staff record manually:", createStaffError);
            }
          } else {
            // Update existing staff to mobile-ready
            const { error: updateError } = await supabaseAdmin
              .from("provider_staff")
              .update({ mobile_ready: true })
              .eq("id", existingStaff.id);

            if (updateError) {
              console.error("Error marking existing staff as mobile-ready:", updateError);
            }
          }
        }

        // Ensure staff is marked as mobile-ready (fallback if RPC worked but didn't set it)
        const { data: freelancerStaff } = await supabaseAdmin
          .from("provider_staff")
          .select("id, mobile_ready")
          .eq("provider_id", providerId)
          .in("role", ["owner", "provider_owner"])
          .limit(1)
          .maybeSingle();

        if (freelancerStaff && !freelancerStaff.mobile_ready) {
          const { error: updateError } = await supabaseAdmin
            .from("provider_staff")
            .update({ mobile_ready: true })
            .eq("id", freelancerStaff.id);

          if (updateError) {
            console.error("Error marking freelancer as mobile-ready:", updateError);
          }
        }
      } catch (error) {
        console.error("Error setting up freelancer:", error);
        // Don't fail the request - staff can be configured later
      }
    } else {
      // Salon / team providers: ensure the owner has a provider_staff row so
      // that the mobile staff-schedule screen, the shifts calendar, and the
      // booking engine can all resolve the owner as a bookable staff member.
      // We prefer the new generic RPC (migration 618); fall back to an inline
      // INSERT … ON CONFLICT if the function is not yet deployed.
      try {
        const { error: ownerStaffRpcErr } = await supabaseAdmin.rpc(
          "ensure_provider_owner_staff",
          { p_provider_id: providerId }
        );

        if (ownerStaffRpcErr &&
          !ownerStaffRpcErr.message?.includes("function") &&
          !ownerStaffRpcErr.message?.includes("does not exist")) {
          console.error("ensure_provider_owner_staff RPC error:", ownerStaffRpcErr);
        }

        if (ownerStaffRpcErr) {
          // RPC not yet deployed — inline fallback
          const { data: existingSalonOwnerStaff } = await supabaseAdmin
            .from("provider_staff")
            .select("id")
            .eq("provider_id", providerId)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!existingSalonOwnerStaff) {
            const { error: createSalonStaffErr } = await supabaseAdmin
              .from("provider_staff")
              .insert({
                provider_id: providerId,
                user_id: user.id,
                name: business_name,
                email: owner_email || legacyEmail,
                phone: owner_phone || legacyPhone,
                role: "owner",
                is_active: true,
                mobile_ready: false,
              });
            if (createSalonStaffErr) {
              console.error("Error creating salon owner staff record:", createSalonStaffErr);
            }
          }
        }
      } catch (error) {
        console.error("Error creating salon owner staff:", error);
        // Non-fatal; staff can be created later through the team management UI
      }
    }

    // Delete draft after successful onboarding using admin client
    await supabaseAdmin
      .from("provider_onboarding_drafts")
      .delete()
      .eq("user_id", user.id);

    // Provider Ops Hub: create/update tracking record and run lead matching
    try {
      await supabaseAdmin
        .from("provider_onboarding_tracking")
        .upsert(
          {
            user_id: user.id,
            tenant_id: tenantId,
            wizard_status: "submitted",
            provider_id: providerId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (autoApprove) {
        await markProviderOnboardingLifecycleComplete(supabaseAdmin, {
          providerId,
          userId: user.id,
          tenantId,
        });
      }

      // Run lead matching by phone and email
      const matchConditions: string[] = [];
      const userEmail = owner_email || legacyEmail;
      const userPhone = owner_phone || legacyPhone;
      if (userEmail) matchConditions.push(`email.eq.${userEmail.toLowerCase()}`);
      if (userPhone) matchConditions.push(`phone_e164.eq.${userPhone}`);

      if (matchConditions.length > 0) {
        const { data: matchingLeads } = await supabaseAdmin
          .from("provider_leads")
          .select("id")
          .eq("tenant_id", tenantId)
          .is("matched_provider_id", null)
          .or(matchConditions.join(","))
          .limit(1);

        if (matchingLeads?.length) {
          const leadId = matchingLeads[0].id;
          await supabaseAdmin
            .from("provider_leads")
            .update({
              matched_provider_id: providerId,
              matched_user_id: user.id,
              match_confidence: 1.0,
              matched_at: new Date().toISOString(),
              commercial_stage: "matched",
            })
            .eq("id", leadId);

          await supabaseAdmin
            .from("providers")
            .update({ lead_id: leadId })
            .eq("id", providerId);

          await supabaseAdmin
            .from("provider_onboarding_tracking")
            .update({ lead_id: leadId })
            .eq("user_id", user.id);

          await supabaseAdmin.from("provider_lead_activities").insert({
            lead_id: leadId,
            activity_type: "match_confirmed",
            description: "Auto-matched to self-serve signup",
            metadata: { provider_id: providerId, match_type: "auto_self_serve" },
          });
        }
      }
    } catch (trackingErr) {
      console.warn("Provider Ops tracking/matching (non-fatal):", trackingErr);
    }

    // Build success message with details
    let message = autoApprove 
      ? "Onboarding completed successfully! Your provider account is now active."
      : "Onboarding completed successfully. Your application is pending review.";
    const autoConfigDetails: string[] = [];
    
    if (selected_zone_ids && selected_zone_ids.length > 0) {
      autoConfigDetails.push(`${selected_zone_ids.length} service zone${selected_zone_ids.length !== 1 ? 's' : ''} configured`);
    }
    
    if (servicesToCreate.length > 0 && services.length === 0) {
      autoConfigDetails.push(`${servicesToCreate.length} service${servicesToCreate.length !== 1 ? 's' : ''} auto-generated`);
    }
    
    if (business_type === "mobile") {
      autoConfigDetails.push("marked as mobile-ready");
    }

    if (supportsHouseCalls) {
      autoConfigDetails.push("travel fees set to platform defaults");
    }
    
    if (autoConfigDetails.length > 0) {
      message += ` We've automatically configured: ${autoConfigDetails.join(', ')}.`;
    }

    const completion = await buildOnboardingCompletionResponse({
      supabaseAdmin,
      tenantId,
      provider: provider as Record<string, unknown>,
      selectedPlanId: selected_plan_id,
      message,
      autoApprove,
      autoConfigured: {
        zones: selected_zone_ids?.length || 0,
        services: servicesToCreate.length > 0 && services.length === 0 ? servicesToCreate.length : 0,
        mobile_ready: business_type === "mobile",
        travel_fee_defaults: supportsHouseCalls,
      },
    });

    return successResponse(completion);
  } catch (error) {
    return handleApiError(error, "Failed to complete onboarding");
  }
}
