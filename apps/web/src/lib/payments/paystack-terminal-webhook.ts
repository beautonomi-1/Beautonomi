import * as Sentry from "@sentry/nextjs";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { verifyTransaction } from "@/lib/payments/paystack-complete";
import {
  buildExplicitTerminalSuggestion,
  buildUnmatchedTerminalSuggestion,
  rankTerminalCandidates,
  type RawTerminalCandidate,
  type TerminalAllocationEntityType,
  type TerminalMatchCandidate,
  type TerminalPaymentSuggestion,
} from "@/lib/payments/paystack-terminal-allocation";
import { sendToUser } from "@/lib/notifications/onesignal";
import { insertNotification } from "@/lib/notifications/insert-notification";

type SupabaseLike = any;

type ResolvedTerminalContext = {
  id: string | null;
  provider_id: string;
  terminal_code: string | null;
  currency?: string | null;
};

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

function extractTerminalCode(
  data: PaystackTerminalChargeData,
  metadata: Record<string, unknown>,
): string | null {
  return (
    metadataString(metadata, "paystack_terminal_code") ??
    metadataString(metadata, "terminal_code") ??
    nestedCode(metadata.virtual_terminal) ??
    ((data as any).virtual_terminal?.code
      ? String((data as any).virtual_terminal.code)
      : (data as any).terminal?.code
        ? String((data as any).terminal.code)
        : sourceString(data, "identifier"))
  );
}

async function lookupTerminalRow(
  supabase: SupabaseLike,
  params: { providerId?: string | null; terminalCode?: string | null },
): Promise<ResolvedTerminalContext | null> {
  if (!params.providerId && !params.terminalCode) return null;
  let query = supabase
    .from("provider_paystack_virtual_terminals")
    .select("id, provider_id, terminal_code, currency")
    .limit(1);
  if (params.terminalCode) query = query.eq("terminal_code", params.terminalCode);
  if (params.providerId) query = query.eq("provider_id", params.providerId);
  const { data: terminal } = await query.maybeSingle();
  return (terminal as ResolvedTerminalContext | null) ?? null;
}

async function resolveTerminalContext(
  supabase: SupabaseLike,
  data: PaystackTerminalChargeData,
  metadata: Record<string, unknown>,
): Promise<ResolvedTerminalContext | null> {
  const providerId = metadataString(metadata, "provider_id");
  const terminalCode = extractTerminalCode(data, metadata);

  if (providerId || terminalCode) {
    const terminal = await lookupTerminalRow(supabase, { providerId, terminalCode });
    if (terminal) return terminal;
  }

  // Fallback: hosted-link payments (paystack.shop/pay/<code>) can arrive without our
  // metadata. Re-read the transaction from Paystack to recover terminal/source markers,
  // then re-map to one of our terminals before giving up.
  const reference = typeof data.reference === "string" ? data.reference : null;
  if (!providerId && !terminalCode && reference) {
    try {
      const verified = await verifyTransaction(reference);
      const verifiedData = verified?.data as unknown as PaystackTerminalChargeData | undefined;
      if (verifiedData) {
        const verifiedMetadata =
          verifiedData.metadata && typeof verifiedData.metadata === "object" && !Array.isArray(verifiedData.metadata)
            ? verifiedData.metadata
            : {};
        const verifiedProviderId = metadataString(verifiedMetadata, "provider_id");
        const verifiedTerminalCode = extractTerminalCode(verifiedData, verifiedMetadata);
        if (verifiedProviderId || verifiedTerminalCode) {
          const terminal = await lookupTerminalRow(supabase, {
            providerId: verifiedProviderId,
            terminalCode: verifiedTerminalCode,
          });
          if (terminal) return terminal;
          if (verifiedProviderId) {
            return {
              id: null,
              provider_id: verifiedProviderId,
              terminal_code: verifiedTerminalCode,
              currency: verifiedData.currency ?? data.currency ?? "ZAR",
            };
          }
        }
      }
    } catch (verifyError) {
      console.error("Paystack terminal context verify fallback failed:", verifyError);
    }
  }

  return providerId
    ? { id: null, provider_id: providerId, terminal_code: terminalCode, currency: data.currency ?? "ZAR" }
    : null;
}

