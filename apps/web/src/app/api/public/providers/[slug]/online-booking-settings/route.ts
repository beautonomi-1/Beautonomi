import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/providers/[slug]/online-booking-settings
 * Get online booking settings for /book flow (public)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    let { slug } = await params;
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // keep slug as-is if decode fails
    }

    const { data: provider, error: provErr } = await supabase
      .from("providers")
      .select("id, online_booking_enabled, waitlist_online_enabled")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (provErr || !provider) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    if (!provider.online_booking_enabled) {
      return NextResponse.json(
        { data: null, error: { message: "Online booking is disabled", code: "DISABLED" } },
        { status: 403 }
      );
    }

    const { data: settings } = await supabase
      .from("provider_online_booking_settings")
      .select("*")
      .eq("provider_id", provider.id)
      .maybeSingle();

    const defaults = {
      staff_selection_mode: "client_chooses" as const,
      require_auth_step: "checkout" as const,
      min_notice_minutes: 60,
      max_advance_days: 90,
      allow_pay_in_person: false,
      deposit_required: false,
      deposit_amount: null as number | null,
      deposit_percent: null as number | null,
      allow_online_waitlist: !!(provider as { waitlist_online_enabled?: boolean }).waitlist_online_enabled,
      tip_suggestions: [0, 50, 100, 150, 200] as number[],
    };

    const merged = settings
      ? {
          ...defaults,
          staff_selection_mode: settings.staff_selection_mode || defaults.staff_selection_mode,
          require_auth_step: settings.require_auth_step || defaults.require_auth_step,
          min_notice_minutes: settings.min_notice_minutes ?? defaults.min_notice_minutes,
          max_advance_days: settings.max_advance_days ?? defaults.max_advance_days,
          allow_pay_in_person: settings.allow_pay_in_person ?? defaults.allow_pay_in_person,
          deposit_required: settings.deposit_required ?? defaults.deposit_required,
          deposit_amount: settings.deposit_amount ?? defaults.deposit_amount,
          deposit_percent: settings.deposit_percent ?? defaults.deposit_percent,
          allow_online_waitlist: (provider as { waitlist_online_enabled?: boolean }).waitlist_online_enabled ?? defaults.allow_online_waitlist,
          tip_suggestions: Array.isArray((settings as { tip_suggestions?: number[] }).tip_suggestions)
            ? (settings as { tip_suggestions: number[] }).tip_suggestions
            : defaults.tip_suggestions,
        }
      : defaults;

    return NextResponse.json({ data: merged, error: null });
  } catch (error) {
    console.error("Error fetching online booking settings:", error);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch settings", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
