import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getOffsetPaginationParams,
  handleApiError,
  requireSuperadmin,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { createPaystackVirtualTerminal } from "@/lib/payments/paystack-virtual-terminal";
import {
  buildPaystackTerminalPaymentUrl,
  buildTerminalBusinessSnapshot,
  computePaystackTerminalAssetStatus,
} from "@/lib/payments/paystack-terminal-assets";

const createFromRequestSchema = z.object({
  action: z.literal("create_from_request"),
  request_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 100 });
    const status = searchParams.get("status") ?? "requested";

    let query = (supabase.from("provider_paystack_virtual_terminal_setup_requests") as any)
      .select(
        `
          *,
          provider:providers(id, business_name, tenant_id, phone, billing_phone, billing_email, user_id),
          location:provider_locations(id, name, city),
          requested_by_user:users!provider_paystack_virtual_terminal_setup_requests_requested_by_fkey(id, email, full_name)
        `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;

    return successResponse({
      items: data ?? [],
      total: count ?? 0,
      limit,
      offset,
      hasMore: (count ?? 0) > offset + limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Paystack Terminal setup requests");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireSuperadmin(request);
    const supabase = getSupabaseAdmin();
    const body = createFromRequestSchema.parse(await request.json());

    const { data: setupRequest, error: requestError } = await (supabase
      .from("provider_paystack_virtual_terminal_setup_requests") as any)
      .select(
        `
          *,
          provider:providers(id, business_name, tenant_id, phone, billing_phone, billing_email, user_id),
          location:provider_locations(id, name, city)
        `,
      )
      .eq("id", body.request_id)
      .in("status", ["requested", "in_progress"])
      .maybeSingle();
    if (requestError) throw requestError;
    if (!setupRequest) return errorResponse("Setup request not found or already fulfilled.", "NOT_FOUND", 404);

    const destinations = Array.isArray(setupRequest.destinations) ? setupRequest.destinations : [];
    if (destinations.length === 0) {
      return errorResponse(
        "A WhatsApp destination is required before creating a Paystack Virtual Terminal.",
        "DESTINATION_REQUIRED",
        400,
      );
    }

    const tenantId = setupRequest.provider?.tenant_id ?? null;
    const remote = await createPaystackVirtualTerminal(
      {
        name: setupRequest.suggested_paystack_name,
        destinations,
        currency: setupRequest.currency ?? "ZAR",
        custom_fields: Array.isArray(setupRequest.custom_fields) ? setupRequest.custom_fields : [],
        metadata: setupRequest.metadata ?? {},
      },
      { tenantId },
    );

    const terminal = remote.data;
    const terminalUrl = buildPaystackTerminalPaymentUrl(terminal.code);
    const assetStatus = computePaystackTerminalAssetStatus({
      payment_link: terminalUrl,
      terminal_url: terminalUrl,
      qr_url: null,
      poster_url: null,
    });
    const destination = terminal.destinations?.[0]?.target ?? setupRequest.destination_target ?? null;
    const now = new Date().toISOString();
    const businessSnapshot = buildTerminalBusinessSnapshot({
      provider: setupRequest.provider ?? null,
      owner: null,
      location: setupRequest.location ?? null,
      notificationWhatsapp: destination,
      terminalName: terminal.name ?? setupRequest.suggested_paystack_name,
    });

    const { data: localTerminal, error: terminalError } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .insert({
        provider_id: setupRequest.provider_id,
        location_id: setupRequest.location_id ?? null,
        paystack_terminal_id: terminal.id,
        terminal_code: terminal.code,
        name: terminal.name ?? setupRequest.suggested_paystack_name,
        display_name: setupRequest.requested_display_name,
        status: terminal.active === false ? "inactive" : "active",
        active: terminal.active !== false,
        currency: terminal.currency ?? setupRequest.currency ?? "ZAR",
        destinations: terminal.destinations ?? destinations,
        custom_fields: setupRequest.custom_fields ?? [],
        metadata: terminal.metadata ?? setupRequest.metadata ?? {},
        paystack_domain: terminal.domain ?? null,
        terminal_url: terminalUrl,
        payment_link: terminalUrl,
        business_snapshot: businessSnapshot,
        notification_whatsapp: destination,
        notification_whatsapp_label: destination ? setupRequest.destination_name ?? "Paystack WhatsApp destination" : null,
        destination_status: destination ? "configured" : "not_configured",
        identity_status: "verified",
        asset_status: assetStatus,
        asset_last_requested_at: now,
        asset_last_requested_by: user.id,
        asset_request_status: "requested",
        asset_requested_by_provider_at: setupRequest.created_at,
        synced_from_paystack_at: now,
        last_synced_at: now,
      })
      .select()
      .single();
    if (terminalError) throw terminalError;

    const { data: updatedRequest, error: updateError } = await (supabase
      .from("provider_paystack_virtual_terminal_setup_requests") as any)
      .update({
        status: "created",
        fulfilled_terminal_id: localTerminal.id,
        fulfilled_by: user.id,
        fulfilled_at: now,
      })
      .eq("id", setupRequest.id)
      .select()
      .single();
    if (updateError) throw updateError;

    return successResponse({ terminal: localTerminal, setup_request: updatedRequest }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create Paystack Terminal from setup request");
  }
}
