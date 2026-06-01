import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getOffsetPaginationParams,
  handleApiError,
  requireAdminSection,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { createPaystackVirtualTerminal } from "@/lib/payments/paystack-virtual-terminal";
import {
  buildPaystackTerminalPaymentUrl,
  buildTerminalBusinessSnapshot,
  computePaystackTerminalAssetStatus,
  normalizeWhatsAppTarget,
} from "@/lib/payments/paystack-terminal-assets";
import {
  providerBelongsToTenantScope,
  resolvePaystackTerminalTenantScope,
} from "@/lib/admin/paystack-terminal-tenant-scope";
import { slackNotifyPaystackTerminalAssetRequested } from "@/lib/integrations/slack/ops-triggers";
import { createProviderSupportTicket } from "@/lib/support/create-support-ticket";

const createFromRequestSchema = z.object({
  action: z.literal("create_from_request"),
  request_id: z.string().uuid(),
});

const rejectSchema = z.object({
  action: z.literal("reject"),
  request_id: z.string().uuid(),
  reason: z.string().trim().min(1, "A rejection reason is required.").max(2000),
  create_ticket: z.boolean().optional().default(true),
});

const createSupportTicketSchema = z.object({
  action: z.literal("create_support_ticket"),
  request_id: z.string().uuid(),
  message: z.string().trim().min(1).max(5000).optional(),
});

type SetupRequestRow = {
  id: string;
  provider_id: string;
  status: string;
  requested_display_name?: string | null;
  suggested_paystack_name?: string | null;
  destination_target?: string | null;
  support_ticket_id?: string | null;
  provider?: { id?: string; business_name?: string | null; tenant_id?: string | null; user_id?: string | null } | null;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantScope = await resolvePaystackTerminalTenantScope(supabase, request);
    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 50, maxLimit: 100 });
    const status = searchParams.get("status") ?? "requested";

    if (tenantScope.providerIds.length === 0) {
      return successResponse({
        items: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
      });
    }

    let query = (supabase.from("provider_paystack_virtual_terminal_setup_requests") as any)
      .select(
        `
          *,
          provider:providers(id, business_name, tenant_id, phone, billing_phone, billing_email, user_id),
          location:provider_locations(id, name, city),
          requested_by_user:users!requested_by(id, email, full_name)
        `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .in("provider_id", tenantScope.providerIds)
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
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantScope = await resolvePaystackTerminalTenantScope(supabase, request);
    const rawBody = await request.json();
    const action = typeof rawBody?.action === "string" ? rawBody.action : "create_from_request";

    if (action === "reject") {
      return await handleRejectSetupRequest(supabase, tenantScope, request, user, rawBody);
    }
    if (action === "create_support_ticket") {
      return await handleCreateSupportTicketForRequest(supabase, tenantScope, request, user, rawBody);
    }

    const body = createFromRequestSchema.parse(rawBody);

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
    if (!providerBelongsToTenantScope(setupRequest.provider_id, tenantScope)) {
      return errorResponse("Setup request not found or already fulfilled.", "NOT_FOUND", 404);
    }

    const rawDestinations = Array.isArray(setupRequest.destinations) ? setupRequest.destinations : [];
    // Paystack requires destination targets in international (E.164) format. Normalize any
    // stored local numbers and drop entries we cannot turn into a valid WhatsApp target.
    const destinations = rawDestinations
      .map((dest: { target?: string | null; name?: string | null }) => {
        const target = normalizeWhatsAppTarget(dest?.target);
        if (!target) return null;
        return { target, name: typeof dest?.name === "string" && dest.name.trim() ? dest.name.trim() : target };
      })
      .filter((dest): dest is { target: string; name: string } => dest !== null);
    if (destinations.length === 0) {
      return errorResponse(
        rawDestinations.length > 0
          ? "The WhatsApp destination on this request is not a valid international number (e.g. +27821234567)."
          : "A WhatsApp destination is required before creating a Paystack Virtual Terminal.",
        "DESTINATION_REQUIRED",
        400,
      );
    }

    const tenantId = setupRequest.provider?.tenant_id ?? null;
    let remote: Awaited<ReturnType<typeof createPaystackVirtualTerminal>>;
    try {
      remote = await createPaystackVirtualTerminal(
        {
          name: setupRequest.suggested_paystack_name,
          destinations,
          currency: setupRequest.currency ?? "ZAR",
          custom_fields: Array.isArray(setupRequest.custom_fields) ? setupRequest.custom_fields : [],
          metadata: setupRequest.metadata ?? {},
        },
        { tenantId },
      );
    } catch (paystackError) {
      const message =
        paystackError instanceof Error ? paystackError.message : "Unknown Paystack error";
      console.error("Paystack Virtual Terminal create failed:", message, paystackError);
      const isConfigError = /secret key not configured/i.test(message);
      return errorResponse(
        `Paystack rejected the Virtual Terminal request: ${message}`,
        isConfigError ? "PAYSTACK_NOT_CONFIGURED" : "PAYSTACK_API_ERROR",
        isConfigError ? 500 : 502,
      );
    }

    const terminal = remote.data;
    if (!terminal?.code) {
      return errorResponse(
        "Paystack did not return a terminal code. The Virtual Terminal was not created.",
        "PAYSTACK_API_ERROR",
        502,
      );
    }
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
    if (terminalError) {
      const pgCode = (terminalError as { code?: string }).code;
      console.error(
        "Paystack Virtual Terminal local insert failed after remote create:",
        terminal.code,
        terminalError,
      );
      if (pgCode === "23505") {
        return errorResponse(
          `A terminal with this name or code already exists for this provider (Paystack terminal ${terminal.code} was created remotely). Resolve the duplicate before retrying.`,
          "TERMINAL_ALREADY_EXISTS",
          409,
        );
      }
      return errorResponse(
        `Paystack terminal ${terminal.code} was created, but saving it locally failed: ${(terminalError as { message?: string }).message ?? "database error"}.`,
        "TERMINAL_PERSIST_FAILED",
        500,
      );
    }

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

    slackNotifyPaystackTerminalAssetRequested({
      tenantId: tenantId ?? tenantScope.tenantId,
      terminalId: localTerminal.id,
      terminalCode: terminal.code,
      providerName: setupRequest.provider?.business_name ?? null,
      terminalName: terminal.name ?? setupRequest.suggested_paystack_name,
      paymentLink: terminalUrl,
      requestedBy: user.email ?? user.id,
      autoRequested: true,
    });

    return successResponse({ terminal: localTerminal, setup_request: updatedRequest }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create Paystack Terminal from setup request");
  }
}

