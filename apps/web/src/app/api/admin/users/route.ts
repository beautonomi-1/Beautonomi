import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, requireRoleInApi, successResponse, handleApiError, getPaginationParams  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { z } from "zod";
import type { UserRole } from "@/types/beautonomi";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { enrichAdminUserListRows } from "@/lib/admin/enrich-admin-user-list";

/**
 * GET /api/admin/users
 * 
 * Get all users with filters and pagination
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);

    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);

    const search = searchParams.get("search");
    const role = searchParams.get("role");
    const signupSource = searchParams.get("signup_source");

    const { data: payload, error } = await admin.rpc("admin_users_list_for_tenant", {
      p_tenant_id: tenantId,
      p_limit: limit,
      p_offset: offset,
      p_search: search?.trim() || null,
      p_role: role && role !== "all" ? role : null,
      p_signup_source: signupSource && signupSource !== "all" ? signupSource : null,
    });

    if (error) {
      throw error;
    }

    const box = payload as { total?: unknown; data?: unknown } | null;
    const rawUsers = Array.isArray(box?.data) ? (box.data as Record<string, unknown>[]) : [];
    const users = await enrichAdminUserListRows(admin, tenantId, rawUsers);
    const total = typeof box?.total === "number" ? box.total : Number(box?.total ?? 0);
    const hasMore = total > page * limit;

    // Return in format expected by frontend
    return successResponse({
      data: users,
      meta: {
        page,
        limit,
        total,
        has_more: hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch users");
  }
}

/**
 * POST /api/admin/users
 * 
 * Create a new user (superadmin only)
 */
const MANAGEABLE_USER_ROLES = [
  "customer",
  "provider_owner",
  "provider_staff",
  "support_agent",
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
  "superadmin",
] as const satisfies readonly UserRole[];

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().min(1, "Full name is required"),
  phone: z.string().optional(),
  role: z.enum(MANAGEABLE_USER_ROLES).default("customer"),
  date_of_birth: z.string().optional(),
  preferred_language: z.string().optional().default("en"),
  preferred_currency: z.string().optional(),
  timezone: z.string().optional().default("Africa/Johannesburg"),
});

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const body = await request.json();
    const validationResult = createUserSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const {
      email,
      password,
      full_name,
      phone,
      role,
      date_of_birth,
      preferred_language,
      preferred_currency: preferredCurrencyInput,
      timezone,
    } = validationResult.data;
    const tenantIdForCurrency = await resolveAdminApiTenantId(request);
    const lastResortCurrency =
      (await getTenantRegionConfig(tenantIdForCurrency))?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const preferred_currency = preferredCurrencyInput ?? lastResortCurrency;

    // Use admin client to create auth user
    const supabaseAdmin = getSupabaseAdmin();

    // Create auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
        phone,
        role,
      },
    });

    if (authError || !authUser.user) {
      console.error("Error creating auth user:", authError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create user account",
            code: "AUTH_ERROR",
            details: authError?.message || "Unknown error",
          },
        },
        { status: 500 }
      );
    }

    // Create user record in users table
    const supabase = await getSupabaseServer(request);
    const { data: userRecord, error: userError } = await supabase
      .from("users")
      .insert({
        id: authUser.user.id,
        email,
        full_name,
        phone: phone || null,
        role,
        date_of_birth: date_of_birth || null,
        preferred_language,
        preferred_currency,
        timezone,
      })
      .select()
      .single();

    if (userError) {
      // If user record creation fails, try to clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      console.error("Error creating user record:", userError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create user record",
            code: "DATABASE_ERROR",
            details: userError.message,
          },
        },
        { status: 500 }
      );
    }

    // Create wallet for the user
    const { error: walletError } = await supabase
      .from("user_wallets")
      .insert({
        user_id: authUser.user.id,
        currency: preferred_currency,
        balance: 0,
      });

    if (walletError) {
      console.error("Error creating wallet:", walletError);
      // Don't fail the request if wallet creation fails, just log it
    }

    return NextResponse.json({
      data: userRecord,
      error: null,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Failed to create user");
  }
}