/**
 * DB-backed detection for charges that did not carry our terminal metadata. Returns the
 * matched terminal context only when the charge maps to one of our known terminals, so the
 * webhook can still route it into the terminal inbox instead of silently dropping it.
 */
export async function resolveKnownTerminalForCharge(
  supabase: SupabaseLike,
  data: PaystackTerminalChargeData,
): Promise<ResolvedTerminalContext | null> {
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? data.metadata
      : {};
  const context = await resolveTerminalContext(supabase, data, metadata);
  // Only treat it as a terminal charge when it maps to an actual terminal row we own.
  return context?.id ? context : null;
}

type SuggestionResult = {
  suggestion: TerminalPaymentSuggestion;
  candidates: TerminalMatchCandidate[];
};

function candidateFromSuggestion(
  suggestion: TerminalPaymentSuggestion,
  extra: { label?: string | null; reference?: string | null; occurredAt?: string | null; createdAt?: string | null },
): TerminalMatchCandidate[] {
  if (!suggestion.entityType || !suggestion.entityId) return [];
  return [
    {
      entity_type: suggestion.entityType,
      entity_id: suggestion.entityId,
      label: extra.label ?? null,
      reference: extra.reference ?? null,
      expected_amount: suggestion.expectedAmount ?? 0,
      amount_match_status: suggestion.amountMatchStatus,
      amount_difference: suggestion.amountDifference,
      confidence: suggestion.confidence ?? 0,
      reasons: suggestion.reasons,
      occurred_at: extra.occurredAt ?? null,
      created_at: extra.createdAt ?? null,
    },
  ];
}

/**
 * Fallback ranking over the provider's recent open bookings/orders when the payment did not
 * carry an explicit target or a matching reference. Ranks by amount + timing (see
 * rankTerminalCandidates) and returns the best suggestion plus alternatives for the picker.
 */
async function suggestFromOpenEntities(
  supabase: SupabaseLike,
  providerId: string,
  paidAmount: number,
  currency: string,
): Promise<SuggestionResult> {
  const now = Date.now();
  const windowStart = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 1 * 24 * 60 * 60 * 1000).toISOString();
  const rawCandidates: RawTerminalCandidate[] = [];

  try {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, booking_number, ref_number, total_amount, total_paid, currency, payment_status, scheduled_at, created_at")
      .eq("provider_id", providerId)
      .neq("payment_status", "paid")
      .gte("scheduled_at", windowStart)
      .lte("scheduled_at", windowEnd)
      .order("scheduled_at", { ascending: false })
      .limit(30);
    for (const booking of (bookings ?? []) as any[]) {
      const outstanding = Math.max(0, Number(booking.total_amount ?? 0) - Number(booking.total_paid ?? 0));
      if (outstanding <= 0) continue;
      rawCandidates.push({
        entityType: "booking",
        entityId: String(booking.id),
        label: booking.booking_number ?? null,
        reference: booking.booking_number ?? booking.ref_number ?? null,
        expectedAmount: outstanding,
        expectedCurrency: booking.currency ?? currency,
        occurredAt: booking.scheduled_at ?? null,
        createdAt: booking.created_at ?? null,
      });
    }
  } catch (err) {
    console.error("suggestFromOpenEntities bookings query failed:", err);
  }

  try {
    const { data: orders } = await supabase
      .from("product_orders")
      .select("id, order_number, total_amount, payment_status, created_at")
      .eq("provider_id", providerId)
      .neq("payment_status", "paid")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(30);
    for (const order of (orders ?? []) as any[]) {
      const expected = Number(order.total_amount ?? 0);
      if (expected <= 0) continue;
      rawCandidates.push({
        entityType: "product_order",
        entityId: String(order.id),
        label: order.order_number ?? null,
        reference: order.order_number ?? null,
        expectedAmount: expected,
        expectedCurrency: currency,
        createdAt: order.created_at ?? null,
      });
    }
  } catch (err) {
    console.error("suggestFromOpenEntities product_orders query failed:", err);
  }

  return rankTerminalCandidates({ paidAmount, currency, rawCandidates, now });
}

