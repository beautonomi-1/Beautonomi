import { NextResponse } from "next/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { requireYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";
import { computePaycloudReadiness } from "@/lib/payments/paycloud-readiness";
import { type CardMachine } from "@beautonomi/utils";

/**
 * GET /api/provider/card-machines
 * Unified list of Yoco devices + PayCloud terminals with readiness hints.
 */
export async function GET(request: Request) {
  const auth = await requireRole(["provider_owner", "provider_staff"], request);
  if (!auth) return unauthorizedResponse("Authentication required");

  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(auth.user.id, supabase, { request });
  if (!providerId) {
    return NextResponse.json(
      { data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } },
      { status: 404 },
    );
  }

  const machines: CardMachine[] = [];

  const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
  if (!yocoGate) {
    const { data: devices } = await supabase
      .from("provider_yoco_devices")
      .select("id, name, location_id, is_active, credential_mode")
      .eq("provider_id", providerId);
    for (const d of devices ?? []) {
      const row = d as {
        id: string;
        name: string;
        location_id: string | null;
        is_active: boolean;
        credential_mode?: string | null;
      };
      const virtual = row.credential_mode === "virtual_checkout";
      machines.push({
        id: row.id,
        provider: "yoco",
        name: row.name,
        locationId: row.location_id,
        isActive: row.is_active !== false,
        kind: virtual ? "virtual_checkout" : "web_pos",
        capabilities: {
          apiRefund: false,
          tip: false,
          cashback: false,
          qr: virtual,
          sameDevice: false,
        },
      });
    }
  }

  const paycloudGate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
  if (!paycloudGate) {
    const { data: terminals } = await supabase
      .from("paycloud_terminals")
      .select("id, display_name, location_id, is_active, status, in_flight_payment_id")
      .eq("provider_id", providerId);
    for (const t of terminals ?? []) {
      const row = t as {
        id: string;
        display_name: string;
        location_id: string | null;
        is_active: boolean;
        status?: string;
        in_flight_payment_id?: string | null;
      };
      if (row.status === "decommissioned") continue;
      machines.push({
        id: row.id,
        provider: "paycloud",
        name: row.display_name,
        locationId: row.location_id,
        isActive: row.is_active && row.status !== "suspended",
        kind: "paycloud_terminal",
        capabilities: {
          apiRefund: true,
          tip: true,
          cashback: true,
          qr: true,
          sameDevice: false,
        },
        inFlightPaymentId: row.in_flight_payment_id,
      });
    }
  }

  let paycloudReadiness: Awaited<ReturnType<typeof computePaycloudReadiness>> | null = null;
  if (!paycloudGate) {
    paycloudReadiness = await computePaycloudReadiness(supabase, providerId);
  }

  const { data: defaults } = await supabase
    .from("provider_card_machine_defaults")
    .select("id, location_id, staff_user_id, machine_provider, machine_id")
    .eq("provider_id", providerId);

  return NextResponse.json({
    data: {
      machines,
      defaults: defaults ?? [],
      paycloudReadiness,
      yocoEnabled: !yocoGate,
      paycloudEnabled: !paycloudGate,
    },
    error: null,
  });
}