async function loadSetupRequestForAction(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantScope: Awaited<ReturnType<typeof resolvePaystackTerminalTenantScope>>,
  requestId: string,
  allowedStatuses: string[],
): Promise<{ row: SetupRequestRow | null; outOfScope: boolean }> {
  const { data, error } = await (supabase
    .from("provider_paystack_virtual_terminal_setup_requests") as any)
    .select(
      `
        *,
        provider:providers(id, business_name, tenant_id, user_id)
      `,
    )
    .eq("id", requestId)
    .in("status", allowedStatuses)
    .maybeSingle();
  if (error) throw error;
  const row = (data as SetupRequestRow | null) ?? null;
  if (!row) return { row: null, outOfScope: false };
  if (!providerBelongsToTenantScope(row.provider_id, tenantScope)) {
    return { row: null, outOfScope: true };
  }
  return { row, outOfScope: false };
}

async function handleRejectSetupRequest(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantScope: Awaited<ReturnType<typeof resolvePaystackTerminalTenantScope>>,
  request: NextRequest,
  user: { id: string; email?: string | null },
  rawBody: unknown,
) {
  const body = rejectSchema.parse(rawBody);
  const { row, outOfScope } = await loadSetupRequestForAction(
    supabase,
    tenantScope,
    body.request_id,
    ["requested", "in_progress"],
  );
  if (!row || outOfScope) {
    return errorResponse("Setup request not found or cannot be rejected.", "NOT_FOUND", 404);
  }

  const now = new Date().toISOString();
  const providerName = row.provider?.business_name ?? "your business";

  let supportTicketId: string | null = row.support_ticket_id ?? null;
  if (body.create_ticket) {
    try {
      const ticket = await createProviderSupportTicket({
        providerId: row.provider_id,
        ownerUserId: row.provider?.user_id ?? null,
        actorUserId: user.id,
        subject: `Paystack Terminal setup needs changes — ${providerName}`,
        message:
          `Your Paystack Terminal setup request was not approved yet.\n\nReason: ${body.reason}\n\n` +
          "Please update your WhatsApp number (use the international format, e.g. +27821234567) or other details on the Paystack Terminal settings page and submit a new request. Reply here if you need help.",
        priority: "medium",
        category: "payments",
        supportContextType: "payment",
        supportContextId: row.id,
        supportContextLabel: `Paystack Terminal setup · ${providerName}`,
        messageFrom: "staff",
        request,
      });
      supportTicketId = ticket.id;
    } catch (ticketErr) {
      console.error("Paystack Terminal reject: support ticket creation failed", ticketErr);
    }
  }

  const { data: updated, error: updateError } = await (supabase
    .from("provider_paystack_virtual_terminal_setup_requests") as any)
    .update({
      status: "rejected",
      rejection_reason: body.reason,
      rejected_by: user.id,
      rejected_at: now,
      support_ticket_id: supportTicketId,
    })
    .eq("id", row.id)
    .in("status", ["requested", "in_progress"])
    .select()
    .single();
  if (updateError) throw updateError;

  return successResponse({ setup_request: updated, support_ticket_id: supportTicketId });
}

async function handleCreateSupportTicketForRequest(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantScope: Awaited<ReturnType<typeof resolvePaystackTerminalTenantScope>>,
  request: NextRequest,
  user: { id: string; email?: string | null },
  rawBody: unknown,
) {
  const body = createSupportTicketSchema.parse(rawBody);
  const { row, outOfScope } = await loadSetupRequestForAction(
    supabase,
    tenantScope,
    body.request_id,
    ["requested", "in_progress", "rejected", "created", "cancelled"],
  );
  if (!row || outOfScope) {
    return errorResponse("Setup request not found.", "NOT_FOUND", 404);
  }

  if (row.support_ticket_id) {
    return successResponse({ support_ticket_id: row.support_ticket_id, already_exists: true });
  }

  const providerName = row.provider?.business_name ?? "your business";
  const ticket = await createProviderSupportTicket({
    providerId: row.provider_id,
    ownerUserId: row.provider?.user_id ?? null,
    actorUserId: user.id,
    subject: `Paystack Terminal setup — ${providerName}`,
    message:
      body.message?.trim() ||
      "We're reaching out about your Paystack Terminal setup request. Reply here and our team will help you get it sorted.",
    priority: "medium",
    category: "payments",
    supportContextType: "payment",
    supportContextId: row.id,
    supportContextLabel: `Paystack Terminal setup · ${providerName}`,
    messageFrom: "staff",
    request,
  });

  const { error: linkError } = await (supabase
    .from("provider_paystack_virtual_terminal_setup_requests") as any)
    .update({ support_ticket_id: ticket.id })
    .eq("id", row.id);
  if (linkError) throw linkError;

  return successResponse({ support_ticket_id: ticket.id });
}
