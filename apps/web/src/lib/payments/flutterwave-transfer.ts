import { fromMinorUnits } from "@beautonomi/utils";
import { flutterwaveRequest } from "@/lib/payments/flutterwave-server";

/** Stable id we store in `recipient_code` when saving Flutterwave payout accounts (`fw:bank:account`). */
export function parseFlutterwavePayoutRecipientCode(
  recipientCode: string | null | undefined,
): { bankCode: string; accountNumber: string } | null {
  const trimmed = (recipientCode ?? "").trim();
  const match = /^fw:([^:]+):(.+)$/.exec(trimmed);
  if (!match) return null;
  const bankCode = match[1].trim();
  const accountNumber = match[2].trim();
  if (!bankCode || !accountNumber) return null;
  return { bankCode, accountNumber };
}

export async function createFlutterwaveTransfer(params: {
  amountMajor: number;
  currency: string;
  accountBank: string;
  accountNumber: string;
  reference: string;
  narration?: string;
  beneficiaryName?: string;
  meta?: Record<string, unknown>;
  tenantId?: string | null;
}): Promise<{ id: string; status: string; raw: unknown }> {
  const body: Record<string, unknown> = {
    account_bank: params.accountBank,
    account_number: params.accountNumber,
    amount: params.amountMajor,
    currency: params.currency.toUpperCase(),
    reference: params.reference,
    narration: params.narration ?? "Beautonomi provider payout",
  };
  if (params.beneficiaryName) body.beneficiary_name = params.beneficiaryName;
  if (params.meta) body.meta = params.meta;

  const res = await flutterwaveRequest<{ id?: number | string; status?: string }>(
    "POST",
    "/transfers",
    body,
    params.tenantId,
  );
  return {
    id: String(res.data?.id ?? params.reference),
    status: String(res.data?.status ?? "NEW"),
    raw: res.data,
  };
}

export function payoutAmountMajorFromMinor(minor: number, currency: string): number {
  return fromMinorUnits(minor, currency);
}
