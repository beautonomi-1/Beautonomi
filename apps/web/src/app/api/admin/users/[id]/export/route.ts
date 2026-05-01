import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();

    const { id } = await params;

    const user = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, id);
    if (!user) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "User not found",
            code: "USER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const { data: bookings } = await admin
      .from("bookings")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(`customer_id.eq.${id},user_id.eq.${id}`);

    const csvRows: string[] = [];
    csvRows.push("User Data");
    csvRows.push("Field,Value");
    csvRows.push(`ID,${String(user.id)}`);
    csvRows.push(`Email,${String(user.email ?? "")}`);
    csvRows.push(`Full Name,${String(user.full_name ?? "")}`);
    csvRows.push(`Phone,${String(user.phone ?? "")}`);
    csvRows.push(`Role,${String(user.role ?? "")}`);
    csvRows.push(`Created At,${String(user.created_at ?? "")}`);
    csvRows.push(`Updated At,${String(user.updated_at ?? "")}`);
    csvRows.push("");

    if (bookings && bookings.length > 0) {
      csvRows.push("Bookings");
      csvRows.push("ID,Status,Scheduled At,Total Amount,Created At");
      bookings.forEach((booking: Record<string, unknown>) => {
        csvRows.push(
          `${String(booking.id)},${String(booking.status ?? "")},${String(booking.scheduled_at ?? "")},${Number(booking.total_amount ?? 0)},${String(booking.created_at ?? "")}`
        );
      });
    }

    const csvContent = csvRows.join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="user-${id}-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: unknown) {
    console.error("Error exporting user data:", error);
    const message = error instanceof Error ? error.message : "Failed to export user data";
    return NextResponse.json(
      {
        data: null,
        error: {
          message,
          code: "SERVER_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
