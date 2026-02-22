import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/provider-online-booking-settings?provider_id=xxx
 * Get online booking settings by provider ID (for /book/continue when we only have hold with provider_id)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");

    if (!providerId) {
      return Response.json(
        { data: null, error: { message: "provider_id required", code: "VALIDATION_ERROR" } },
        { status: 400 }
      );
    }

    const { data: provider, error: provErr } = await supabase
      .from("providers")
      .select("id, online_booking_enabled")
      .eq("id", providerId)
      .eq("status", "active")
      .single();

    if (provErr || !provider) {
      return Response.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    if (!provider.online_booking_enabled) {
      return Response.json(
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
        }
      : defaults;

    return Response.json({ data: merged, error: null });
  } catch (error) {
    console.error("Error fetching online booking settings:", error);
    return Response.json(
      { data: null, error: { message: "Failed to fetch settings", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
