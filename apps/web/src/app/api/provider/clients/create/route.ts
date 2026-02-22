import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  getProviderIdForUser,
  normalizePhoneToE164,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * Helper function to create a walk-in email
 */
function createWalkInEmail(): string {
  return `walkin-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@beautonomi.invalid`;
}

/**
 * Helper function to wait for user profile row to be created by trigger
 */
async function _waitForUserProfileRow(
  supabase: any,
  userId: string,
  maxAttempts = 20
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (data) {
      return;
    }

    // If we get a specific error (not just "not found"), log it
    if (error && error.code !== 'PGRST116') {
      console.error(`Error checking for user profile (attempt ${i + 1}):`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  
  // Try one more time to get the actual error
  const { error: finalError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .single();
  
  if (finalError) {
    throw new Error(`User profile row was not created: ${finalError.message || JSON.stringify(finalError)}`);
  }
  
  throw new Error("User profile row was not created in time (trigger may not have fired)");
}

/**
 * POST /api/provider/clients/create
 * Create a new client (user) and add them to provider's client list
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to edit clients (pass request for Bearer token from mobile)
    const permissionCheck = await requirePermission("edit_clients", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const body = await request.json();

    // Validate required fields
    if (!body.full_name && (!body.first_name || !body.last_name)) {
      return handleApiError(
        new Error("Full name or first name and last name are required"),
        "Validation error",
        400
      );
    }

    // Combine first_name and last_name into full_name if needed
    const full_name = body.full_name || `${body.first_name} ${body.last_name}`.trim();

    // Create email if not provided
    const email = body.email || createWalkInEmail();

    // Validate and format phone number to E.164 if provided
    // Use helper function to normalize phone number (removes + prefix, handles leading 0)
    // Accept countryCode from request body to handle numbers starting with 0
    const phone = normalizePhoneToE164(body.phone, body.countryCode);
    
    if (body.phone && !phone) {
      console.warn(`Phone number "${body.phone}" is not in valid E.164 format. It will be stored in user profile but not in auth.`);
    }

    // Check if user already exists by email
    let customerId: string | null = null;
    if (body.email) {
      const { data: existingUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existingUser) {
        customerId = existingUser.id;
      }
    }

    // Also check by phone if email didn't work
    if (!customerId && body.phone) {
      const { data: existingUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("phone", body.phone)
        .maybeSingle();

      if (existingUser) {
        customerId = existingUser.id;
      }
    }

    // If user doesn't exist, create new user
    if (!customerId) {
      let authUserId: string | undefined;
      
      // OPTION 1: Try to create auth user using Supabase Admin SDK
      try {
        const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true,
          user_metadata: {
            full_name: full_name,
            phone: body.phone || null,
            role: "customer",
          },
        });

        if (createdUser?.user?.id) {
          authUserId = createdUser.user.id;
          console.log(`✓ Created auth user via SDK: ${authUserId}`);
        } else if (createUserError) {
          console.warn("Auth SDK creation failed:", createUserError.message);
        }
      } catch (authError: any) {
        console.error("Exception during auth SDK creation:", authError.message);
      }

      // OPTION 2: If SDK failed, try direct database query to find existing user
      if (!authUserId) {
        try {
          console.log("Attempting to find existing auth user by email...");
          const { data: existingUsers, error: queryError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("email", email)
            .limit(1);
          
          if (existingUsers && existingUsers.length > 0) {
            authUserId = existingUsers[0].id;
            console.log(`✓ Found existing user in public.users: ${authUserId}`);
          } else if (queryError) {
            console.error("Error querying existing users:", queryError);
          }
        } catch (lookupError) {
          console.error("Exception looking up existing user:", lookupError);
        }
      }

      // OPTION 3: If still no user, use bypass function to insert directly (NUCLEAR OPTION)
      if (!authUserId) {
        try {
          console.log("Attempting direct user creation via bypass function...");
          
          // Call the bypass function that creates both auth.users and public.users
          const { data: bypassResult, error: bypassError } = await supabaseAdmin
            .rpc('create_user_bypass_trigger', {
              p_email: email,
              p_full_name: full_name,
              p_phone: body.phone || null,
              p_role: 'customer'
            });
          
          if (bypassResult && bypassResult.success && bypassResult.user_id) {
            authUserId = bypassResult.user_id;
            customerId = authUserId;
            console.log(`✓ Created user via bypass function: ${authUserId}`);
            
            // User and wallet already created by the function, skip manual creation below
            // Jump directly to client creation
            const { error: clientError } = await supabaseAdmin
              .from("provider_clients")
              .insert({
                provider_id: providerId,
                customer_id: customerId,
                notes: body.notes || "",
              });

            if (clientError) {
              throw clientError;
            }

            // Fetch the created user details
            const { data: userData } = await supabaseAdmin
              .from("users")
              .select("id, email, full_name, phone, created_at")
              .eq("id", customerId)
              .single();

            return NextResponse.json({
              success: true,
              data: userData,
            });
          } else {
            console.error("Bypass function failed:", bypassResult?.error || bypassError);
          }
        } catch (sqlError: any) {
          console.error("Exception during bypass function:", sqlError.message);
        }
      }

      // FINAL FALLBACK: If all methods failed, return error
      if (!authUserId) {
        console.error("All auth creation methods failed. Cannot proceed without auth user.");
        return handleApiError(
          new Error("Failed to create user account. Please apply migration 200 (create_user_bypass_trigger function) or contact support."),
          "Failed to create client",
          500
        );
      }

      customerId = authUserId;
      
      // If we reach here, customerId should be set (either from successful creation or from error recovery)
      if (!customerId) {
        return handleApiError(
          new Error("User ID not available after creation attempt"),
          "Failed to create client",
          500
        );
      }
      
      // Manually create user profile (bypass trigger completely)
      console.log(`Creating user profile for ${customerId} (bypassing trigger)`);
      
      const { data: _manualUser, error: manualError } = await supabaseAdmin
        .from("users")
        .insert({
          id: customerId,
          email: email,
          full_name: full_name,
          phone: body.phone || null,
          role: "customer",
        })
        .select()
        .single();
      
      if (manualError && manualError.code !== '23505') { // Ignore duplicate key errors
        console.error("Error creating user profile:", manualError);
        
        // If user already exists, just update it
        const { error: updateError } = await supabaseAdmin
          .from("users")
          .update({
            email: email,
            full_name: full_name,
            phone: body.phone || null,
          })
          .eq("id", customerId);
        
        if (updateError) {
          console.error("Error updating existing user profile:", updateError);
        }
      }
      
      // Create wallet for new user
      try {
        await supabaseAdmin
          .from("user_wallets")
          .insert({
            user_id: customerId,
            currency: "ZAR",
          });
      } catch (walletError: any) {
        if (walletError?.code !== '23505') { // Ignore duplicate key errors
          console.warn("Error creating wallet:", walletError);
        }
      }
      
      console.log("Successfully created user profile manually");

      // Update user profile with all additional fields
      const userUpdates: Record<string, unknown> = {
        full_name: full_name,
      };

      if (body.preferred_name) userUpdates.preferred_name = body.preferred_name;
      if (body.phone) userUpdates.phone = body.phone;
      if (body.date_of_birth) userUpdates.date_of_birth = body.date_of_birth;
      if (body.emergency_contact_name) userUpdates.emergency_contact_name = body.emergency_contact_name;
      if (body.emergency_contact_phone) userUpdates.emergency_contact_phone = body.emergency_contact_phone;
      if (body.emergency_contact_relationship) userUpdates.emergency_contact_relationship = body.emergency_contact_relationship;
      if (body.preferred_language) userUpdates.preferred_language = body.preferred_language;
      if (body.preferred_currency) userUpdates.preferred_currency = body.preferred_currency;
      if (body.timezone) userUpdates.timezone = body.timezone;
      if (body.email_notifications_enabled !== undefined) userUpdates.email_notifications_enabled = body.email_notifications_enabled;
      if (body.sms_notifications_enabled !== undefined) userUpdates.sms_notifications_enabled = body.sms_notifications_enabled;
      if (body.push_notifications_enabled !== undefined) userUpdates.push_notifications_enabled = body.push_notifications_enabled;

      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update(userUpdates)
        .eq("id", customerId);

      if (updateError) {
        console.error("Error updating user profile:", updateError);
        // If this is a critical error (not just a constraint issue), we should handle it
        if (updateError.code && !updateError.code.startsWith('23')) { // 23xxx are constraint violations
          return handleApiError(
            new Error(`Failed to update user profile: ${updateError.message || JSON.stringify(updateError)}`),
            "Database error creating new user",
            500
          );
        }
        // For constraint violations, just log and continue
      }

      // Create address if provided
      if (body.address && body.address.line1 && body.address.city) {
        const addressData = {
          user_id: customerId,
          address_line1: body.address.line1,
          address_line2: body.address.line2 || null,
          city: body.address.city,
          state: body.address.state || null,
          postal_code: body.address.postal_code || null,
          country: body.address.country || "ZA",
          is_default: true,
        };

        // Unset other defaults first
        await supabaseAdmin
          .from("user_addresses")
          .update({ is_default: false })
          .eq("user_id", customerId)
          .eq("is_default", true);

        const { error: addressError } = await supabaseAdmin
          .from("user_addresses")
          .insert(addressData);

        if (addressError) {
          console.error("Error creating address:", addressError);
          // Don't fail, just log the error
        }
      }
    } else {
      // User exists, update their profile if needed
      const userUpdates: Record<string, unknown> = {};
      
      if (body.preferred_name) userUpdates.preferred_name = body.preferred_name;
      if (body.phone) userUpdates.phone = body.phone;
      if (body.date_of_birth) userUpdates.date_of_birth = body.date_of_birth;
      if (body.emergency_contact_name) userUpdates.emergency_contact_name = body.emergency_contact_name;
      if (body.emergency_contact_phone) userUpdates.emergency_contact_phone = body.emergency_contact_phone;
      if (body.emergency_contact_relationship) userUpdates.emergency_contact_relationship = body.emergency_contact_relationship;
      if (body.preferred_language) userUpdates.preferred_language = body.preferred_language;
      if (body.preferred_currency) userUpdates.preferred_currency = body.preferred_currency;
      if (body.timezone) userUpdates.timezone = body.timezone;
      if (body.email_notifications_enabled !== undefined) userUpdates.email_notifications_enabled = body.email_notifications_enabled;
      if (body.sms_notifications_enabled !== undefined) userUpdates.sms_notifications_enabled = body.sms_notifications_enabled;
      if (body.push_notifications_enabled !== undefined) userUpdates.push_notifications_enabled = body.push_notifications_enabled;

      if (Object.keys(userUpdates).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from("users")
          .update(userUpdates)
          .eq("id", customerId);

        if (updateError) {
          console.error("Error updating existing user:", updateError);
        }
      }

      // Update or create address if provided
      if (body.address && body.address.line1 && body.address.city) {
        const { data: existingAddress } = await supabaseAdmin
          .from("user_addresses")
          .select("id")
          .eq("user_id", customerId)
          .eq("is_default", true)
          .maybeSingle();

        const addressData = {
          user_id: customerId,
          address_line1: body.address.line1,
          address_line2: body.address.line2 || null,
          city: body.address.city,
          state: body.address.state || null,
          postal_code: body.address.postal_code || null,
          country: body.address.country || "ZA",
          is_default: true,
        };

        if (existingAddress) {
          await supabaseAdmin
            .from("user_addresses")
            .update(addressData)
            .eq("id", existingAddress.id);
        } else {
          await supabaseAdmin
            .from("user_addresses")
            .update({ is_default: false })
            .eq("user_id", customerId)
            .eq("is_default", true);

          await supabaseAdmin
            .from("user_addresses")
            .insert(addressData);
        }
      }
    }

    // Now add to provider_clients table
    const { data: existingClient } = await supabaseAdmin
      .from("provider_clients")
      .select("id")
      .eq("provider_id", providerId)
      .eq("customer_id", customerId)
      .maybeSingle();

    let providerClient;
    if (existingClient) {
      // Update existing
      const { data, error } = await supabaseAdmin
        .from("provider_clients")
        .update({
          notes: body.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingClient.id)
        .select()
        .single();

      if (error) throw error;
      providerClient = data;
    } else {
      // Create new
      const { data, error } = await supabaseAdmin
        .from("provider_clients")
        .insert({
          provider_id: providerId,
          customer_id: customerId,
          notes: body.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      providerClient = data;
    }

    // Fetch full user data
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", customerId)
      .single();

    // Parse full_name into first_name and last_name for response
    const fullName = userData?.full_name || "";
    const nameParts = fullName.trim().split(/\s+/);
    const first_name = nameParts[0] || "";
    const last_name = nameParts.slice(1).join(" ") || "";

    return successResponse({
      ...providerClient,
      customer: {
        ...userData,
        first_name,
        last_name,
      },
    });
  } catch (error) {
    console.error("Unexpected error in create client route:", error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : "Unknown error occurred";
    
    // Check if it's already a handled error with a specific message
    if (errorMessage.includes("Database error creating new user") || 
        errorMessage.includes("Failed to create user")) {
      return handleApiError(error, "Failed to create client", 500);
    }
    
    return handleApiError(
      new Error(`Failed to create client: ${errorMessage}`),
      "Failed to create client",
      500
    );
  }
}
