import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  errorResponse,
  getOffsetPaginationParams,
  getProviderIdForUser,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePaystackVirtualTerminalEnabledForProvider } from "@/lib/payments/paystack-virtual-terminal-feature-gate";

const collectionIntentSchema = z.object({
  terminal_id: z.string().uuid().optional(),
  entity_type: z
    .enum(["booking", "invoice", "sale", "product_order", "group_booking", "additional_charge", "other"])
    .optional(),
  entity_id: z.string().uuid().optional(),
  expected_amount: z.number().nonnegative().optional(),
  customer_reference: z.string().trim().optional(),
});

async function resolveProvider(request: NextRequest) {
  const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase, { request });
  return { supabase, user, providerId };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, providerId } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { searchParams } = new URL(request.url);
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 25, maxLimit: 100 });
    const allocationStatus = searchParams.get("allocation_status");
    const status = searchParams.get("status");

    let query = (supabase.from("provider_paystack_terminal_payments") as any)
      .select(
        `
          *,
          allocations:provider_terminal_payment_allocations(*),
          terminal:provider_paystack_virtual_terminals(id, name, terminal_code, location_id)
        `,
        { count: "exact" },
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (allocationStatus) query = query.eq("allocation_status", allocationStatus);
    if (status) query = query.eq("status", status);

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
    return handleApiError(error, "Failed to load Paystack Terminal payments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, providerId } = await resolveProvider(request);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const gate = await requirePaystackVirtualTerminalEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const body = collectionIntentSchema.parse(await request.json());
    const terminalQuery = (supabase.from("provider_paystack_virtual_terminals") as any)
      .select("id, name, terminal_code, payment_link, qr_url, terminal_url, currency, active")
      .eq("provider_id", providerId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    const { data: terminals, error } = body.terminal_id
      ? await terminalQuery.eq("id", body.terminal_id).limit(1)
      : await terminalQuery.limit(1);
    if (error) throw error;

    const terminal = terminals?.[0];
    if (!terminal) {
      return errorResponse(
        "No active Paystack Terminal is available. Request setup and wait for Ops to import the Paystack terminal first.",
        "TERMINAL_NOT_READY",
        400,
      );
    }
    if (!terminal.payment_link && !terminal.terminal_url) {
      return errorResponse(
        "This Paystack Terminal is still waiting for Ops to add the Paystack payment link.",
        "TERMINAL_LINK_NOT_READY",
        400,
      );
    }

    const metadata = {
      source: "beautonomi_provider_terminal",
      payment_channel: "paystack_virtual_terminal",
      provider_id: providerId,
      paystack_terminal_code: terminal.terminal_code,
      entity_type: body.entity_type ?? null,
      entity_id: body.entity_id ?? null,
      expected_amount: body.expected_amount ?? null,
      customer_reference: body.customer_reference ?? null,
    };

    return successResponse({
      terminal,
      metadata,
      expectedAmount: body.expected_amount ?? null,
      entityType: body.entity_type ?? null,
      entityId: body.entity_id ?? null,
      instructions:
        "Ask the customer to pay through this Paystack Terminal. Once Paystack confirms the payment, it will appear in the provider inbox for allocation.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to prepare Paystack Terminal collection");
  }
}
