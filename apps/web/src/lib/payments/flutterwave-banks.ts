import { flutterwaveRequest } from "@/lib/payments/flutterwave-server";

export type FlutterwaveBankRow = {
  id: number | string;
  code: string;
  name: string;
};

export async function listFlutterwaveBanks(
  isoCountry: string,
  tenantId?: string | null,
): Promise<FlutterwaveBankRow[]> {
  const country = isoCountry.trim().toUpperCase();
  const json = await flutterwaveRequest<Array<{ id?: number; code?: string; name?: string }>>(
    "GET",
    `/banks/${encodeURIComponent(country)}`,
    null,
    tenantId,
  );
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .map((b) => ({
      id: b.id ?? b.code ?? "",
      code: String(b.code ?? b.id ?? "").trim(),
      name: String(b.name ?? "").trim(),
    }))
    .filter((b) => b.code && b.name);
}

export async function resolveFlutterwaveBankAccount(params: {
  accountNumber: string;
  accountBank: string;
  tenantId?: string | null;
}): Promise<{ account_name: string }> {
  const json = await flutterwaveRequest<{ account_name?: string }>(
    "POST",
    "/accounts/resolve",
    {
      account_number: params.accountNumber,
      account_bank: params.accountBank,
    },
    params.tenantId,
  );
  const name = String(json.data?.account_name ?? "").trim();
  if (!name) throw new Error("Could not resolve account name");
  return { account_name: name };
}
