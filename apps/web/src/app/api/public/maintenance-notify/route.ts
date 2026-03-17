import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { MAINTENANCE_SCOPES } from "@/lib/maintenance-types";
import type { MaintenanceScope } from "@/lib/maintenance-types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/public/maintenance-notify
 * Body: { email: string, scope?: MaintenanceScope }
 * Records email for "notify me when we're back" from the maintenance page.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const scope = typeof body.scope === "string" && MAINTENANCE_SCOPES.includes(body.scope as MaintenanceScope)
      ? (body.scope as MaintenanceScope)
      : "public_site";

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const supabase = await getSupabaseServer();
    const { error } = await supabase.from("maintenance_notify_emails").insert({
      email: email.toLowerCase(),
      scope,
    });

    if (error) {
      // Duplicate (email, scope): treat as success so user sees "Thanks!"
      if (error.code === "23505") {
        return NextResponse.json({ ok: true }, { status: 201 });
      }
      console.error("maintenance-notify insert error:", error);
      return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("maintenance-notify unexpected error:", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
