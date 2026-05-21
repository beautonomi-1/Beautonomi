import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";

type BankOption = { code: string; name: string; type?: string };

const SA_FALLBACK_BANKS: BankOption[] = [
  { code: "632005", name: "Standard Bank", type: "basa" },
  { code: "632001", name: "First National Bank (FNB)", type: "basa" },
  { code: "632002", name: "Nedbank", type: "basa" },
  { code: "632003", name: "Absa Bank", type: "basa" },
  { code: "632004", name: "Capitec Bank", type: "basa" },
  { code: "632006", name: "Investec Bank", type: "basa" },
  { code: "632007", name: "African Bank", type: "basa" },
  { code: "632008", name: "Bidvest Bank", type: "basa" },
  { code: "632009", name: "Discovery Bank", type: "basa" },
  { code: "632010", name: "TymeBank", type: "basa" },
];

const ACCOUNT_TYPES = [
  { value: "cheque", label: "Cheque / Current" },
  { value: "savings", label: "Savings" },
  { value: "business", label: "Business" },
] as const;

export function ProviderBankAccountModal({
  open,
  onClose,
  providerId,
}: {
  open: boolean;
  onClose: () => void;
  providerId: string;
}) {
  const qc = useQueryClient();

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("cheque");
  const [currency] = useState("ZAR");

  const banksQ = useQuery({
    queryKey: ["admin", "banks"],
    queryFn: async () => {
      try {
        const res = await adminApi.getRawJson<{ data: BankOption[] | { banks: BankOption[] } }>(
          "/api/public/banks?country=ZA"
        );
        const banks = Array.isArray(res?.data) ? res.data : res?.data?.banks;
        return Array.isArray(banks) && banks.length > 0 ? banks : SA_FALLBACK_BANKS;
      } catch {
        return SA_FALLBACK_BANKS;
      }
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const banks = banksQ.data ?? SA_FALLBACK_BANKS;

  const addMutation = useMutation({
    mutationFn: (payload: {
      bank_code: string;
      account_number: string;
      account_name: string;
      account_type: string;
      recipient_type?: string;
      currency: string;
    }) =>
      adminApi.postJson(
        `/api/admin/providers/${encodeURIComponent(providerId)}/payout-accounts`,
        payload
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providers.payoutAccounts(providerId) });
      adminToast.success("Bank account added successfully");
      resetAndClose();
    },
    onError: (e: Error) => adminToast.error(`Failed to add bank account: ${e.message}`),
  });

  function resetAndClose() {
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
    setAccountType("cheque");
    onClose();
  }

  const canSubmit =
    bankCode.trim().length > 0 &&
    accountNumber.trim().length >= 8 &&
    accountNumber.trim().length <= 20 &&
    accountName.trim().length > 0;

  return (
    <AdminModal
      open={open}
      onClose={resetAndClose}
      title="Add bank account"
      description="Create a Paystack payout recipient for this provider."
      footer={
        <>
          <button
            type="button"
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            onClick={resetAndClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            disabled={!canSubmit || addMutation.isPending}
            onClick={() => {
              const selectedBank = banks.find((bank) => bank.code === bankCode);
              addMutation.mutate({
                bank_code: bankCode,
                account_number: accountNumber.trim(),
                account_name: accountName.trim(),
                account_type: accountType,
                recipient_type: selectedBank?.type ?? "basa",
                currency,
              });
            }}
          >
            {addMutation.isPending ? "Adding…" : "Add account"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="text-gray-600">Bank</span>
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
          >
            <option value="">Select a bank…</option>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Account number</span>
          <input
            type="text"
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. 1234567890"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
            maxLength={20}
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Account holder name</span>
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Name as on the bank account"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Account type</span>
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Currency</span>
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50"
            value={currency}
            readOnly
          />
        </label>

        {addMutation.error && (
          <p className="text-sm text-red-700">{addMutation.error.message}</p>
        )}
      </div>
    </AdminModal>
  );
}
