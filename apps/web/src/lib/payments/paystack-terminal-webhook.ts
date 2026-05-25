import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import {
  buildExplicitTerminalSuggestion,
  buildUnmatchedTerminalSuggestion,
  type TerminalAllocationEntityType,
} from "@/lib/payments/paystack-terminal-allocation";
import { sendToUser } from "@/lib/notifications/onesignal";

type SupabaseLike = any;

type PaystackTerminalChargeData = {
  id?: number;
  reference?: string;
  amount?: number;
  fees?: number;
  currency?: string;
  metadata?: Record<string, unknown> | null;
  customer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
  channel?: string;
  paid_at?: string;
  created_at?: string;
  [key: string]: unknown;
};

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nestedCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).code;
  return typeof code === "string" && code.trim().length > 0 ? code.trim() : null;
}

function sourceString(data: PaystackTerminalChargeData, key: string): string | null {
  const source = (data as any).source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function customFieldString(data: PaystackTerminalChargeData, key: string): string | null {
  const fields =
    Array.isArray((data.metadata as any)?.custom_fields)
      ? ((data.metadata as any).custom_fields as Array<Record<string, unknown>>)
      : Array.isArray((data as any).custom_fields)
        ? ((data as any).custom_fields as Array<Record<string, unknown>>)
        : [];
  const match = fields.find((field) => field.variable_name === key || field.display_name === key);
  const value = match?.value;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeEntityType(value: string | null): TerminalAllocationEntityType | null {
  if (!value) return null;
  if (
    [
      "booking",
      "invoice",
      "sale",
      "product_order",
      "group_booking",
      "additional_charge",
      "other",
    ].includes(value)
  ) {
    return value as TerminalAllocationEntityType;
  }
  return null;
}

export function isPaystackTerminalCharge(data: PaystackTerminalChargeData): boolean {
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? data.metadata
      : {};
  return (
    metadata.source === "beautonomi_provider_terminal" ||
    metadata.payment_channel === "paystack_virtual_terminal" ||
    typeof metadata.paystack_terminal_code === "string" ||
    typeof metadata.terminal_code === "string" ||
    nestedCode(metadata.virtual_terminal) !== null ||
    typeof (data as any).virtual_terminal?.code === "string" ||
    typeof (data as any).terminal?.code === "string" ||
    sourceString(data, "source") === "virtual_terminal" ||
    (sourceString(data, "identifier")?.toUpperCase().startsWith("VT_") ?? false) ||
    String(data.channel ?? "").toLowerCase() === "virtual_terminal"
  );
}

async function resolveTerminalContext(
  supabase: SupabaseLike,
  data: PaystackTerminalChargeData,
  metadata: Record<string, unknown>,
) {
  const providerId = metadataString(metadata, "provider_id");
  const terminalCode =
    metadataString(metadata, "paystack_terminal_code") ??
    metadataString(metadata, "terminal_code") ??
    nestedCode(metadata.virtual_terminal) ??
    ((data as any).virtual_terminal?.code
      ? String((data as any).virtual_terminal.code)
      : (data as any).terminal?.code
        ? String((data as any).terminal.code)
        : sourceString(data, "identifier"));

  if (providerId || terminalCode) {
    let query = supabase
      .from("provider_paystack_virtual_terminals")
      .select("id, provider_id, terminal_code, currency")
      .limit(1);
    if (terminalCode) query = query.eq("terminal_code", terminalCode);
    if (providerId) query = query.eq("provider_id", providerId);
    const { data: terminal } = await query.maybeSingle();
    if (terminal) return terminal;
  }

  return providerId
    ? { id: null, provider_id: providerId, terminal_code: terminalCode, currency: data.currency ?? "ZAR" }
    : null;
}

async function resolveExplicitTargetSuggestion(
  supabase: SupabaseLike,
  providerId: string,
  metadata: Record<string, unknown>,
  paidAmount: number,
  currency: string,
  customerReference?: string | null,
) {
  const entityType = normalizeEntityType(metadataString(metadata, "entity_type"));
  const entityId =
    metadataString(metadata, "entity_id") ??
    metadataString(metadata, "booking_id") ??
    metadataString(metadata, "product_order_id");
  if (!entityType || !entityId) {
    if (customerReference) {
      const ref = customerReference.replace(/[,()]/g, "").trim();
      if (!ref) return buildUnmatchedTerminalSuggestion({ paidAmount, currency });
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, provider_id, total_amount, total_paid, currency, payment_status")
        .eq("provider_id", providerId)
        .or(`booking_number.eq.${ref},ref_number.eq.${ref}`)
        .limit(1)
        .maybeSingle();
      if (booking) {
        return buildExplicitTerminalSuggestion({
          entityType: "booking",
          entityId: String((booking as any).id),
          paidAmount,
          expectedAmount: Math.max(
            0,
            Number((booking as any).total_amount ?? 0) - Number((booking as any).total_paid ?? 0),
          ),
          currency,
          expectedCurrency: (booking as any).currency ?? currency,
        });
      }
    }
    return buildUnmatchedTerminalSuggestion({ paidAmount, currency });
  }

  if (entityType === "booking") {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, provider_id, total_amount, total_paid, currency, payment_status")
      .eq("id", entityId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (booking) {
      return buildExplicitTerminalSuggestion({
        entityType,
        entityId,
        paidAmount,
        expectedAmount: Math.max(
          0,
          Number((booking as any).total_amount ?? 0) - Number((booking as any).total_paid ?? 0),
        ),
        currency,
        expectedCurrency: (booking as any).currency ?? currency,
      });
    }
  }

  return {
    ...buildUnmatchedTerminalSuggestion({ paidAmount, currency }),
    entityType,
    entityId,
    allocationStatus: "admin_review" as const,
    reasons: ["explicit_target_not_auto_resolved"],
    confidence: 20,
  };
}

export async function recordPaystackTerminalCharge(
  supabase: SupabaseLike,
  data: PaystackTerminalChargeData,
) {
  const reference = data.reference;
  if (!reference) return { recorded: false, reason: "missing_reference" };

  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? data.metadata
      : {};
  const context = await resolveTerminalContext(supabase, data, metadata);
  if (!context?.provider_id) return { recorded: false, reason: "missing_provider" };

  const paidAmount = convertFromSmallestUnit(Number(data.amount ?? 0));
  const feeAmount = convertFromSmallestUnit(Number(data.fees ?? 0));
  const currency = String(data.currency ?? context.currency ?? "ZAR").toUpperCase();
  const suggestion = await resolveExplicitTargetSuggestion(
    supabase,
    context.provider_id,
    metadata,
    paidAmount,
    currency,
    metadataString(metadata, "customer_reference") ?? customFieldString(data, "customer_reference"),
  );
  const customerReference =
    metadataString(metadata, "customer_reference") ?? customFieldString(data, "customer_reference");

  const payerName = [data.customer?.first_name, data.customer?.last_name].filter(Boolean).join(" ");
  const payload = {
    provider_id: context.provider_id,
    terminal_id: context.id,
    terminal_code: context.terminal_code,
    paystack_transaction_id: data.id ?? null,
    paystack_reference: reference,
    status: suggestion.allocationStatus === "suggested" ? "matched" : "received",
    allocation_status: suggestion.allocationStatus,
    amount_match_status: suggestion.amountMatchStatus,
    gross_amount: paidAmount,
    paid_amount: paidAmount,
    expected_amount: suggestion.expectedAmount,
    amount_due_at_match_time: suggestion.amountDueAtMatchTime,
    amount_difference: suggestion.amountDifference,
    gateway_fee_amount: feeAmount,
    net_amount: Math.max(0, paidAmount - feeAmount),
    currency,
    payer_name: payerName || null,
    payer_email: data.customer?.email ?? null,
    payer_phone: data.customer?.phone ?? null,
    customer_reference: customerReference,
    suggested_entity_type: suggestion.entityType,
    suggested_entity_id: suggestion.entityId,
    suggestion_confidence: suggestion.confidence,
    candidate_match_reasons: suggestion.reasons,
    raw_payload: data,
    metadata,
    received_at: data.paid_at ?? data.created_at ?? new Date().toISOString(),
  };

  const { data: row, error } = await (supabase
    .from("provider_paystack_terminal_payments") as any)
    .upsert(payload, { onConflict: "paystack_reference" })
    .select()
    .single();
  if (error) throw error;

  if (context.id) {
    await (supabase.from("provider_paystack_virtual_terminals") as any)
      .update({ last_payment_at: payload.received_at })
      .eq("id", context.id);
  }

  if ((row as any)?.provider_notification_status === "pending") {
    const { data: provider } = await supabase
      .from("providers")
      .select("id, user_id, tenant_id, business_name")
      .eq("id", context.provider_id)
      .maybeSingle();
    const providerUserId = (provider as { user_id?: string | null } | null)?.user_id ?? null;
    if (providerUserId) {
      const result = await sendToUser(
        providerUserId,
        {
          title: "Paystack Terminal payment received",
          message: `${currency} ${paidAmount.toFixed(2)} received${customerReference ? ` · Note ${customerReference}` : ""}. Review and allocate it in Paystack Terminal.`,
          data: {
            type: "paystack_terminal_payment",
            terminal_payment_id: row.id,
            paystack_reference: reference,
            provider_id: context.provider_id,
            amount: paidAmount,
            currency,
            allocation_status: suggestion.allocationStatus,
            amount_match_status: suggestion.amountMatchStatus,
            customer_reference: customerReference,
          },
        },
        ["push"],
        { appType: "provider", tenantId: (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null },
      );
      await (supabase.from("provider_paystack_terminal_payments") as any)
        .update({
          provider_notification_status: result.success ? "sent" : "failed",
          provider_notified_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } else {
      await (supabase.from("provider_paystack_terminal_payments") as any)
        .update({ provider_notification_status: "not_required" })
        .eq("id", row.id);
    }
  }

  return { recorded: true, payment: row };
}
