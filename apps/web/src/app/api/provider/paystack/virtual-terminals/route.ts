import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";
import { checkPaystackVirtualTerminalFeatureAccess } from "@/lib/subscriptions/feature-access";
import { slackNotifyPaystackTerminalSetupRequested } from "@/lib/integrations/slack/ops-triggers";
import { buildPaystackTerminalName, normalizeWhatsAppTarget } from "@/lib/payments/paystack-terminal-assets";

const setupRequestSchema = z.object({
  name: z.string().trim().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  currency: z.string().trim().length(3).optional(),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  destinations: z
    .array(
      z.object({
        target: z.string().trim().min(1),
        name: z.string().trim().min(1),
      }),
    )
    .optional()
    .default([]),
  // No custom fields on the hosted Paystack page: a Virtual Terminal QR is static, Paystack
  // generates its own transaction reference, and payments are matched by amount + timing and
  // confirmed by the provider in the inbox. Asking the customer for a booking/order number
  // here is redundant and confusing.
  custom_fields: z
    .array(
      z.object({
        display_name: z.string().trim().min(1),
        variable_name: z.string().trim().min(1),
      }),
    )
    .optional()
    .default([]),
});

async function resolveProvider(request: NextRequest) {
  const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase, { request });
  if (!providerId) return { supabase, user, providerId: null, provider: null };

  const { data: provider } = await supabase
    .from("providers")
    .select("id, tenant_id, currency, business_name, phone, billing_phone, billing_email, user_id")
    .eq("id", providerId)
    .maybeSingle();

  return { supabase, user, providerId, provider };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, providerId } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const access = await checkPaystackVirtualTerminalFeatureAccess(providerId, supabase as any);
    const { data, error } = await (supabase
      .from("provider_paystack_virtual_terminals") as any)
      .select("*")
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const { data: setupRequests, error: setupError } = await (supabase
      .from("provider_paystack_virtual_terminal_setup_requests") as any)
      .select("*")
      .eq("provider_id", providerId)
      .in("status", ["requested", "in_progress", "rejected"])
      .order("created_at", { ascending: false });
    if (setupError) throw setupError;

    return successResponse({
      terminals: data ?? [],
      setupRequests: setupRequests ?? [],
      subscription: access,
      canRequestSetup: access.enabled,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Paystack terminals");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, providerId, provider } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);
    const admin = getSupabaseAdmin();

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const access = await checkPaystackVirtualTerminalFeatureAccess(providerId, supabase as any);
    if (!access.enabled) {
      return errorResponse(
        "Paystack Terminal requires a subscription upgrade.",
        "SUBSCRIPTION_REQUIRED",
        403,
      );
    }

    const body = setupRequestSchema.parse(await request.json());
    if (body.location_id && !access.perLocationTerminals) {
      return errorResponse(
        "Per-location Paystack terminals are not available on this plan.",
        "LOCATION_TERMINAL_NOT_ALLOWED",
        403,
      );
    }

    const { count: terminalCount, error: countError } = await (admin
      .from("provider_paystack_virtual_terminals") as any)
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .is("deleted_at", null);
    if (countError) throw countError;
    const nextTerminalNumber = (terminalCount ?? 0) + 1;
    if (access.maxTerminals && (terminalCount ?? 0) >= access.maxTerminals) {
      return errorResponse(
        `You've reached your Paystack Terminal limit (${access.maxTerminals}).`,
        "LIMIT_REACHED",
        403,
      );
    }

    let locationName: string | null = null;
    if (body.location_id) {
      const { data: loc } = await admin
        .from("provider_locations")
        .select("id, name, city")
        .eq("id", body.location_id)
        .eq("provider_id", providerId)
        .maybeSingle();
      locationName = typeof loc?.name === "string" ? loc.name : null;
    }

    const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const { data: owner } = (provider as { user_id?: string | null } | null)?.user_id
      ? await admin
          .from("users")
          .select("id, full_name, email, phone")
          .eq("id", (provider as { user_id?: string }).user_id)
          .maybeSingle()
      : { data: null };
    const providerBusinessName = (provider as { business_name?: string | null } | null)?.business_name ?? null;
    const displayName = body.name?.trim() || locationName || (nextTerminalNumber === 1 ? "Front desk" : `Terminal ${nextTerminalNumber}`);
    const terminalName = buildPaystackTerminalName({
      providerBusinessName,
      providerDisplayName: (owner as { full_name?: string | null } | null)?.full_name ?? null,
      locationName,
      requestedName: displayName,
      uniqueSuffix: providerId,
      portable: !body.location_id,
    });
    const destinationTarget =
      normalizeWhatsAppTarget(body.whatsapp) ??
      normalizeWhatsAppTarget(body.destinations[0]?.target) ??
      normalizeWhatsAppTarget(
        (provider as { phone?: string | null; billing_phone?: string | null } | null)?.phone ??
          (provider as { phone?: string | null; billing_phone?: string | null } | null)?.billing_phone ??
          (owner as { phone?: string | null } | null)?.phone ??
          null,
      );
    const destinationName =
      body.destinations[0]?.name ??
      (providerBusinessName ? `${providerBusinessName} WhatsApp` : "Provider WhatsApp");
    const destinations = destinationTarget
      ? [{ target: destinationTarget, name: destinationName }]
      : [];
    const currency =
      body.currency?.toUpperCase() ??
      (provider as { currency?: string | null } | null)?.currency ??
      "ZAR";
    const metadata = {
      provider_id: providerId,
      provider_business_name: providerBusinessName,
      location_id: body.location_id ?? null,
      location_name: locationName,
      tenant_id: tenantId,
      source: "beautonomi_provider_terminal",
      requested_by: user.id,
    };
    let existingRequestQuery = (admin
      .from("provider_paystack_virtual_terminal_setup_requests") as any)
      .select("id")
      .eq("provider_id", providerId)
      .in("status", ["requested", "in_progress"]);
    existingRequestQuery = body.location_id
      ? existingRequestQuery.eq("location_id", body.location_id)
      : existingRequestQuery.is("location_id", null);
    const { data: existingRequest } = await existingRequestQuery.maybeSingle();
    const setupPayload = {
      provider_id: providerId,
      location_id: body.location_id ?? null,
      requested_by: user.id,
      status: "requested",
      requested_display_name: displayName,
      suggested_paystack_name: terminalName,
      currency,
      destination_target: destinationTarget,
      destination_name: destinationTarget ? destinationName : null,
      destinations,
      custom_fields: body.custom_fields,
      metadata,
      request_notes: destinationTarget
        ? null
        : "No provider phone or billing phone was available for Paystack WhatsApp destination.",
    };
    const { data: setupRequest, error: setupRequestError } = existingRequest?.id
      ? await (admin
          .from("provider_paystack_virtual_terminal_setup_requests") as any)
          .update(setupPayload)
          .eq("id", existingRequest.id)
          .select()
          .single()
      : await (admin
          .from("provider_paystack_virtual_terminal_setup_requests") as any)
          .insert(setupPayload)
          .select()
          .single();
    if (setupRequestError) throw setupRequestError;
    slackNotifyPaystackTerminalSetupRequested({
      tenantId,
      requestId: setupRequest.id,
      providerId,
      providerName: providerBusinessName,
      requestedBy: user.email ?? user.id,
      suggestedTerminalName: terminalName,
      destinationTarget,
    });

    return successResponse(
      {
        requested: true,
        status: "admin_setup_required",
        setup_request: setupRequest,
        suggested_name: terminalName,
        destination_target: destinationTarget,
        message:
          "Beautonomi Ops has been notified. Paystack generates the terminal code, payment page, and poster; Ops will add them here once the terminal is ready.",
      },
      202,
    );
  } catch (error) {
    return handleApiError(error, "Failed to request Paystack Terminal setup");
  }
}
