import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function escapeIcalText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

function formatIcalDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/**
 * GET /api/provider/calendar/links/[linkKey]/feed
 * Public read-only iCal feed (no auth). linkKey is the link slug.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkKey: string }> }
) {
  const { linkKey: slug } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new NextResponse("Calendar unavailable", { status: 503 });
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const { data: link, error: linkErr } = await admin
    .from("calendar_links")
    .select("id, provider_id, name, is_active, expires_at, settings")
    .eq("slug", slug)
    .maybeSingle();

  if (linkErr || !link || !link.is_active) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (link.expires_at && new Date(link.expires_at) < now) {
    return new NextResponse("Expired", { status: 410 });
  }

  const settings = (link.settings || {}) as { location_id?: string };
  const locationId = settings.location_id;

  const from = now.toISOString();
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  let q = admin
    .from("bookings")
    .select(
      "id, booking_number, scheduled_at, status, customers:users!bookings_customer_id_fkey(full_name)"
    )
    .eq("provider_id", link.provider_id)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    // Include `pending_payment` so the provider's subscribed calendar shows
    // bookings whose customer has just initiated payment but the lifecycle
    // status hasn't yet advanced (migration 595 will advance once the
    // payment trigger fires; the feed should not omit those rows in the
    // meantime).
    .in("status", ["pending", "pending_payment", "confirmed", "in_progress"]);

  if (locationId) {
    q = q.eq("location_id", locationId);
  }

  const { data: bookings, error: bErr } = await q.order("scheduled_at", { ascending: true });

  if (bErr) {
    return new NextResponse("Failed to load bookings", { status: 500 });
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Beautonomi//Provider Calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:" + escapeIcalText(link.name || "Bookings"),
  ];

  for (const b of bookings || []) {
    const row = b as any;
    const start = new Date(row.scheduled_at);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const title =
      (row.customers?.full_name ? `${row.customers.full_name} — ` : "") +
      (row.booking_number || "Booking");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${row.id}@beautonomi`);
    lines.push(`DTSTAMP:${formatIcalDate(now)}`);
    lines.push(`DTSTART:${formatIcalDate(start)}`);
    lines.push(`DTEND:${formatIcalDate(end)}`);
    lines.push(`SUMMARY:${escapeIcalText(title)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
