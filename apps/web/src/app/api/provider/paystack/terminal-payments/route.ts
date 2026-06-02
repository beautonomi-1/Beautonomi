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
import { getPaystackTerminalAvailability } from "@/lib/payments/paystack-terminal-availability";

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
    // Ringfence the inbox to a single virtual terminal when requested. The provider_id filter
    // below means an id that does not belong to this provider simply returns nothing, so this
    // is safe even with an arbitrary (but well-formed) uuid.
    const terminalIdParam = searchParams.get("terminal_id");
    const terminalId = terminalIdParam && z.string().uuid().safeParse(terminalIdParam).success ? terminalIdParam : null;

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

    if (terminalId) query = query.eq("terminal_id", terminalId);
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

    const availability = await getPaystackTerminalAvailability({ supabase, providerId });
    const selectableTerminals = availability.selectableTerminals;
    if (selectableTerminals.length === 0) {
      if (availability.terminals.some((t) => t.active)) {
        return errorResponse(
          "This Paystack Terminal is still waiting for Ops to add the Paystack payment link.",
          "TERMINAL_LINK_NOT_READY",
          400,
        );
      }
      return errorResponse(
        "No active Paystack Terminal is available. Request setup and wait for Ops to import the Paystack terminal first.",
        "TERMINAL_NOT_READY",
        400,
      );
    }

    const terminal =
      (body.terminal_id ? selectableTerminals.find((t) => t.id === body.terminal_id) : null) ??
      selectableTerminals[0];
    if (!terminal) {
      return errorResponse(
        "The selected Paystack Terminal is not available for collection.",
        "TERMINAL_NOT_READY",
        400,
      );
    }

    // Auto-fill the customer reference with the booking/order number so it is embedded in
    // metadata AND can be shared with the customer to type on the hosted Paystack page.
    let customerReference = body.customer_reference ?? null;
    if (!customerReference && body.entity_id) {
      if (body.entity_type === "booking") {
        const { data: booking } = await supabase
          .from("bookings")
          .select("booking_number")
          .eq("id", body.entity_id)
          .eq("provider_id", providerId)
          .maybeSingle();
        customerReference = (booking as { booking_number?: string | null } | null)?.booking_number ?? null;
      } else if (body.entity_type === "product_order") {
        const { data: order } = await (supabase.from("product_orders") as any)
          .select("order_number")
          .eq("id", body.entity_id)
          .eq("provider_id", providerId)
          .maybeSingle();
        customerReference = (order as { order_number?: string | null } | null)?.order_number ?? null;
      }
    }

    const metadata = {
      source: "beautonomi_provider_terminal",
      payment_channel: "paystack_virtual_terminal",
      provider_id: providerId,
      paystack_terminal_code: terminal.terminal_code,
      entity_type: body.entity_type ?? null,
      entity_id: body.entity_id ?? null,
      expected_amount: body.expected_amount ?? null,
      customer_reference: customerReference,
    };

    return successResponse({
      terminal,
      terminals: selectableTerminals,
      metadata,
      expectedAmount: body.expected_amount ?? null,
      entityType: body.entity_type ?? null,
      entityId: body.entity_id ?? null,
      customerReference,
      instructions:
        "Ask the customer to scan the QR or pay through this Paystack Terminal. Paystack generates the transaction reference automatically; once it confirms the payment, it appears in your inbox to allocate to this booking, sale, or order.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to prepare Paystack Terminal collection");
  }
}
