import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDefaultStaffPermissionsForDbRole } from "@/lib/provider/staff-invite-default-permissions";
import { sendStaffInvite, STAFF_INVITE_EXPIRY_DAYS } from "@/lib/provider/staff-invite";
import { recordStaffInvitationSent } from "@/lib/provider/staff-invitations";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_STAFF_INVITED } from "@/lib/analytics/amplitude/types";
import { getTeamRosterDetailLevel, redactStaffRowForViewer } from "@/lib/auth/provider-team-roster-access";
import { checkStaffManagementFeatureAccess } from "@/lib/subscriptions/feature-access";
import { checkStaffLimit, formatLimitError } from "@/lib/subscriptions/limit-checker";
import { resolveStaffLocationScope } from "@/lib/provider/staff-location-scope";
import { z } from "zod";

type PublicUserRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

async function findPublicUserByEmailAdmin(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
): Promise<PublicUserRow | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await admin
    .from("users")
    .select("id, full_name, email, phone")
    .ilike("email", normalized)
    .maybeSingle();
  return (data as PublicUserRow | null) ?? null;
}

function isAuthUserAlreadyRegistered(err: { message?: string } | null | undefined): boolean {
  const msg = (err?.message ?? "").toLowerCase();
  return msg.includes("already") && (msg.includes("registered") || msg.includes("exists"));
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "provider_staff";
  is_active: boolean;
}

interface StaffMemberRow {
  id: string;
  user_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  role?: string;
  is_active?: boolean;
  mobile_ready?: boolean;
  commission_rate?: number | null;
  working_hours?: unknown;
  over_cap_grace_until?: string | null;
  staff_locations?: StaffLocationItem[];
  users?: { full_name?: string; email?: string; phone?: string; avatar_url?: string } | null;
}
interface StaffLocationItem {
  location_id: string;
  location_name?: string | null;
  location_city?: string | null;
  is_primary?: boolean;
  location?: { name?: string; city?: string };
}
interface LocationRow {
  id: string;
  name?: string;
  city?: string;
}
interface AssignmentRow {
  location_id: string;
  is_primary?: boolean;
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
      .maybeSingle();
    
    const isFreelancer = providerData?.business_type === 'freelancer';

    const rosterDetailLevel = await getTeamRosterDetailLevel(user.id, request);
    
    const scope = await resolveStaffLocationScope(supabase, providerId, locationId);
    let staffIds = scope.staffIds;