async function suggestTerminalPaymentTargets(
  supabase: SupabaseLike,
  providerId: string,
  metadata: Record<string, unknown>,
  paidAmount: number,
  currency: string,
  customerReference?: string | null,
): Promise<SuggestionResult> {
  const entityType = normalizeEntityType(metadataString(metadata, "entity_type"));
  const entityId =
    metadataString(metadata, "entity_id") ??
    metadataString(metadata, "booking_id") ??
    metadataString(metadata, "product_order_id");

  // 1) Explicit target embedded in metadata (provider collected against a known booking).
  if (entityType === "booking" && entityId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, provider_id, booking_number, total_amount, total_paid, currency, payment_status, scheduled_at, created_at")
      .eq("id", entityId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (booking) {
      const suggestion = buildExplicitTerminalSuggestion({
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
      return {
        suggestion,
        candidates: candidateFromSuggestion(suggestion, {
          label: (booking as any).booking_number ?? null,
          reference: (booking as any).booking_number ?? null,
          occurredAt: (booking as any).scheduled_at ?? null,
          createdAt: (booking as any).created_at ?? null,
        }),
      };
    }
    const fallbackSuggestion: TerminalPaymentSuggestion = {
      ...buildUnmatchedTerminalSuggestion({ paidAmount, currency }),
      entityType,
      entityId,
      allocationStatus: "admin_review",
      reasons: ["explicit_target_not_auto_resolved"],
      confidence: 20,
    };
    return { suggestion: fallbackSuggestion, candidates: [] };
  }

  // 2) Customer reference typed on the hosted page -> match a booking by number.
  if (customerReference) {
    const ref = customerReference.replace(/[,()]/g, "").trim();
    if (ref) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, provider_id, booking_number, total_amount, total_paid, currency, payment_status, scheduled_at, created_at")
        .eq("provider_id", providerId)
        .or(`booking_number.eq.${ref},ref_number.eq.${ref}`)
        .limit(1)
        .maybeSingle();
      if (booking) {
        const suggestion = buildExplicitTerminalSuggestion({
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
        const reasoned: TerminalPaymentSuggestion = {
          ...suggestion,
          reasons: [...suggestion.reasons, "customer_reference_match"],
        };
        return {
          suggestion: reasoned,
          candidates: candidateFromSuggestion(reasoned, {
            label: (booking as any).booking_number ?? null,
            reference: (booking as any).booking_number ?? null,
            occurredAt: (booking as any).scheduled_at ?? null,
            createdAt: (booking as any).created_at ?? null,
          }),
        };
      }
    }
  }

  // 3) Amount + timing ranking over recent open bookings/orders.
  return suggestFromOpenEntities(supabase, providerId, paidAmount, currency);
}

export async function recordPaystackTerminalCharge(
  supabase: SupabaseLike,
  data: PaystackTerminalChargeData,
  options?: { context?: ResolvedTerminalContext | null },
) {
  const reference = data.reference;
  if (!reference) return { recorded: false, reason: "missing_reference" };

  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? data.metadata
      : {};
  const context = options?.context ?? (await resolveTerminalContext(supabase, data, metadata));
  if (!context?.provider_id) {
    // A payment we received must never vanish silently. We cannot insert without a
    // provider (provider_id is NOT NULL), so raise a loud, deduplicated Ops alert.
    try {
      Sentry.captureMessage("paystack_terminal.unresolved_charge", {
        level: "warning",
        tags: {
          surface: "payments.paystack_terminal",
          "paystack_terminal.unresolved": "true",
        },
        extra: {
          reference,
          paystack_transaction_id: data.id ?? null,
          channel: (data as { channel?: unknown }).channel ?? null,
          terminal_code: extractTerminalCode(data, metadata),
        },
      });
    } catch {
      /* Sentry must never throw out of the webhook path */
    }
    return { recorded: false, reason: "missing_provider" };
  }

  const paidAmount = convertFromSmallestUnit(Number(data.amount ?? 0));
  const feeAmount = convertFromSmallestUnit(Number(data.fees ?? 0));
  const currency = String(data.currency ?? context.currency ?? "ZAR").toUpperCase();
  const customerReference =
    metadataString(metadata, "customer_reference") ?? customFieldString(data, "customer_reference");
  const { suggestion, candidates } = await suggestTerminalPaymentTargets(
    supabase,
    context.provider_id,
    metadata,
    paidAmount,
    currency,
    customerReference,
  );

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
    match_candidates: candidates,
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

  // Auto-finalize parity with PayCloud: when the charge confidently maps to a
  // pending walk-in product order (exact amount + auto-suggested), finalize the
  // sale immediately instead of stranding it in the manual allocation inbox.
  // Best-effort — never let this break the webhook; the payment is already
  // recorded above and remains resolvable manually if this fails.
  let autoFinalized = false;
  if (
    (row as any)?.id &&
    suggestion.entityType === "product_order" &&
    suggestion.entityId &&
    suggestion.amountMatchStatus === "exact_match" &&
    suggestion.allocationStatus === "suggested" &&
    Number((row as any).allocated_amount ?? 0) <= 0
  ) {
    try {
      const { data: providerRow } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", context.provider_id)
        .maybeSingle();
      const { autoFinalizeTerminalWalkInProductOrder } = await import(
        "@/lib/payments/auto-finalize-terminal-product-order"
      );
      const result = await autoFinalizeTerminalWalkInProductOrder({
        supabase,
        terminalPaymentId: String((row as any).id),
        providerId: context.provider_id,
        productOrderId: suggestion.entityId,
        paidAmount,
        gatewayFee: feeAmount,
        reference,
        currency,
        allocatedByUserId: (providerRow as { user_id?: string | null } | null)?.user_id ?? null,
      });
      autoFinalized = result.finalized;
    } catch (autoErr) {
      console.error("[paystack-terminal] auto-finalize walk-in order failed:", autoErr);
    }
  }

  if ((row as any)?.provider_notification_status === "pending" && !autoFinalized) {
    const { data: provider } = await supabase
      .from("providers")
      .select("id, user_id, tenant_id, business_name")
      .eq("id", context.provider_id)
      .maybeSingle();
    const providerUserId = (provider as { user_id?: string | null } | null)?.user_id ?? null;
    if (providerUserId) {
      const notificationTitle = "Paystack Terminal payment received";
      const notificationMessage = `${currency} ${paidAmount.toFixed(2)} received${customerReference ? ` · Note ${customerReference}` : ""}. Review and allocate it in Paystack Terminal.`;
      const notificationData = {
        type: "paystack_terminal_payment",
        terminal_payment_id: row.id,
        paystack_reference: reference,
        provider_id: context.provider_id,
        amount: paidAmount,
        currency,
        allocation_status: suggestion.allocationStatus,
        amount_match_status: suggestion.amountMatchStatus,
        customer_reference: customerReference,
      };
      const result = await sendToUser(
        providerUserId,
        { title: notificationTitle, message: notificationMessage, data: notificationData },
        ["push"],
        { appType: "provider", tenantId: (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null },
      );
      // Also drop an in-app notification so the bell, web dropdown and badge stay in sync
      // (the popup listeners use realtime; this is the durable record + deep link).
      try {
        await insertNotification({
          user_id: providerUserId,
          type: "payment_received",
          title: notificationTitle,
          message: notificationMessage,
          data: notificationData,
          action_url: `/provider/settings/sales/paystack-terminal?payment=${row.id}`,
        });
      } catch (notifyError) {
        console.warn("[paystack-terminal] in-app notification insert failed:", notifyError);
      }
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
  } else if (autoFinalized && (row as any)?.provider_notification_status === "pending") {
    // Auto-finalized sales are notified via notifyProductOrderPaidIfTransitioned;
    // clear the inbox notification flag so the "review and allocate" push never fires.
    await (supabase.from("provider_paystack_terminal_payments") as any)
      .update({ provider_notification_status: "not_required" })
      .eq("id", (row as any).id);
  }

  return { recorded: true, payment: row };
}
