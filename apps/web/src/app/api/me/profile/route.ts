import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, notFoundResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import type { User } from "@/types/beautonomi";

/** User row from users table (select *) with optional profile fields */
type UserRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  preferred_name?: string | null;
  handle?: string | null;
  email_verified?: boolean;
  phone_verified?: boolean;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_email?: string | null;
  emergency_contact_country_code?: string | null;
  preferred_language?: string | null;
  signup_source?: string | null;
  identity_verification_status?: string | null;
  password_changed_at?: string | null;
  [key: string]: unknown;
};

/**
 * GET /api/me/profile
 * 
 * Get current user's profile
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const { data: userData, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !userData) {
      return notFoundResponse("User not found");
    }

    const u = userData as UserRow;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.email && u.email !== authUser.email) {
      await supabase
        .from("users")
        .update({ email: authUser.email })
        .eq("id", user.id);
      u.email = authUser.email;
    }

    // Get default address, verification, and profile data in parallel for better performance
    const [addressResult, verificationResult, profileResult] = await Promise.allSettled([
      supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle(), // Use maybeSingle to avoid errors if no address exists
      supabase
        .from("user_verifications")
        .select("id, status, submitted_at, rejection_reason, document_url, document_type")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(), // Use maybeSingle to avoid errors if no verification exists
      supabase
        .from("user_profiles")
        .select("beauty_preferences, privacy_settings, business_preferences, about, interests")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const defaultAddress = addressResult.status === 'fulfilled' ? addressResult.value.data : null;
    const verification = verificationResult.status === 'fulfilled' ? verificationResult.value.data : null;
    const profileData = profileResult.status === 'fulfilled' ? profileResult.value.data : null;

    // Parse full_name into first_name and last_name
    const fullName = userData.full_name || "";
    const nameParts = fullName.trim().split(/\s+/);
    const first_name = nameParts[0] || "";
    const last_name = nameParts.slice(1).join(" ") || "";

    const verificationStatus = verification?.status || u.identity_verification_status || "none";
    const identityVerified = verificationStatus === "approved";

    const formattedData = {
      ...userData,
      first_name,
      last_name,
      preferred_name: u.preferred_name ?? null,
      handle: u.handle ?? null,
      email_verified: u.email_verified ?? false,
      phone_verified: u.phone_verified ?? false,
      address: defaultAddress ? {
        country: defaultAddress.country || "",
        line1: defaultAddress.address_line1 || "",
        line2: defaultAddress.address_line2 || "",
        city: defaultAddress.city || "",
        state: defaultAddress.state || "",
        postal_code: defaultAddress.postal_code || "",
        street: defaultAddress.address_line1 || "",
        apt: defaultAddress.address_line2 || "",
        zip: defaultAddress.postal_code || "",
      } : null,
      emergency_contact: {
        name: u.emergency_contact_name || "",
        relationship: u.emergency_contact_relationship || "",
        language: u.preferred_language || "",
        email: u.emergency_contact_email ?? "",
        country_code: u.emergency_contact_country_code ?? "",
        phone: u.emergency_contact_phone || "",
      },
      identity_verified: identityVerified,
      identity_verification_status: verificationStatus,
      identity_verification_submitted_at: verification?.submitted_at ?? null,
      identity_verification_rejection_reason: verification?.rejection_reason ?? null,
      identity_verification_document_url: verification?.document_url ?? null,
      identity_verification_document_type: verification?.document_type ?? null,
      identity_verification_id: verification?.id ?? null,
      about: profileData?.about ?? null,
      interests: profileData?.interests ?? null,
      beauty_preferences: profileData?.beauty_preferences || {},
      privacy_settings: profileData?.privacy_settings || { services_booked_visible: false },
      business_preferences: profileData?.business_preferences || { email: null, enabled: false },
      password_changed_at: u.password_changed_at ?? null,
    };

    const res = successResponse(formattedData);
    res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    return res;
  } catch (error) {
    // Log the error for debugging
    console.error("Error in GET /api/me/profile:", error);
    return handleApiError(error, "Failed to fetch profile");
  }
}

/**
 * PATCH /api/me/profile
 * 
 * Update current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const body = await request.json();
    const supabase = await getSupabaseServer(request);

    const updates: Record<string, any> = {};

    // Handle first_name and last_name (combine into full_name)
    if (body.first_name !== undefined || body.last_name !== undefined) {
      const { data: currentUser } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user.id)
        .single();
      
      const currentFullName = currentUser?.full_name || "";
      const nameParts = currentFullName.trim().split(/\s+/);
      const currentFirst = nameParts[0] || "";
      const currentLast = nameParts.slice(1).join(" ") || "";
      
      const first = body.first_name !== undefined ? body.first_name : currentFirst;
      const last = body.last_name !== undefined ? body.last_name : currentLast;
      updates.full_name = `${first} ${last}`.trim();
    }

    // Handle preferred_name
    if (body.preferred_name !== undefined) {
      updates.preferred_name = body.preferred_name || null;
    }

    // Handle handle (username)
    if (body.handle !== undefined) {
      const handle = body.handle?.trim() || null;
      if (handle) {
        // Validate handle format (alphanumeric + underscore, 3-50 chars)
        if (!/^[a-zA-Z0-9_]{3,50}$/.test(handle)) {
          throw new Error("Handle must be 3-50 characters and contain only letters, numbers, and underscores");
        }
        // Check if handle is already taken (case-insensitive)
        const { data: existingUser } = await supabase
          .from("users")
          .select("id")
          .eq("handle", handle)
          .neq("id", user.id)
          .maybeSingle();
        
        if (existingUser) {
          throw new Error("This handle is already taken");
        }
      }
      updates.handle = handle;
    }

    // Handle other user fields
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;
    if (body.date_of_birth !== undefined) {
      // Server-side minimum age check (13+, POPIA / GDPR requirement)
      if (body.date_of_birth !== null) {
        const dob = new Date(body.date_of_birth as string);
        if (isNaN(dob.getTime())) {
          throw new Error("Invalid date_of_birth format. Expected YYYY-MM-DD.");
        }
        const minAgeDate = new Date();
        minAgeDate.setFullYear(minAgeDate.getFullYear() - 13);
        if (dob > minAgeDate) {
          throw new Error("You must be at least 13 years old to use Beautonomi.");
        }
      }
      updates.date_of_birth = body.date_of_birth;
    }
    if (body.preferred_language !== undefined) updates.preferred_language = body.preferred_language;
    if (body.signup_source !== undefined) {
      const allowed: string[] = [
        "google", "social_instagram", "social_facebook", "social_twitter",
        "friend_or_family", "blog_or_article", "app_store", "provider_referral", "other",
      ];
      const v = body.signup_source === null || body.signup_source === "" ? null : String(body.signup_source).trim();
      updates.signup_source = v && allowed.includes(v) ? v : (v ? "other" : null);
    }
    if (body.preferred_currency !== undefined) updates.preferred_currency = body.preferred_currency;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.preferred_home_tenant_id !== undefined) {
      const v = body.preferred_home_tenant_id;
      if (v === null || v === "") {
        updates.preferred_home_tenant_id = null;
      } else {
        const admin = getSupabaseAdmin();
        const { data: trow } = await admin
          .from("tenants")
          .select("id")
          .eq("id", v)
          .eq("is_active", true)
          .maybeSingle();
        if (!trow?.id) {
          throw new Error("Invalid preferred_home_tenant_id");
        }
        updates.preferred_home_tenant_id = v;
      }
    }
    // email_verified and phone_verified are INTENTIONALLY excluded from client PATCH.
    // They are set only by trusted server paths:
    //   - email_verified: Supabase auth webhook / POST /api/me/phone/verify
    //   - phone_verified: POST /api/me/phone/verify (reads supabase.auth.getUser() phone_confirmed_at)
    // Accepting these from the request body would allow any authenticated user to bypass
    // verification by sending { phone_verified: true } directly.

    // Handle emergency_contact object
    if (body.emergency_contact !== undefined) {
      const ec = body.emergency_contact;
      if (ec.name !== undefined) updates.emergency_contact_name = ec.name || null;
      if (ec.phone !== undefined) updates.emergency_contact_phone = ec.phone || null;
      if (ec.relationship !== undefined) updates.emergency_contact_relationship = ec.relationship || null;
      if (ec.language !== undefined) updates.preferred_language = ec.language || null;
      if (ec.email !== undefined) updates.emergency_contact_email = ec.email || null;
      if (ec.country_code !== undefined) updates.emergency_contact_country_code = ec.country_code || null;
    }

    // Handle address object
    if (body.address !== undefined) {
      const address = body.address;
      
      // Check if default address exists
      const { data: existingAddress } = await supabase
        .from("user_addresses")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .single();

      const addressData = {
        user_id: user.id,
        address_line1: address.line1 || address.street || "",
        address_line2: address.line2 || address.apt || "",
        city: address.city || "",
        state: address.state || "",
        postal_code: address.postal_code || address.zip || "",
        country: address.country || "",
        is_default: true,
        customer_managed_home: true,
      };

      if (existingAddress) {
        // Update existing default address
        const { error: addressError } = await supabase
          .from("user_addresses")
          .update(addressData)
          .eq("id", existingAddress.id);

        if (addressError) {
          throw new Error(`Failed to update address: ${addressError.message}`);
        }
      } else {
        // Create new default address (unset other defaults first)
        await supabase
          .from("user_addresses")
          .update({ is_default: false })
          .eq("user_id", user.id)
          .eq("is_default", true);

        const { error: addressError } = await supabase
          .from("user_addresses")
          .insert(addressData);

        if (addressError) {
          throw new Error(`Failed to create address: ${addressError.message}`);
        }
      }
    }

    // Handle business preferences (Beautonomi for Business)
    if (body.business_email !== undefined || body.business_features_enabled !== undefined) {
      const { data: existingProfile } = await supabase
        .from("user_profiles")
        .select("business_preferences")
        .eq("user_id", user.id)
        .maybeSingle();
      type ProfileRow = { business_preferences?: { email?: string | null; enabled?: boolean } | null };
      const current = (existingProfile as ProfileRow)?.business_preferences ?? { email: null, enabled: false };
      const businessPreferences = {
        email: body.business_email !== undefined ? (body.business_email || null) : current.email,
        enabled: body.business_features_enabled !== undefined ? Boolean(body.business_features_enabled) : current.enabled,
      };
      if (existingProfile) {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .update({ business_preferences: businessPreferences })
          .eq("user_id", user.id);
        if (profileError) throw new Error(`Failed to update business preferences: ${profileError.message}`);
      } else {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .insert({ user_id: user.id, business_preferences: businessPreferences });
        if (profileError) throw new Error(`Failed to save business preferences: ${profileError.message}`);
      }
    }

    // Update email in auth: Supabase sends a confirmation link to the new email;
    // the email is only updated after the user verifies. Do not write to users table until then.
    let emailChangePending = false;
    if (body.email !== undefined) {
      const { error: emailError } = await supabase.auth.updateUser({
        email: body.email,
      });
      if (emailError) {
        throw new Error(`Failed to update email: ${emailError.message}`);
      }
      emailChangePending = true;
      // Do not set updates.email – sync from auth after user confirms (see GET profile)
    }

    // If only email change, no DB update; return current profile and tell frontend to show verification message
    if (emailChangePending && Object.keys(updates).length === 0) {
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();
      if (userData) {
        const u = userData as UserRow;
        const fullName = u.full_name || "";
        const nameParts = fullName.trim().split(/\s+/);
        const { data: defaultAddress } = await supabase
          .from("user_addresses")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_default", true)
          .maybeSingle();
        const { data: verification } = await supabase
          .from("user_verifications")
          .select("id, status")
          .eq("user_id", user.id)
          .eq("status", "approved")
          .limit(1)
          .maybeSingle();
        const { data: updatedProfileData } = await supabase
          .from("user_profiles")
          .select("beauty_preferences, privacy_settings")
          .eq("user_id", user.id)
          .maybeSingle();
        const formattedData = {
          ...userData,
          first_name: nameParts[0] || "",
          last_name: nameParts.slice(1).join(" ") || "",
          preferred_name: u.preferred_name ?? null,
          handle: u.handle ?? null,
          email_verified: u.email_verified ?? false,
          phone_verified: u.phone_verified ?? false,
          address: defaultAddress ? {
            country: defaultAddress.country || "",
            line1: defaultAddress.address_line1 || "",
            line2: defaultAddress.address_line2 || "",
            city: defaultAddress.city || "",
            state: defaultAddress.state || "",
            postal_code: defaultAddress.postal_code || "",
            street: defaultAddress.address_line1 || "",
            apt: defaultAddress.address_line2 || "",
            zip: defaultAddress.postal_code || "",
          } : null,
          emergency_contact: {
            name: u.emergency_contact_name || "",
            relationship: u.emergency_contact_relationship || "",
            language: u.preferred_language || "",
            email: u.emergency_contact_email ?? "",
            country_code: u.emergency_contact_country_code ?? "",
            phone: u.emergency_contact_phone || "",
          },
          identity_verified: !!verification,
          identity_verification_status: verification?.status ?? u.identity_verification_status ?? null,
          beauty_preferences: updatedProfileData?.beauty_preferences || {},
          privacy_settings: updatedProfileData?.privacy_settings || { services_booked_visible: false },
          email_change_pending: true,
        };
        return successResponse(formattedData);
      }
    }

    // Update user record
    if (Object.keys(updates).length > 0) {
      const { data: userData, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", user.id)
        .select()
        .single();

      if (error || !userData) {
        throw new Error(error?.message || "Failed to update profile");
      }

      // Return formatted response
      const { data: defaultAddress } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .single();

      const { data: verification } = await supabase
        .from("user_verifications")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .limit(1)
        .single();

      const u = userData as UserRow;
      const fullName = u.full_name || "";
      const nameParts = fullName.trim().split(/\s+/);
      const first_name = nameParts[0] || "";
      const last_name = nameParts.slice(1).join(" ") || "";

      const { data: updatedProfileData } = await supabase
        .from("user_profiles")
        .select("beauty_preferences, privacy_settings")
        .eq("user_id", user.id)
        .maybeSingle();

      const formattedData = {
        ...userData,
        first_name,
        last_name,
        preferred_name: u.preferred_name ?? null,
        handle: u.handle ?? null,
        email_verified: u.email_verified ?? false,
        phone_verified: u.phone_verified ?? false,
        address: defaultAddress ? {
          country: defaultAddress.country || "",
          line1: defaultAddress.address_line1 || "",
          line2: defaultAddress.address_line2 || "",
          city: defaultAddress.city || "",
          state: defaultAddress.state || "",
          postal_code: defaultAddress.postal_code || "",
          street: defaultAddress.address_line1 || "",
          apt: defaultAddress.address_line2 || "",
          zip: defaultAddress.postal_code || "",
        } : null,
        emergency_contact: {
          name: u.emergency_contact_name || "",
          relationship: u.emergency_contact_relationship || "",
          language: u.preferred_language || "",
          email: u.emergency_contact_email ?? "",
          country_code: u.emergency_contact_country_code ?? "",
          phone: u.emergency_contact_phone || "",
        },
        identity_verified: !!verification,
        identity_verification_status: verification?.status ?? u.identity_verification_status ?? null,
        beauty_preferences: updatedProfileData?.beauty_preferences || {},
        privacy_settings: updatedProfileData?.privacy_settings || { services_booked_visible: false },
        ...(emailChangePending ? { email_change_pending: true } : {}),
      };

      return successResponse(formattedData);
    }

    // If no updates, return current data
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    return successResponse(userData as User);
  } catch (error) {
    return handleApiError(error, "Failed to update profile");
  }
}
