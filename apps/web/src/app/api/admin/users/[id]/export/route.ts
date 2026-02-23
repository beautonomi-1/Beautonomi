import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Supabase client not available",
            code: "SERVER_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const { id } = await params;

    // Fetch user data
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (userError || !user) {
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

    // Fetch user bookings
    const { data: bookings } = await supabase
      .from("bookings")
      .select("*")
      .eq("user_id", id);

    // Convert to CSV format
    const csvRows = [];
    csvRows.push("User Data");
    csvRows.push("Field,Value");
    csvRows.push(`ID,${user.id}`);
    csvRows.push(`Email,${user.email || ""}`);
    csvRows.push(`Full Name,${user.full_name || ""}`);
    csvRows.push(`Phone,${user.phone || ""}`);
    csvRows.push(`Role,${user.role || ""}`);
    csvRows.push(`Created At,${user.created_at || ""}`);
    csvRows.push(`Updated At,${user.updated_at || ""}`);
    csvRows.push("");

    if (bookings && bookings.length > 0) {
      csvRows.push("Bookings");
      csvRows.push("ID,Status,Scheduled At,Total Amount,Created At");
      bookings.forEach((booking) => {
        csvRows.push(
          `${booking.id},${booking.status || ""},${booking.scheduled_at || ""},${booking.total_amount || 0},${booking.created_at || ""}`
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
  } catch (error: any) {
    console.error("Error exporting user data:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to export user data",
          code: "SERVER_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
