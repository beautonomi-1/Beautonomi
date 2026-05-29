import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { z } from "zod";
import { writeAuditLog, extractRequestMeta, computeChangedFields } from "@/lib/audit/audit";
import { syncUserAuthMetadataToPublicProfile } from "@/lib/auth/sync-user-auth-metadata";

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

    const userData = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, id);
    if (!userData) {
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
      const bookingOr = `customer_id.eq.${id},user_id.eq.${id}`;

      const { count: bookingCount } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .or(bookingOr);

      const { data: bookings } = await supabase
        .from("bookings")
        .select("total_amount")
        .eq("tenant_id", tenantId)
        .or(bookingOr)
        .in("status", ["completed", "confirmed"]);

      const totalSpent = bookings?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;

      const { data: lastBooking } = await supabase
        .from("bookings")
        .select("scheduled_at")
        .eq("tenant_id", tenantId)
        .or(bookingOr)
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

    let last_sign_in_at: string | null = null;
    let email_verified = Boolean((userData as { email_verified?: boolean }).email_verified);
    let phone_verified = Boolean((userData as { phone_verified?: boolean }).phone_verified);
    try {
      const { data: authRow } = await admin.auth.admin.getUserById(id);
      const authUser = authRow?.user;
      if (authUser) {
        last_sign_in_at = authUser.last_sign_in_at ?? null;
        email_verified = email_verified || Boolean(authUser.email_confirmed_at);
        phone_verified = phone_verified || Boolean(authUser.phone_confirmed_at);
        await syncUserAuthMetadataToPublicProfile(admin, id, authUser);
      }
    } catch (authErr) {
      console.warn("[admin/users/:id] auth metadata lookup failed:", authErr);
    }

    const last_login_at =
      typeof (userData as { last_login_at?: string | null }).last_login_at === "string"
        ? (userData as { last_login_at?: string | null }).last_login_at
        : null;
    const last_active_at =
      [last_sign_in_at, last_login_at]
        .filter(Boolean)
        .sort((a, b) => Date.parse(String(b)) - Date.parse(String(a)))[0] ?? null;

    return successResponse({
      ...sanitizeUserForAdmin(userData as Record<string, unknown>),
      last_sign_in_at,
      last_active_at,
      verification: {
        email_verified,
        phone_verified,
        identity_verified: Boolean((userData as { identity_verified?: boolean }).identity_verified),
        identity_verification_status:
          typeof (userData as { identity_verification_status?: string }).identity_verification_status ===
          "string"
            ? (userData as { identity_verification_status?: string }).identity_verification_status
            : null,
      },
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
  full_name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  deactivated_at: z.string().nullable().optional(),
  deactivation_reason: z.string().nullable().optional(),
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

    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const existingRow = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, id);
    if (!existingRow) {
      return notFoundResponse("User not found");
    }

    const existingUser = existingRow as { id?: string; role?: string };

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

    if (validationResult.data.full_name !== undefined) {
      updateData.full_name = validationResult.data.full_name;
    }
    if (validationResult.data.phone !== undefined) {
      updateData.phone = validationResult.data.phone;
    }
    if (validationResult.data.avatar_url !== undefined) {
      updateData.avatar_url = validationResult.data.avatar_url;
    }

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

    if (validationResult.data.email_notifications_enabled !== undefined) {
      updateData.email_notifications_enabled = validationResult.data.email_notifications_enabled;
    }
    
    if (validationResult.data.sms_notifications_enabled !== undefined) {
      updateData.sms_notifications_enabled = validationResult.data.sms_notifications_enabled;
    }
    
    if (validationResult.data.push_notifications_enabled !== undefined) {
      updateData.push_notifications_enabled = validationResult.data.push_notifications_enabled;
    }

    // Update via admin client (RLS only allows self-update + superadmin; tenant admins need bypass).
    const { data: updatedUser, error: updateError } = await admin
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
      await admin.auth.admin.updateUserById(id, {
        ban_duration: "876000h", // ~100 years (effectively permanent)
      });
    } else if (updateData.deactivated_at === null) {
      // If user is being reactivated, unban auth user
      await admin.auth.admin.updateUserById(id, {
        ban_duration: "0",
      });
    }

    const isDeactivation = !!updateData.deactivated_at;
    const isReactivation = updateData.deactivated_at === null;
    const riskLevel = isDeactivation || isReactivation ? "high" as const : "medium" as const;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: isDeactivation ? "admin.user.suspend" : isReactivation ? "admin.user.reactivate" : "admin.user.update",
      entity_type: "user",
      entity_id: id,
      module: "users_trust",
      risk_level: riskLevel,
      retention_tier: riskLevel === "high" ? "access" : "operational",
      status: "succeeded",
      reason: validationResult.data.deactivation_reason ?? undefined,
      after_json: updateData,
      changed_fields: Object.keys(updateData),
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      superadmin_bypass_used: user.role === "superadmin",
    });

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
