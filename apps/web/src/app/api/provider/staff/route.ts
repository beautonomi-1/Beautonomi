import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkStaffManagementFeatureAccess } from "@/lib/subscriptions/feature-access";
import { checkStaffLimit, formatLimitError } from "@/lib/subscriptions/limit-checker";
import { z } from "zod";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "provider_staff";
  is_active: boolean;
}

/**
 * GET /api/provider/staff
 *
 * PROVIDER STAFF vs ADMIN STAFF (Cross-Portal boundary):
 * - Provider staff: returns ONLY staff for the current provider (via getProviderIdForUser).
 * - Admin staff: GET /api/admin/staff returns ALL provider_staff across providers (superadmin only).
 * - Same provider_staff table; different scoping. See admin/staff/route.ts for boundary doc.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      console.error("Provider not found for user:", user.id);
      return notFoundResponse("Provider not found");
    }
    
    // Check if provider is a freelancer
    const { data: providerData } = await supabase
      .from("providers")
      .select("business_type")
      .eq("id", providerId)
      .single();
    
    const isFreelancer = providerData?.business_type === 'freelancer';
    
    // If location_id is provided, first get staff IDs assigned to that location
    let staffIds: string[] | null = null;
    if (locationId) {
      const { data: assignments, error: assignmentError } = await supabase
        .from("provider_staff_locations")
        .select("staff_id")
        .eq("location_id", locationId);
      
      if (assignmentError) {
        throw assignmentError;
      }
      
      staffIds = assignments?.map(a => a.staff_id) || [];
      
      // For freelancers: if no assignment found, check if location belongs to provider
      // This is a fallback for edge cases where assignment might be missing
      if (isFreelancer && staffIds.length === 0) {
        const { data: locationData } = await supabase
          .from("provider_locations")
          .select("id")
          .eq("id", locationId)
          .eq("provider_id", providerId)
          .single();
        
        // If location belongs to freelancer, get their staff ID
        if (locationData) {
          const { data: freelancerStaff } = await supabase
            .from("provider_staff")
            .select("id")
            .eq("provider_id", providerId)
            .eq("role", "owner")
            .limit(1);
          
          if (freelancerStaff && freelancerStaff.length > 0) {
            staffIds = [freelancerStaff[0].id];
          }
        }
      }
      
      // If still no staff found, return empty array
      if (!staffIds || staffIds.length === 0) {
        return successResponse([]);
      }
    }
    
    // Build staff query with optional location filter
    // Start with basic fields to avoid RLS issues with nested relationships
    let staffQuery = supabase
      .from("provider_staff")
      .select(
        `
        id,
        user_id,
        provider_id,
        name,
        email,
        phone,
        avatar_url,
        role,
        is_active,
        mobile_ready,
        working_hours
      `
      )
      .eq("provider_id", providerId);
    
    // If location_id is provided, filter by staff IDs
    if (locationId && staffIds && staffIds.length > 0) {
      staffQuery = staffQuery.in("id", staffIds);
    }
    
    const { data: staff, error } = await staffQuery.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching staff:", error);
      throw error;
    }

    // Fetch related data separately to avoid RLS issues
    const staffWithDetails = await Promise.all(
      (staff || []).map(async (member: any) => {
        // Try to fetch user data if user_id exists
        let userData = null;
        if (member.user_id) {
          const { data: user } = await supabase
            .from("users")
            .select("id, full_name, email, phone, avatar_url")
            .eq("id", member.user_id)
            .maybeSingle();
          userData = user;
        }

        // Try to fetch location assignments separately to avoid RLS issues
        let locations: any[] = [];
        try {
          const { data: assignments } = await supabase
            .from("provider_staff_locations")
            .select("location_id, is_primary")
            .eq("staff_id", member.id);
          
          if (assignments && assignments.length > 0) {
            // Fetch location details separately
            const locationIds = assignments.map(a => a.location_id);
            const { data: locationDetails } = await supabase
              .from("provider_locations")
              .select("id, name, city")
              .in("id", locationIds);
            
            const locationMap = new Map((locationDetails || []).map((loc: any) => [loc.id, loc]));
            
            locations = assignments.map((sl: any) => {
              const location = locationMap.get(sl.location_id);
              return {
                location_id: sl.location_id,
                location_name: location?.name || null,
                location_city: location?.city || null,
                is_primary: sl.is_primary || false,
              };
            });
          }
        } catch (locError) {
          console.warn("Error fetching staff locations:", locError);
          // Continue without location data
        }

        return {
          ...member,
          users: userData,
          staff_locations: locations,
        };
      })
    );

    // Transform to match expected format
    // Use provider_staff data first (since we store it there), then fall back to users table
    // Map database role format to API format
    const transformedStaff = (staffWithDetails || []).map((member: any) => {
      // Map database role (owner/manager/employee) to API format (provider_owner/provider_manager/provider_staff)
      const apiRole = member.role === "owner" ? "provider_owner"
                   : member.role === "manager" ? "provider_manager"
                   : "provider_staff";
      
      // Extract location assignments (staff_locations have location_name/location_city from join)
      const locations = (member.staff_locations || []).map((sl: any) => ({
        location_id: sl.location_id,
        location_name: sl.location_name ?? sl.location?.name ?? null,
        location_city: sl.location_city ?? sl.location?.city ?? null,
        is_primary: sl.is_primary || false,
      }));
      
      return {
        id: member.id,
        name: member.name || member.users?.full_name || "Staff Member",
        email: member.email || member.users?.email || "",
        phone: member.phone || member.users?.phone || null,
        avatar_url: member.avatar_url || member.users?.avatar_url || null,
        role: apiRole,
        is_active: member.is_active ?? true,
        mobileReady: member.mobile_ready ?? false, // Map snake_case to camelCase
        locations: locations, // Include location assignments
        primary_location_id: locations.find((l: any) => l.is_primary)?.location_id || null,
        working_hours: member.working_hours ?? null, // For calendar: staff-specific working hours
      };
    });

    return successResponse(transformedStaff as StaffMember[]);
  } catch (error) {
    console.error("Staff API error:", error);
    // Provide more specific error message
    if (error instanceof Error) {
      if (error.message.includes("Authentication") || error.message.includes("permissions")) {
        return handleApiError(error, "Authentication failed. Please log in again.", "AUTH_ERROR", 401);
      }
      if (error.message.includes("Provider not found")) {
        return handleApiError(error, "Provider account not found.", "PROVIDER_NOT_FOUND", 404);
      }
    }
    return handleApiError(error, "Failed to fetch staff");
  }
}

const addStaffSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.string().optional().default("provider_staff"),
  name: z.string().optional(),
  phone: z.string().optional().nullable(),
  mobileReady: z.boolean().optional().default(false),
});

/**
 * POST /api/provider/staff
 * 
 * Add a new staff member
 */
