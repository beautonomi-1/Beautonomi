import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { geocodeProviderLocation } from "@/lib/mapbox/geocodeProviderLocation";

const onboardingSchema = z.object({
  // New fields
  team_size: z.enum(["freelancer", "small", "medium", "large"]).optional().nullable(),
  owner_name: z.string().min(1, "Owner name is required").optional(),
  owner_email: z.string().email("Invalid email address").optional(),
  owner_phone: z.string().min(1, "Phone is required").optional(),
  yoco_machine: z.enum(["yes", "no", "other"]).optional().nullable(),
  yoco_machine_other: z.string().optional().nullable(),
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
  selected_zone_ids: z.array(z.string().uuid()).optional().default([]),
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
    currency: z.string().default("ZAR"),
    supports_at_home: z.boolean().default(false),
    supports_at_salon: z.boolean().default(true),
    category_id: z.string().uuid().optional().nullable(),
    addons: z.array(z.object({
      name: z.string().min(1, "Addon name is required"),
      description: z.string().optional().nullable(),
      price: z.number().min(0, "Price must be non-negative"),
      currency: z.string().default("ZAR"),
      duration_minutes: z.number().optional().nullable(),
    })).optional().default([]),
  })).optional().default([]),
  // New fields for public homepage optimization
  thumbnail_url: z.string().url().optional().nullable(),
  gallery: z.array(z.string().url()).optional().default([]),
  years_in_business: z.number().int().min(0).optional().nullable(),
  accepts_custom_requests: z.boolean().optional().default(false),
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
  tips_enabled: z.boolean().optional().default(false),
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
      yoco_machine,
      yoco_machine_other,
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
      selected_zone_ids,
      operating_hours,
      services,
      thumbnail_url,
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

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");


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
      return errorResponse("Provider profile already exists", "ALREADY_EXISTS", 409);
    }

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

    // Fetch platform settings for auto-approve
    const { data: platformSettings } = await supabaseAdmin
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .single();

    const autoApprove = (platformSettings?.settings as any)?.features?.auto_approve_providers === true;

    // Create provider profile using admin client to avoid RLS issues
    // Note: Address and operating_hours are stored in provider_locations, not providers table
    const { data: provider, error: providerError } = await (supabaseAdmin
      .from("providers") as any)
      .insert({
        user_id: user.id,
        business_name,
        business_type: business_type === "mobile" ? "freelancer" : "salon", // Map: "mobile" -> "freelancer", "salon"/"both" -> "salon"
        slug: slug,
        description: description || null,
        previous_software: previous_software || null,
        previous_software_other: previous_software === "other" ? (previous_software_other || null) : null,
        phone: owner_phone || legacyPhone || "",
        email: owner_email || legacyEmail || "",
        status: autoApprove ? "active" : "pending_approval", // Auto-approve if enabled, otherwise pending
        // New onboarding metadata fields
        team_size: team_size || null,
        yoco_machine: yoco_machine || null,
        yoco_machine_other: yoco_machine === "other" ? (yoco_machine_other || null) : null,
        payroll_type: payroll_type || null,
        payroll_details: payroll_type === "other" ? (payroll_details || null) : null,
        // VAT registration fields
        is_vat_registered: is_vat_registered === true,
        vat_number: is_vat_registered === true ? (vat_number || null) : null,
        // New fields for public homepage optimization
        years_in_business: years_in_business || null,
        accepts_custom_requests: accepts_custom_requests || false,
        response_rate: response_rate || 100,
        response_time_hours: response_time_hours || 1,
        languages_spoken: languages_spoken || ["English"],
        social_media_links: social_media_links || {},
        website: website || null,
        tax_rate_percent: is_vat_registered === true ? 15 : (tax_rate_percent ?? 0),
        tips_enabled: tips_enabled || false,
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

    // Upload thumbnail and gallery images to storage
    let uploadedThumbnailUrl: string | null = null;
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
    if (uploadedThumbnailUrl || uploadedGalleryUrls.length > 0) {
      const updateData: any = {};
      if (uploadedThumbnailUrl) {
        updateData.thumbnail_url = uploadedThumbnailUrl;
      }
      if (uploadedGalleryUrls.length > 0) {
        updateData.gallery = uploadedGalleryUrls;
      }

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
    // Update phone if provided and verified
    if (owner_phone && owner_phone.trim()) {
      userUpdates.phone = owner_phone.trim();
      userUpdates.phone_verified = true;
      userUpdates.phone_verified_at = new Date().toISOString();
    }
    // Update email if provided
    if (owner_email && owner_email.trim()) {
      userUpdates.email = owner_email.trim();
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
    // Always create location (even without coordinates) as it's required for the provider
    const { error: locationError } = await supabaseAdmin
      .from("provider_locations")
      .insert({
        provider_id: providerId,
        name: "Main Location",
        address_line1: address.line1,
        address_line2: address.line2 || null,
        city: address.city,
        state: address.state || null,
        postal_code: address.postal_code || null,
        country: address.country,
        latitude: address.latitude || null,
        longitude: address.longitude || null,
        working_hours: operating_hours, // Store operating_hours as working_hours JSONB
        is_active: true,
        is_primary: true,
      });

    if (locationError) {
      console.error("Error creating provider location:", locationError);
      // This is critical, so we should fail if location creation fails
      return errorResponse(
        `Failed to create provider location: ${locationError.message}`,
        "LOCATION_CREATION_ERROR",
        500,
        locationError
      );
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

    // Auto-generate basic services if none provided but categories selected
    let servicesToCreate = services || [];
    if (servicesToCreate.length === 0 && global_category_ids && global_category_ids.length > 0) {
      // Get category names to generate relevant services
      const { data: categories } = await supabaseAdmin
        .from("global_categories")
        .select("id, name, slug")
        .in("id", global_category_ids);

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
              currency: "ZAR",
              supports_at_home: template.supports_at_home || false,
              supports_at_salon: business_type === "salon" || business_type === "both",
              category_id: category.id,
            });
          });
        } else {
          // Generic service for unknown categories
          generatedServices.push({
            title: `${category.name} Service`,
            description: `Professional ${category.name.toLowerCase()} service`,
            duration_minutes: 60,
            price: 200,
            currency: "ZAR",
            supports_at_home: business_type === "mobile" || business_type === "both",
            supports_at_salon: business_type === "salon" || business_type === "both",
            category_id: category.id,
          });
        }
      });

      // Limit to 5 services max for auto-generation
      servicesToCreate = generatedServices.slice(0, 5);
    }

    // Create services/offerings if provided or auto-generated
    if (servicesToCreate.length > 0) {
      const offerings = servicesToCreate.map((service) => ({
        provider_id: providerId,
        title: service.title,
        description: service.description || null,
        duration_minutes: service.duration_minutes,
        price: service.price,
        currency: service.currency || "ZAR",
        supports_at_home: service.supports_at_home || false,
        supports_at_salon: service.supports_at_salon !== false, // Default to true
        category_id: service.category_id || null,
        is_active: true,
      }));

      const { data: createdOfferings, error: servicesError } = await supabaseAdmin
        .from("offerings")
        .insert(offerings)
        .select();

      if (servicesError) {
        console.error("Error creating services:", servicesError);
        // Don't fail the entire request, but log the error
        // Services can be added later
      } else if (createdOfferings && createdOfferings.length > 0) {
        // Create addons for each service
        const addonsToCreate: any[] = [];
        createdOfferings.forEach((offering, index) => {
          const serviceData = services[index];
          const serviceAddons = serviceData?.addons || [];
          serviceAddons.forEach((addon) => {
            addonsToCreate.push({
              provider_id: providerId,
              offering_id: offering.id,
              name: addon.name,
              description: addon.description || null,
              price: addon.price,
              currency: addon.currency || "ZAR",
              duration_minutes: addon.duration_minutes || 0,
              is_active: true,
            });
          });
        });

        if (addonsToCreate.length > 0) {
          const { error: addonsError } = await supabaseAdmin
            .from("service_addons")
            .insert(addonsToCreate);

          if (addonsError) {
            console.error("Error creating addons:", addonsError);
            // Don't fail the entire request, but log the error
            // Addons can be added later
          }
        }
      }
    }

    // Upgrade user role to provider_owner if they're currently a customer using admin client
    const userRole = user.role;
    if (userRole === 'customer') {
      const { error: roleError } = await supabaseAdmin
        .from('users')
        .update({ role: 'provider_owner' })
        .eq('id', user.id);
      
      if (roleError) {
        console.error('Error upgrading user role:', roleError);
        // Don't fail the request, but log the error
        // The role can be updated manually if needed
      }
    }

    // Auto-select service zones if provided
    if (selected_zone_ids && selected_zone_ids.length > 0) {
      // Get platform default travel fee settings
      const { data: platformSettings } = await supabaseAdmin
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .single();

      const platformTravelFees = platformSettings?.settings?.travel_fees || {
        default_rate_per_km: 8.00,
        default_minimum_fee: 20.00,
        default_maximum_fee: null,
        default_currency: "ZAR",
      };

      // Create zone selections with default pricing
      const zoneSelections = selected_zone_ids.map((zoneId) => ({
        provider_id: providerId,
        platform_zone_id: zoneId,
        travel_fee: platformTravelFees.default_minimum_fee || 20.00,
        currency: platformTravelFees.default_currency || "ZAR",
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
    }

    // Delete draft after successful onboarding using admin client
    await supabaseAdmin
      .from("provider_onboarding_drafts")
      .delete()
      .eq("user_id", user.id);

    // Note: Subscription creation requires payment authorization via Paystack
    // The selected_plan_id is passed in the response so the frontend can handle
    // subscription creation after onboarding completes via /api/provider/subscriptions/create
    // This allows the provider to complete the payment authorization flow

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
    
    if (autoConfigDetails.length > 0) {
      message += ` We've automatically configured: ${autoConfigDetails.join(', ')}.`;
    }

    return successResponse({
      provider,
      message,
      auto_approved: autoApprove,
      selected_plan_id: selected_plan_id || null,
      subscription_endpoint: selected_plan_id ? "/api/provider/subscriptions/create" : null,
      auto_configured: {
        zones: selected_zone_ids?.length || 0,
        services: servicesToCreate.length > 0 && services.length === 0 ? servicesToCreate.length : 0,
        mobile_ready: business_type === "mobile",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to complete onboarding");
  }
}