    if (isFreelancer && staffIds !== null && staffIds.length === 0 && locationId) {
      const { data: locationData } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("id", locationId)
        .eq("provider_id", providerId)
        .maybeSingle();

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

    if (locationId && staffIds !== null && staffIds.length === 0) {
      return successResponse([]);
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
        commission_rate,
        working_hours,
        over_cap_grace_until
      `
      )
      .eq("provider_id", providerId)
      .is("deleted_at", null);
    
    if (staffIds && staffIds.length > 0) {
      staffQuery = staffQuery.in("id", staffIds);
    }
    
    const { data: staff, error } = await staffQuery.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching staff:", error);
      throw error;
    }

    const idsForServiceAssignments = (staff || []).map((m: StaffMemberRow) => m.id);
    const serviceIdsByStaff = new Map<string, string[]>();
    if (idsForServiceAssignments.length > 0) {
      const { data: svcAssignRows } = await supabase
        .from("staff_services")
        .select("staff_id, offering_id")
        .in("staff_id", idsForServiceAssignments);
      for (const row of svcAssignRows ?? []) {
        const r = row as { staff_id: string; offering_id: string };
        const arr = serviceIdsByStaff.get(r.staff_id) ?? [];
        arr.push(r.offering_id);
        serviceIdsByStaff.set(r.staff_id, arr);
      }
    }

    // Fetch related data separately to avoid RLS issues
    const staffWithDetails = await Promise.all(
      (staff || []).map(async (member: StaffMemberRow) => {
        // Try to fetch user data if user_id exists
        let userData: { full_name?: string; email?: string; phone?: string; avatar_url?: string } | null = null;
        if (member.user_id) {
          const { data: user } = await supabase
            .from("users")
            .select("id, full_name, email, phone, avatar_url")
            .eq("id", member.user_id)
            .maybeSingle();
          userData = user as typeof userData;
        }

        // Try to fetch location assignments separately to avoid RLS issues
        let locations: StaffLocationItem[] = [];
        try {
          const { data: assignments } = await supabase
            .from("provider_staff_locations")
            .select("location_id, is_primary")
            .eq("staff_id", member.id);
          const assignmentRows = (assignments ?? []) as AssignmentRow[];
          if (assignmentRows.length > 0) {
            const locationIds = assignmentRows.map(a => a.location_id);
            const { data: locationDetails } = await supabase
              .from("provider_locations")
              .select("id, name, city")
              .in("id", locationIds);
            const locRows = (locationDetails ?? []) as LocationRow[];
            const locationMap = new Map(locRows.map((loc) => [loc.id, loc]));
            locations = assignmentRows.map((sl) => {
              const location = locationMap.get(sl.location_id);
              return {
                location_id: sl.location_id,
                location_name: location?.name ?? null,
                location_city: location?.city ?? null,
                is_primary: sl.is_primary ?? false,
              };
            });
          }
        } catch (locError: unknown) {
          console.warn("Error fetching staff locations:", locError);
          // Continue without location data
        }

        return {
          ...member,
          users: userData,
          staff_locations: locations,
          service_ids: serviceIdsByStaff.get(member.id) ?? [],
        };
      })
    );

    // Transform to match expected format
    // Use provider_staff data first (since we store it there), then fall back to users table
    // Map database role format to API format
    const transformedStaff = (staffWithDetails || []).map(
      (member: StaffMemberRow & { staff_locations?: StaffLocationItem[]; service_ids?: string[] }) => {
      // Map database role (owner/manager/employee) to API format (provider_owner/provider_manager/provider_staff)
      const apiRole = member.role === "owner" ? "provider_owner"
                   : member.role === "manager" ? "provider_manager"
                   : "provider_staff";
      const staffLocs = member.staff_locations ?? [];
      const locations = staffLocs.map((sl) => ({
        location_id: sl.location_id,
        location_name: sl.location_name ?? sl.location?.name ?? null,
        location_city: sl.location_city ?? sl.location?.city ?? null,
        is_primary: sl.is_primary ?? false,
      }));
      const row = {
        id: member.id,
        name: member.name || member.users?.full_name || "Staff Member",
        email: member.email || member.users?.email || "",
        phone: (member.phone || member.users?.phone) ?? null,
        avatar_url: (member.avatar_url || member.users?.avatar_url) ?? null,
        role: apiRole,
        is_active: member.is_active ?? true,
        mobileReady: member.mobile_ready ?? false,
        commission_rate: member.commission_rate ?? null,
        locations,
        primary_location_id: locations.find((l) => l.is_primary)?.location_id ?? null,
        service_ids: member.service_ids ?? [],
        working_hours: member.working_hours ?? null,
        over_cap_grace_until: member.over_cap_grace_until ?? null,
      };
      const redacted = redactStaffRowForViewer(
        { ...row, user_id: member.user_id ?? null },
        user.id,
        rosterDetailLevel,
      );
      const { user_id: _uid, ...safe } = redacted;
      return safe;
      },
    );

    return successResponse(transformedStaff as StaffMember[]);
  } catch (error: unknown) {
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
  /** Assign staff to these locations. Omitted = all active locations so they appear on branch calendars. */
  location_ids: z.array(z.string().uuid()).optional(),
  /** Assign staff to these services (optional). */
  service_ids: z.array(z.string().uuid()).optional().default([]),
  /** Commission rate 0–100 (optional). */
  commission_rate: z.number().min(0).max(100).optional().nullable(),
  /** Send invite (push/email) after create. Client may also call POST /api/provider/staff/[id]/invite. */
  invite_email: z.boolean().optional().default(false),
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
    const staffAccess = await checkStaffManagementFeatureAccess(providerId, supabase);
    if (!staffAccess.enabled) {
      return errorResponse(
        "Staff management requires a subscription upgrade. Please upgrade your plan to add staff members.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Check staff limit using new limit checker
    const staffLimitCheck = await checkStaffLimit(providerId, supabase);
    if (!staffLimitCheck.canProceed) {
      return errorResponse(
        formatLimitError(staffLimitCheck, "Plan"),
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

    const {
      role,
      name,
      phone,
      mobileReady,
      location_ids,
      service_ids,
      commission_rate,
      invite_email,
    } = validationResult.data;
    const email = validationResult.data.email.trim().toLowerCase();

    // Map API role format to database role format
    // API uses: provider_staff, provider_manager, provider_owner
    // Database expects: employee, manager, owner
    const dbRole = role === "provider_owner" ? "owner" 
                 : role === "provider_manager" ? "manager" 
                 : "employee";

    // Find user by email (case-insensitive, admin bypasses RLS) or create if doesn't exist
    const supabaseAdmin = getSupabaseAdmin();
    let foundUser = await findPublicUserByEmailAdmin(supabaseAdmin, email);

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
          if (isAuthUserAlreadyRegistered(authError)) {
            for (let i = 0; i < 5; i++) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              foundUser = await findPublicUserByEmailAdmin(supabaseAdmin, email);
              if (foundUser) break;
            }
          }
          if (!foundUser) {
            console.error("Failed to create auth user:", authError);
            return errorResponse(
              `Failed to create user account: ${authError?.message || "Unknown error"}. The user may need to sign up first.`,
              "USER_CREATION_ERROR",
              500,
              authError
            );
          }
        } else {
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
          } catch (manualError: unknown) {
            console.error("Failed to fetch or create user profile:", manualError);
            return errorResponse(
              "User account created but profile not found. Please try again or contact support.",
              "USER_FETCH_ERROR",
              500,
              manualError instanceof Error ? manualError : fetchError
            );
          }
        }

        console.log("User profile found:", createdUser.id);
        foundUser = createdUser;
        }
      } catch (error: unknown) {
        console.error("Error creating user:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return errorResponse(
          `Failed to create user: ${message}. Please ensure the user exists or contact support.`,
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
    const staffPhone = phone || foundUser.phone || null;
    const staffName = name || foundUser.full_name || foundUser.email?.split("@")[0] || "Staff Member";
    const defaultPermissions = getDefaultStaffPermissionsForDbRole(dbRole);
    const { data: newStaff, error: insertError } = await supabase
      .from("provider_staff")
      .insert({
        provider_id: providerId,
        user_id: foundUser.id,
        name: staffName,
        email: email,
        phone: staffPhone,
        role: dbRole,
        permissions: defaultPermissions,
        is_active: true,
        mobile_ready: mobileReady || false,
        commission_rate: commission_rate != null ? Number(commission_rate) : null,
        commission_enabled: commission_rate != null && Number(commission_rate) >= 0,
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
    const staffId = newStaff.id;

    let effectiveLocationIds = location_ids ?? [];
    if (effectiveLocationIds.length === 0) {
      const { data: allLocs } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("provider_id", providerId)
        .eq("is_active", true);
      effectiveLocationIds = (allLocs ?? []).map((l: { id: string }) => l.id);
    }

    if (effectiveLocationIds.length > 0) {
      const { data: locs } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("provider_id", providerId)
        .in("id", effectiveLocationIds);
      if (locs && locs.length > 0) {
        const assignments = effectiveLocationIds
          .filter((id) => locs.some((l: { id: string }) => l.id === id))
          .map((locId, i) => ({
            staff_id: staffId,
            location_id: locId,
            is_primary: i === 0,
          }));
        if (assignments.length > 0) {
          await supabase.from("provider_staff_locations").insert(assignments);
        }
      }
    }

    // Assign services if provided
    if (service_ids && service_ids.length > 0) {
      await supabase.from("staff_services").delete().eq("staff_id", staffId);
      await supabase.from("staff_services").insert(
        service_ids.map((sid: string) => ({
          staff_id: staffId,
          offering_id: sid,
          provider_id: providerId,
        }))
      );
    }

    // Optionally send invite (email via Resend + push when registered)
    const inviteRecipientEmail = (foundUser.email || email || "").trim().toLowerCase();
    if (invite_email && inviteRecipientEmail) {
      try {
        const { data: providerRow } = await supabase
          .from("providers")
          .select("business_name, tenant_id")
          .eq("id", providerId)
          .single();
        const { data: inviterProfile } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle();
        const inviter = inviterProfile as {
          full_name?: string | null;
          email?: string | null;
        } | null;
        const delivery = await sendStaffInvite({
          supabase,
          staffId,
          providerId,
          tenantId: (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
          inviterUserId: user.id,
          inviterName: inviter?.full_name ?? inviter?.email ?? null,
          recipientUserId: newStaff.user_id ?? null,
          recipientEmail: inviteRecipientEmail,
        });
        const inviteExpiresAt = new Date();
        inviteExpiresAt.setDate(inviteExpiresAt.getDate() + STAFF_INVITE_EXPIRY_DAYS);
        const inviteChannels: Array<"email" | "push" | "sms"> = [];
        if (delivery.email.delivered) inviteChannels.push("email");
        if (delivery.push.delivered) inviteChannels.push("push");
        await recordStaffInvitationSent(getSupabaseAdmin(), {
          providerId,
          staffId,
          email: inviteRecipientEmail,
          phone: staffPhone ?? null,
          token: delivery.invite_token,
          invitedBy: user.id,
          expiresAt: inviteExpiresAt,
          channels: inviteChannels,
        });
        void trackServer(EVENT_STAFF_INVITED, {
          user_id: user.id,
          staff_id: staffId,
          provider_id: providerId,
          email_delivered: delivery.email.delivered,
          push_delivered: delivery.push.delivered,
        }).catch((err) => console.warn("[staff-invite] analytics failed:", err));
      } catch (inviteErr) {
        console.warn("Staff invite notification failed:", inviteErr);
      }
    }

    // Transform response
    // Map database role format back to API format
    // Database uses: owner, manager, employee
    // API expects: provider_owner, provider_manager, provider_staff
    const apiRole = newStaff.role === "owner" ? "provider_owner"
                  : newStaff.role === "manager" ? "provider_manager"
                  : "provider_staff";
    
    const userObj = Array.isArray(newStaff.users) ? newStaff.users[0] : newStaff.users;
    const transformedStaff = {
      id: newStaff.id,
      name: (newStaff as { name?: string }).name || userObj?.full_name || "Staff Member",
      email: (newStaff as { email?: string }).email || userObj?.email || "",
      phone: (newStaff as { phone?: string }).phone || userObj?.phone || staffPhone,
      role: apiRole,
      is_active: newStaff.is_active ?? true,
      mobileReady: (newStaff as { mobile_ready?: boolean }).mobile_ready ?? false,
      commission_rate: commission_rate != null ? Number(commission_rate) : null,
      locations: effectiveLocationIds.map((locId, i) => ({
        location_id: locId,
        location_name: null,
        location_city: null,
        is_primary: i === 0,
      })),
      service_ids,
    };

    void import("@/lib/subscriptions/subscription-limit-notifications")
      .then((m) => m.maybeNotifyProviderSubscriptionLimits(providerId))
      .catch((e) => console.warn("Subscription usage notification:", e));

    return successResponse(transformedStaff as StaffMember);
  } catch (error: unknown) {
    return handleApiError(error, "Failed to add staff member");
  }
}
