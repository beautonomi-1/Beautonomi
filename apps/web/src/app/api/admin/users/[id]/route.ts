import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { z } from "zod";

function sanitizeUserForAdmin(row: Record<string, unknown>) {
  const { two_factor_secret: _tfs, ...rest } = row;
  return rest;
}

/**
 * GET /api/admin/users/[id]
 * 
 * Get detailed user information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: userData, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !userData) {
      return notFoundResponse("User not found");
    }

    type UserRow = { role?: string };
    const stats: Record<string, unknown> = {};
    const userRow = userData as UserRow;
    let recent_product_orders: unknown[] = [];

    const { data: addresses } = await admin
      .from("user_addresses")
      .select("*")
      .eq("user_id", id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    const { data: payment_methods } = await admin
      .from("payment_methods")
      .select(
        "id, type, provider, last_four, expiry_month, expiry_year, card_brand, is_default, is_active, created_at",
      )
      .eq("user_id", id)
      .order("is_default", { ascending: false });

    const { data: wallet } = await admin
      .from("user_wallets")
      .select("balance, currency, updated_at")
      .eq("user_id", id)
      .maybeSingle();

    if (userRow.role === "customer") {
      const { count: bookingCount } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", id)
        .eq("tenant_id", tenantId);

      // Get total spent
      const { data: bookings } = await supabase
        .from("bookings")
        .select("total_amount")
        .eq("customer_id", id)
        .eq("tenant_id", tenantId)
        .in("status", ["completed", "confirmed"]);

      const totalSpent = bookings?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;

      // Get last booking date
      const { data: lastBooking } = await supabase
        .from("bookings")
        .select("scheduled_at")
        .eq("customer_id", id)
        .eq("tenant_id", tenantId)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      stats.total_bookings = bookingCount || 0;
      stats.total_spent = totalSpent;
      stats.last_booking_date = lastBooking?.scheduled_at || null;

      const { count: productOrderCount } = await admin
        .from("product_orders")
        .select("id, provider:providers!inner(tenant_id)", { count: "exact", head: true })
        .eq("customer_id", id)
        .eq("provider.tenant_id", tenantId);

      const { data: productOrdersForSpend } = await admin
        .from("product_orders")
        .select("total_amount, payment_status, provider:providers!inner(tenant_id)")
        .eq("customer_id", id)
        .eq("provider.tenant_id", tenantId);

      const poRows = (productOrdersForSpend ?? []) as {
        total_amount?: number;
        payment_status?: string;
      }[];
      const product_orders_paid_total = poRows
        .filter((o) => o.payment_status === "paid")
        .reduce((s, o) => s + Number(o.total_amount ?? 0), 0);

      stats.product_orders_count = productOrderCount ?? 0;
      stats.product_orders_paid_total = product_orders_paid_total;

      const { data: recentPo } = await admin
        .from("product_orders")
        .select(
          "id, order_number, status, payment_status, total_amount, currency, fulfillment_type, created_at, provider:providers!inner(id, business_name, tenant_id)",
        )
        .eq("customer_id", id)
        .eq("provider.tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(25);
      recent_product_orders = recentPo ?? [];
    } else if (userRow.role === "provider_owner") {
      const { count: providerCount } = await supabase
        .from("providers")
        .select("*", { count: "exact", head: true })
        .eq("user_id", id)
        .eq("tenant_id", tenantId);

      stats.provider_count = providerCount || 0;
    }

    const { data: supportTicketsRaw } = await admin
      .from("support_tickets")
      .select(
        "id, ticket_number, subject, status, priority, provider_id, created_at, provider:providers(tenant_id)",
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(40);

    const support_tickets = (supportTicketsRaw ?? []).filter((t: Record<string, unknown>) => {
      if (!t.provider_id) return true;
      const prov = t.provider;
      const p = (Array.isArray(prov) ? prov[0] : prov) as { tenant_id?: string } | undefined;
      return p?.tenant_id === tenantId;
    });

    return successResponse({
      ...sanitizeUserForAdmin(userData as Record<string, unknown>),
      stats,
      addresses: addresses ?? [],
      payment_methods: payment_methods ?? [],
      wallet: wallet ?? null,
      support_tickets,
      recent_product_orders,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch user");
  }
}

/**
 * PATCH /api/admin/users/[id]
 * 
 * Update user (suspend/reactivate)
 */
const updateUserSchema = z.object({
  deactivated_at: z.string().nullable().optional(),
  deactivation_reason: z.string().nullable().optional(),
  role: z.enum(["customer", "provider", "admin", "superadmin"]).optional(),
  email_notifications_enabled: z.boolean().optional(),
  sms_notifications_enabled: z.boolean().optional(),
  push_notifications_enabled: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);

    const { id } = await params;
    const body = await request.json();
    const validationResult = updateUserSchema.safeParse(body);

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

    const supabase = await getSupabaseServer(request);

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", id)
      .single();

    if (fetchError || !existingUser) {
      return notFoundResponse("User not found");
    }

    // Prevent superadmins from modifying other superadmins (except themselves)
    if (existingUser.role === "superadmin" && id !== user.id) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot modify another superadmin account",
            code: "PERMISSION_DENIED",
          },
        },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};
    
    if (validationResult.data.deactivated_at !== undefined) {
      const at = validationResult.data.deactivated_at
        ? new Date(validationResult.data.deactivated_at).toISOString()
        : null;
      updateData.deactivated_at = at;
      updateData.deactivated_by = at ? 'admin' : null;
      updateData.is_active = at ? false : true;
    }

    if (validationResult.data.deactivation_reason !== undefined) {
      updateData.deactivation_reason = validationResult.data.deactivation_reason;
    }
    
    if (validationResult.data.role !== undefined) {
      updateData.role = validationResult.data.role;
    }
    
    if (validationResult.data.email_notifications_enabled !== undefined) {
      updateData.email_notifications_enabled = validationResult.data.email_notifications_enabled;
    }
    
    if (validationResult.data.sms_notifications_enabled !== undefined) {
      updateData.sms_notifications_enabled = validationResult.data.sms_notifications_enabled;
    }
    
    if (validationResult.data.push_notifications_enabled !== undefined) {
      updateData.push_notifications_enabled = validationResult.data.push_notifications_enabled;
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating user:", updateError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update user",
            code: "UPDATE_ERROR",
            details: updateError.message,
          },
        },
        { status: 500 }
      );
    }

    // If user is being deactivated, also deactivate auth user
    if (updateData.deactivated_at) {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: "876000h", // ~100 years (effectively permanent)
      });
    } else if (updateData.deactivated_at === null) {
      // If user is being reactivated, unban auth user
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: "0",
      });
    }

    return successResponse(sanitizeUserForAdmin(updatedUser as Record<string, unknown>));
  } catch (error) {
    return handleApiError(error, "Failed to update user");
  }
}

/**
 * DELETE /api/admin/users/[id] — disabled (use POST /api/admin/compliance/purge-user with required confirmations).
 */
export async function DELETE() {
  return NextResponse.json(
    {
      data: null,
      error: {
        message:
          "Direct DELETE is disabled. Use POST /api/admin/compliance/purge-user with reason (≥20 chars), matching account email, phrase DELETE USER FOREVER, and acknowledge_irreversible: true.",
        code: "USE_COMPLIANCE_PURGE_ENDPOINT",
      },
    },
    { status: 405, headers: { Allow: "GET, PATCH" } },
  );
}
