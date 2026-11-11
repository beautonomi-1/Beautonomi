"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformCurrency } from "@/hooks/usePlatformCurrency";
import { deleteFetcherGetCacheEntriesMatching, fetcher } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import {
  bankRefundFee,
  parseRefundAmount,
  validateBankRefundAmount,
  type BankRefundAmountError,
  type BankRefundClientSettings,
} from "@/lib/wallet-bank-refunds/client-validation";
import AccountPageFrame from "../../components/account-page-frame";

type RefundRequest = {
  id: string;
  request_number: string;
  status: "pending" | "approved" | "paid" | "rejected" | "cancelled" | string;
  amount: number;
  fee_amount?: number;
  net_amount: number;
  currency?: string;
  bank_name?: string | null;
  account_number_last4?: string | null;
  created_at: string;
};

type RefundsPayload = {
  settings: BankRefundClientSettings;
  eligible_amount: number;
  open_request: RefundRequest | null;
  requests: RefundRequest[];
};

type BankAccount = { id: string; bank_name?: string | null; account_number_last4?: string | null; is_primary?: boolean };

function RefundHistory({
  history,
  format,
  label,
}: {
  history: RefundRequest[];
  format: (amount: number) => string;
  label: (key: string) => string;
}) {
  if (history.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{label("bankRefundHistory")}</h2>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {history.map((r) => (
          <li key={r.id} className="grid grid-cols-2 gap-x-4 gap-y-1 p-4 text-sm md:grid-cols-5 md:items-center">
            <span className="col-span-2 font-medium text-gray-900 md:col-span-1">{r.request_number}</span>
            <span className="text-gray-500 md:hidden">{label("bankRefundDate")}</span>
            <span className="text-end md:text-start">{new Date(r.created_at).toLocaleDateString()}</span>
            <span className="text-gray-500 md:hidden">{label("bankRefundAmount")}</span>
            <span className="text-end md:text-start">{format(Number(r.amount))}</span>
            <span className="text-gray-500 md:hidden">{label("bankRefundReceive")}</span>
            <span className="text-end md:text-start">{format(Number(r.net_amount))}</span>
            <span className="text-gray-500 md:hidden">{label("bankRefundStatus")}</span>
            <span className="text-end font-medium capitalize md:text-start">{r.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BankRefundPageClient() {
  const { t } = useTranslation();
  const { format } = usePlatformCurrency();
  const wb = useCallback(
    (key: string, opts?: Record<string, string | number>) => t(`customer.walletBankRefund.${key}`, opts ?? {}) as string,
    [t],
  );
  const sf = useCallback(
    (key: string, opts?: Record<string, string | number>) => t(`web.accountSettings.safety.${key}`, opts ?? {}) as string,
    [t],
  );

  const [data, setData] = useState<RefundsPayload | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [balance, setBalance] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState<"retention" | "form" | "submitted">("retention");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amountRaw, setAmountRaw] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => `web-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [refunds, bankAccounts, wallet] = await Promise.all([
        fetcher.get<{ data: RefundsPayload }>("/api/me/wallet/bank-refunds?limit=20", { staleTimeMs: 0 }),
        fetcher.get<{ data: BankAccount[] | null }>("/api/me/bank-accounts", { staleTimeMs: 0 }),
        fetcher.get<{ data: { wallet?: { balance?: number } } }>("/api/me/wallet", { staleTimeMs: 0 }),
      ]);
      setData(refunds.data);
      const list = Array.isArray(bankAccounts?.data) ? bankAccounts.data : [];
      setAccounts(list);
      setAccountId((prev) =>
        prev && list.some((a) => a.id === prev) ? prev : list.find((a) => a.is_primary)?.id ?? list[0]?.id ?? null,
      );
      setBalance(Number(wallet?.data?.wallet?.balance ?? 0));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const settings = data?.settings ?? {};
  const eligible = Number(data?.eligible_amount ?? 0);
  const amount = parseRefundAmount(amountRaw);
  const amountError: BankRefundAmountError | null = amountRaw.trim() ? validateBankRefundAmount(amount, settings, eligible) : null;
  const fee = Number.isFinite(amount) && amount > 0 ? bankRefundFee(amount, settings) : null;

  const amountErrorText = (err: BankRefundAmountError): string => {
    switch (err) {
      case "below_min":
        return sf("bankRefundMin", { amount: format(Number(settings.min_amount ?? 0)) });
      case "above_max":
        return sf("bankRefundMax", { amount: format(Number(settings.max_amount_per_request ?? 0)) });
      case "above_eligible":
        return wb("eligibleLabel", { amount: format(eligible) });
      default:
        return wb("invalidAmount");
    }
  };

  const invalidate = () => {
    deleteFetcherGetCacheEntriesMatching("/api/me/wallet");
  };

  const submit = async () => {
    const err = validateBankRefundAmount(amount, settings, eligible);
    if (err || !accountId) {
      toast.error(err ? amountErrorText(err) : wb("invalidAmount"));
      return;
    }
    setBusy(true);
    try {
      await fetcher.post("/api/me/wallet/bank-refunds", {
        customer_bank_account_id: accountId,
        amount,
        ...(note.trim() ? { customer_note: note.trim() } : {}),
        idempotency_key: idempotencyKey,
      });
      invalidate();
      setStep("submitted");
    } catch (error) {
      toast.error(formatApiErrorMessage(error, wb("failed")));
    } finally {
      setBusy(false);
    }
  };

  const cancelOpen = async () => {
    const open = data?.open_request;
    if (!open) return;
    setBusy(true);
    try {
      await fetcher.post(`/api/me/wallet/bank-refunds/${encodeURIComponent(open.id)}/cancel`, {});
      invalidate();
      toast.success(sf("bankRefundCancelled"));
      await load();
    } catch (error) {
      toast.error(formatApiErrorMessage(error, wb("failed")));
    } finally {
      setBusy(false);
    }
  };

  const parents = [{ label: t("web.accountSettings.wallet.title") as string, href: "/account-settings/wallet" }];
  const open = data?.open_request ?? null;
  const history = data?.requests ?? [];

  return (
    <AccountPageFrame title={wb("screenTitle")} backHref="/account-settings/wallet" parents={parents}>
      {loadError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <p>{t("common.error")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void load()}>
            {sf("retry")}
          </Button>
        </div>
      ) : !data ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-[#FF0077]" />
        </div>
      ) : !settings.enabled && !open ? (
        <div className="space-y-6">
          <p className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-700">{wb("notEnabled")}</p>
          <RefundHistory history={history} format={format} label={(key) => sf(key)} />
        </div>
      ) : step === "submitted" ? (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-gray-900">{wb("submittedTitle")}</h2>
          <p className="mt-1 text-sm text-gray-700">{wb("submittedBody", { days: settings.sla_business_days ?? 5 })}</p>
          <Button asChild className="mt-4 min-h-11 w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565]">
            <Link href="/account-settings/wallet">{t("web.accountSettings.wallet.title")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {open ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">{wb("openRequest", { number: open.request_number })}</p>
              <p className="mt-1 text-sm text-gray-600">{format(Number(open.net_amount))}</p>
              {open.status === "pending" ? (
                <Button variant="outline" className="mt-3 min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => void cancelOpen()}>
                  {wb("cancelRequest")}
                </Button>
              ) : null}
            </div>
          ) : step === "retention" ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-6">
              <h2 className="text-lg font-bold text-gray-900">{wb("retentionTitle")}</h2>
              <p className="mt-2 text-sm text-gray-600">{wb("retentionBody", { amount: format(balance) })}</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button asChild className="min-h-11 bg-[#FF0077] hover:bg-[#D60565]">
                  <Link href="/account-settings/wallet">{wb("keepInWallet")}</Link>
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={() => setStep("form")}>
                  {wb("continueToBank")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 sm:p-6">
              <div>
                <p className="font-semibold text-gray-900">{wb("eligibleLabel", { amount: format(eligible) })}</p>
                <p className="mt-1 text-sm text-gray-600">{wb("eligibleHint")}</p>
              </div>
              {eligible <= 0 ? (
                <p className="text-sm text-gray-600">{wb("noneEligible")}</p>
              ) : accounts.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">{sf("bankRefundNoAccounts")}</p>
                  <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
                    <Link href="/account-settings/bank-accounts">{wb("addBank")}</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="refund-amount">{wb("amountLabel")}</Label>
                    <Input
                      id="refund-amount"
                      inputMode="decimal"
                      value={amountRaw}
                      onChange={(e) => setAmountRaw(e.target.value)}
                      placeholder={format(eligible)}
                      aria-invalid={amountError != null}
                      className="min-h-11 text-base sm:text-sm"
                    />
                    <ul className="text-xs text-gray-500">
                      {settings.min_amount != null ? <li>{sf("bankRefundMin", { amount: format(settings.min_amount) })}</li> : null}
                      {settings.max_amount_per_request != null ? (
                        <li>{sf("bankRefundMax", { amount: format(settings.max_amount_per_request) })}</li>
                      ) : null}
                    </ul>
                    {amountError ? <p className="text-sm text-red-600">{amountErrorText(amountError)}</p> : null}
                    {fee && !amountError ? (
                      <p className="text-sm text-gray-600">
                        {wb("feeLine", { fee: format(fee.fee), net: format(Math.max(0, fee.net)) })}
                      </p>
                    ) : null}
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-sm font-medium text-gray-700">{t("customer.bankAccounts.screenTitle")}</legend>
                    {accounts.map((a) => (
                      <label
                        key={a.id}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm ${
                          accountId === a.id ? "border-[#FF0077] bg-pink-50" : "border-gray-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name="refund-account"
                          className="h-4 w-4 accent-[#FF0077]"
                          checked={accountId === a.id}
                          onChange={() => setAccountId(a.id)}
                        />
                        <span className="min-w-0 truncate">
                          {a.bank_name ?? t("customer.bankAccounts.bankLabel")} •••• {a.account_number_last4 ?? "****"}
                        </span>
                      </label>
                    ))}
                    <Link href="/account-settings/bank-accounts" className="inline-flex min-h-11 items-center text-sm text-[#FF0077] underline">
                      {sf("bankAccountsManage")}
                    </Link>
                  </fieldset>

                  <div className="space-y-1.5">
                    <Label htmlFor="refund-note">{sf("bankRefundNote")}</Label>
                    <Textarea
                      id="refund-note"
                      rows={3}
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="text-base sm:text-sm"
                    />
                  </div>

                  {settings.sla_business_days ? (
                    <p className="text-xs text-gray-500">{sf("bankRefundSla", { days: settings.sla_business_days })}</p>
                  ) : null}

                  <Button
                    className="min-h-11 w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565]"
                    disabled={busy || !accountId || !amountRaw.trim() || amountError != null}
                    onClick={() => void submit()}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : wb("submit")}
                  </Button>
                </>
              )}
            </div>
          )}

          <RefundHistory history={history} format={format} label={(key) => sf(key)} />
        </>
      )}
    </AccountPageFrame>
  );
}
