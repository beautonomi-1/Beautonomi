import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, getPaginationParams } from "@/lib/supabase/api-helpers";
import { z } from "zod";

/**
 * GET /api/admin/users
 * 
 * Get all users with filters and pagination
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);

    const search = searchParams.get("search");
    const role = searchParams.get("role");

    let query = supabase.from("users").select("*", { count: "exact" });

    // Apply filters
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    if (role && role !== "all") {
      query = query.eq("role", role);
    }

    // Apply pagination
    const { data: users, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const total = count || 0;
    const hasMore = total > page * limit;

    // Return in format expected by frontend
    return successResponse({
      data: users || [],
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
const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  full_name: z.string().min(1, "Full name is required"),
  phone: z.string().optional(),
  role: z.enum(["customer", "provider", "admin", "superadmin"]).default("customer"),
  date_of_birth: z.string().optional(),
  preferred_language: z.string().optional().default("en"),
  preferred_currency: z.string().optional().default("ZAR"),
  timezone: z.string().optional().default("Africa/Johannesburg"),
});

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);

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

    const { email, password, full_name, phone, role, date_of_birth, preferred_language, preferred_currency, timezone } = validationResult.data;

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
    const supabase = await getSupabaseServer();
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
