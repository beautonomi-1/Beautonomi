import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { buildBrandCalendar } from "@/lib/brand-marketing/calendar";

function icsDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const now = new Date();
    const window = {
      from: new Date(now.getFullYear(), 0, 1),
      to: new Date(now.getFullYear(), 11, 31),
    };
    const supabase = getSupabaseAdmin();
    const { campaigns } = await buildBrandCalendar(supabase, access.tenantId, window);

    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Beautonomi//Brand Desk//EN"];
    for (const c of campaigns) {
      if (!c.flight_start || !c.flight_end) continue;
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:brand-campaign-${c.id}@beautonomi`);
      lines.push(`SUMMARY:${c.name.replace(/[,;\\]/g, " ")}`);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(c.flight_start)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(c.flight_end)}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");

    return new Response(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="brand-calendar.ics"',
      },
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to export calendar");
  }
}
