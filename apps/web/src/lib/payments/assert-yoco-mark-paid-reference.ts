/**
 * F2-59: manual mark-paid labelled `yoco` must match a successful
 * `provider_yoco_payments` row for this provider — a typed-in fake
 * reference must not settle the charge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromMinorUnits } from "@beautonomi/utils";

/** `provider_yoco_payments.amount` is BIGINT cents (F-05). Never treat as major units. */
export function yocoStoredAmountToMajor(storedAmount: number, currency: string): number {
  return fromMinorUnits(Number(storedAmount) || 0, currency);
}

export type YocoMarkPaidOk = {
  ok: true;
  yocoPaymentId: string;
  amountMajor: number;
};

export type YocoMarkPaidFail = {
  ok: false;
  code:
    | "YOCO_PAYMENT_NOT_FOUND"
    | "YOCO_PAYMENT_NOT_SUCCESSFUL"
    | "YOCO_PAYMENT_ENTITY_MISMATCH"
    | "YOCO_PAYMENT_AMOUNT_MISMATCH";
  message: string;
};

const SUCCESS_STATUSES = new Set(["successful", "success", "succeeded", "completed", "paid"]);

function entityMatches(
  row: {
    entity_type?: string | null;
    entity_id?: string | null;
    appointment_id?: string | null;
    sale_id?: string | null;
  },
  expected: {
    expectedEntityType?: string | null;
    expectedEntityId?: string | null;
    expectedAppointmentId?: string | null;
  },
): boolean {
  const rowEntityId = typeof row.entity_id === "string" ? row.entity_id.trim() : "";
  const rowEntityType = typeof row.entity_type === "string" ? row.entity_type.trim().toLowerCase() : "";
  const expectedId = expected.expectedEntityId?.trim() ?? "";
  const expectedType = expected.expectedEntityType?.trim().toLowerCase() ?? "";

  if (rowEntityId && expectedId && rowEntityId !== expectedId) return false;
  if (rowEntityType && expectedType && rowEntityType !== expectedType) return false;

  const appointmentId = typeof row.appointment_id === "string" ? row.appointment_id.trim() : "";
  const expectedAppointment = expected.expectedAppointmentId?.trim() ?? "";
  if (appointmentId && expectedAppointment && appointmentId !== expectedAppointment) return false;

  const saleId = typeof row.sale_id === "string" ? row.sale_id.trim() : "";
  if (expectedType === "sale" && saleId && expectedId && saleId !== expectedId) return false;

  return true;
}

export async function assertYocoMarkPaidReference(
  supabase: SupabaseClient,
  input: {
    providerId: string;
    reference: string;
    expectedEntityType?: string | null;
    expectedEntityId?: string | null;
    expectedAppointmentId?: string | null;
    expectedAmountMajor?: number | null;
    currency?: string | null;
  },
): Promise<YocoMarkPaidOk | YocoMarkPaidFail> {
  const reference = input.reference.trim();
  if (!reference) {
    return {
      ok: false,
      code: "YOCO_PAYMENT_NOT_FOUND",
      message: "Yoco terminal payments require the terminal payment reference.",
    };
  }

  const { data, error } = await supabase
    .from("provider_yoco_payments")
    .select("id, yoco_payment_id, status, amount, currency, entity_type, entity_id, appointment_id, sale_id")
    .eq("provider_id", input.providerId)
    .eq("yoco_payment_id", reference)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: "YOCO_PAYMENT_NOT_FOUND",
      message: "Could not verify the Yoco payment reference.",
    };
  }
  if (!data) {
    return {
      ok: false,
      code: "YOCO_PAYMENT_NOT_FOUND",
      message: "No Yoco payment matches this reference for your business.",
    };
  }

  const status = String((data as { status?: string | null }).status ?? "").toLowerCase();
  if (!SUCCESS_STATUSES.has(status)) {
    return {
      ok: false,
      code: "YOCO_PAYMENT_NOT_SUCCESSFUL",
      message: "That Yoco payment has not succeeded yet.",
    };
  }

  if (!entityMatches(data as Parameters<typeof entityMatches>[0], input)) {
    return {
      ok: false,
      code: "YOCO_PAYMENT_ENTITY_MISMATCH",
      message: "That Yoco payment is linked to a different booking, sale, or charge.",
    };
  }

  const currency = String(
    (data as { currency?: string | null }).currency ?? input.currency ?? "ZAR",
  );
  const amountMajor = yocoStoredAmountToMajor(
    Number((data as { amount?: number | null }).amount ?? 0),
    currency,
  );
  const expected = input.expectedAmountMajor;
  if (typeof expected === "number" && Number.isFinite(expected) && expected > 0.009) {
    if (amountMajor + 0.01 < expected) {
      return {
        ok: false,
        code: "YOCO_PAYMENT_AMOUNT_MISMATCH",
        message: "That Yoco payment is less than the amount still due.",
      };
    }
  }

  return { ok: true, yocoPaymentId: reference, amountMajor };
}