export async function POST(request: Request) {
  try {
    // Check permission to manage team
    const permissionCheck = await requirePermission('manage_team', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows staff management
    const staffAccess = await checkStaffManagementFeatureAccess(providerId);
    if (!staffAccess.enabled) {
      return errorResponse(
        "Staff management requires a subscription upgrade. Please upgrade your plan to add staff members.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Check staff limit using new limit checker
    const staffLimitCheck = await checkStaffLimit(providerId);
    if (!staffLimitCheck.canProceed) {
      return errorResponse(
        formatLimitError(staffLimitCheck),
        "SUBSCRIPTION_LIMIT_EXCEEDED",
        403
      );
    }

    const body = await request.json();

    // Validate input
    const validationResult = addStaffSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { email, role, name, phone, mobileReady } = validationResult.data;

    // Map API role format to database role format
    // API uses: provider_staff, provider_manager, provider_owner
    // Database expects: employee, manager, owner
    const dbRole = role === "provider_owner" ? "owner" 
                 : role === "provider_manager" ? "manager" 
                 : "employee";

    // Find user by email or create if doesn't exist
    let { data: foundUser, error: _findUserError } = await supabase
      .from("users")
      .select("id, full_name, email, phone")
      .eq("email", email)
      .maybeSingle();

    if (!foundUser) {
      // User doesn't exist - we need to create an auth user first
      // Since users table references auth.users, we need to use Supabase Admin
      try {
        // Check if service role key is available
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error("SUPABASE_SERVICE_ROLE_KEY is not set");
          return errorResponse(
            "Server configuration error: Service role key not configured. Cannot create users automatically.",
            "CONFIG_ERROR",
            500
          );
        }

        const { createClient } = await import("@supabase/supabase-js");
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


        // Create auth user with a temporary password (user will need to reset)
        const tempPassword = `Temp${Math.random().toString(36).slice(-12)}!`;
        console.log("Creating auth user for:", email);
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          password: tempPassword,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            full_name: name || email.split("@")[0],
            name: name || email.split("@")[0], // Also set 'name' for trigger compatibility
            phone: phone || null,
            role: "customer", // Default role
          },
        });

        if (authError || !authUser?.user) {
          console.error("Failed to create auth user:", authError);
          return errorResponse(
            `Failed to create user account: ${authError?.message || "Unknown error"}. The user may need to sign up first.`,
            "USER_CREATION_ERROR",
            500,
            authError
          );
        }

        console.log("Auth user created, waiting for trigger...", authUser.user.id);

        // Wait a moment for the trigger to create the user record
        // Try multiple times in case trigger is slow
        // Use admin client to bypass RLS when checking for user profile
        let createdUser = null;
        let fetchError = null;
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          // Use admin client to bypass RLS when checking for user profile
          const { data: user, error: err } = await supabaseAdmin
            .from("users")
            .select("id, full_name, email, phone")
            .eq("id", authUser.user.id)
            .maybeSingle();

          if (user) {
            createdUser = user;
            break;
          }
          fetchError = err;
        }

        if (!createdUser) {
          console.error("Failed to fetch created user after retries, attempting manual creation:", fetchError);

          // Fallback: Try to fetch the user profile one more time with admin client
          // The profile might exist but wasn't visible due to RLS
          try {
            const { data: finalUser, error: _finalError } = await supabaseAdmin
              .from("users")
              .select("id, full_name, email, phone")
              .eq("id", authUser.user.id)
              .maybeSingle();

            if (finalUser) {
              createdUser = finalUser;
              console.log("User profile found with admin client:", createdUser.id);
            } else {
              // If still not found, try to create manually (in case trigger truly didn't fire)
              const { data: manualUser, error: manualError } = await supabaseAdmin
                .from("users")
                .insert({
                  id: authUser.user.id,
                  email: email,
                  full_name: name || email.split("@")[0],
                  phone: phone || null,
                  role: "customer",
                })
                .select("id, full_name, email, phone")
                .single();

              if (manualUser) {
                createdUser = manualUser;
                console.log("User profile created manually:", createdUser.id);
              } else if (manualError?.code === '23505') {
                // Duplicate key error - user already exists, fetch it
                const { data: existingUser } = await supabaseAdmin
                  .from("users")
                  .select("id, full_name, email, phone")
                  .eq("id", authUser.user.id)
                  .single();
                if (existingUser) {
                  createdUser = existingUser;
                  console.log("User profile found after duplicate key error:", createdUser.id);
                } else {
                  throw manualError || new Error("Failed to create or fetch user profile");
                }
              } else {
                throw manualError || new Error("Failed to create user profile manually");
              }
            }
          } catch (manualError: any) {
            console.error("Failed to fetch or create user profile:", manualError);
            return errorResponse(
              "User account created but profile not found. Please try again or contact support.",
              "USER_FETCH_ERROR",
              500,
              manualError || fetchError
            );
          }
        }

        console.log("User profile found:", createdUser.id);
        foundUser = createdUser;
      } catch (error: any) {
        console.error("Error creating user:", error);
        return errorResponse(
          `Failed to create user: ${error?.message || "Unknown error"}. Please ensure the user exists or contact support.`,
          "USER_CREATION_ERROR",
          500,
          error
        );
      }
    }

    // Check if already a staff member
    const { data: existingStaff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("provider_id", providerId)
      .eq("user_id", foundUser.id)
      .maybeSingle();

    if (existingStaff) {
      return errorResponse("User is already a staff member", "DUPLICATE_ERROR", 400);
    }

    // Add staff member
    const { data: newStaff, error: insertError } = await (supabase
      .from("provider_staff") as any)
      .insert({
        provider_id: providerId,
        user_id: foundUser.id,
        name: name || foundUser.full_name || foundUser.email?.split("@")[0] || "Staff Member",
        email: foundUser.email,
        phone: foundUser.phone,
        role: dbRole,
        is_active: true,
        mobile_ready: mobileReady || false,
      })
      .select(
        `
        id,
        user_id,
        provider_id,
        role,
        is_active,
        users:user_id(id, full_name, email, phone)
      `
      )
      .single();

    if (insertError || !newStaff) {
      console.error("Failed to insert staff member:", insertError);
      throw insertError || new Error("Failed to create staff member");
    }

    console.log("Staff member created successfully:", newStaff.id);

    // Transform response
    // Map database role format back to API format
    // Database uses: owner, manager, employee
    // API expects: provider_owner, provider_manager, provider_staff
    const apiRole = newStaff.role === "owner" ? "provider_owner"
                  : newStaff.role === "manager" ? "provider_manager"
                  : "provider_staff";
    
    const transformedStaff = {
      id: newStaff.id,
      name: newStaff.name || newStaff.users?.full_name || "Staff Member",
      email: newStaff.email || newStaff.users?.email || "",
      phone: newStaff.phone || newStaff.users?.phone || null,
      role: apiRole,
      is_active: newStaff.is_active ?? true,
    };

    return successResponse(transformedStaff as StaffMember);
  } catch (error) {
    return handleApiError(error, "Failed to add staff member");
  }
}
