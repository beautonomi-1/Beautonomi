"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Landmark, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FetchError, deleteFetcherGetCacheEntriesMatching, fetcher } from "@/lib/http/fetcher";
import AccountPageFrame from "../components/account-page-frame";

const MAX_BANK_ACCOUNTS = 3;

type BankAccount = {
  id: string;
  bank_name?: string | null;
  account_name?: string | null;
  account_number_last4?: string | null;
  is_primary?: boolean;
  verified?: boolean;
};

type Bank = { code: string; name: string };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof FetchError && error.message ? error.message : fallback;
}

export default function BankAccountsPageClient() {
  const { t } = useTranslation();
  const ba = useCallback((key: string, opts?: Record<string, string>) => t(`customer.bankAccounts.${key}`, opts ?? {}) as string, [t]);
  const sf = useCallback((key: string) => t(`web.accountSettings.safety.${key}`) as string, [t]);

  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verificationAvailable, setVerificationAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<BankAccount | null>(null);

  const bank = useMemo(() => banks.find((b) => b.code === bankCode) ?? null, [banks, bankCode]);
  const banksRequested = useRef(false);
  const cleanNumber = accountNumber.replace(/\s/g, "");
  const atLimit = (accounts?.length ?? 0) >= MAX_BANK_ACCOUNTS;

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const body = await fetcher.get<{ data: BankAccount[] | null }>("/api/me/bank-accounts", { staleTimeMs: 0 });
      const list = Array.isArray(body?.data) ? body.data : [];
      setAccounts(list);
      setShowForm(list.length === 0);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showForm || banksRequested.current) return;
    banksRequested.current = true;
    fetcher
      .get<{ data: Bank[] | null }>("/api/public/banks", { staleTimeMs: 300_000 })
      .then((body) => setBanks(Array.isArray(body?.data) ? body.data : []))
      .catch(() => toast.error(ba("failedLoadBanks")));
  }, [showForm, ba]);

  const resetForm = () => {
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
    setVerifiedName(null);
  };

  const afterChange = async () => {
    deleteFetcherGetCacheEntriesMatching("/api/me/bank-accounts");
    await load();
  };

  const verify = async () => {
    if (!bank || cleanNumber.length < 8 || cleanNumber.length > 20) {
      toast.error(ba("fillAllFields"));
      return;
    }
    setBusy(true);
    try {
      const body = await fetcher.post<{
        data: { account_name: string | null; verified: boolean; verification_available?: boolean };
      }>("/api/me/bank-accounts/verify", { account_number: cleanNumber, bank_code: bank.code });
      if (body?.data?.verified && body.data.account_name) {
        setVerifiedName(body.data.account_name);
        setAccountName(body.data.account_name);
      } else if (body?.data?.verification_available === false) {
        setVerificationAvailable(false);
      }
    } catch (error) {
      toast.error(errorMessage(error, t("common.error") as string));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const name = (verifiedName ?? accountName).trim();
    if (!bank || cleanNumber.length < 8 || cleanNumber.length > 20 || !name) {
      toast.error(ba("fillAllFields"));
      return;
    }
    setBusy(true);
    try {
      await fetcher.post("/api/me/bank-accounts", {
        account_number: cleanNumber,
        bank_code: bank.code,
        bank_name: bank.name,
        account_name: name,
      });
      toast.success(sf("bankAccountSaved"));
      resetForm();
      await afterChange();
    } catch (error) {
      toast.error(errorMessage(error, t("common.error") as string));
    } finally {
      setBusy(false);
    }
  };

  const makePrimary = async (account: BankAccount) => {
    setBusy(true);
    try {
      await fetcher.patch(`/api/me/bank-accounts/${encodeURIComponent(account.id)}`, { is_primary: true });
      toast.success(sf("bankAccountPrimary"));
      await afterChange();
    } catch (error) {
      toast.error(errorMessage(error, t("common.error") as string));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    const target = removing;
    setRemoving(null);
    if (!target) return;
    setBusy(true);
    try {
      await fetcher.delete(`/api/me/bank-accounts/${encodeURIComponent(target.id)}`);
      toast.success(sf("bankAccountRemoved"));
      await afterChange();
    } catch (error) {
      toast.error(errorMessage(error, t("common.error") as string));
    } finally {
      setBusy(false);
    }
  };

  const saveDisabled = busy || (verificationAvailable && !verifiedName);

  return (
    <AccountPageFrame
      title={ba("screenTitle")}
      subtitle={ba("intro")}
      backHref="/account-settings/wallet"
      parents={[{ label: t("web.accountSettings.wallet.title") as string, href: "/account-settings/wallet" }]}
    >
      {loadError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <p>{t("common.error")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void load()}>
            {sf("retry")}
          </Button>
        </div>
      ) : accounts == null ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-[#FF0077]" />
        </div>
      ) : (
        <>
          {accounts.length === 0 ? (
            <p className="text-sm text-gray-600">{ba("empty")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
              {accounts.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Landmark className="h-5 w-5 shrink-0 text-[#FF0077]" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">
                        {a.bank_name ?? ba("bankLabel")} •••• {a.account_number_last4 ?? "****"}
                      </p>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        {a.account_name ? <span className="truncate">{a.account_name}</span> : null}
                        {a.is_primary ? (
                          <span className="rounded-full bg-pink-50 px-2 py-0.5 font-medium text-[#FF0077]">{ba("primary")}</span>
                        ) : null}
                        {a.verified ? (
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                            {ba("verifiedBadge")}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {!a.is_primary ? (
                      <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void makePrimary(a)}>
                        {ba("makePrimary")}
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      className="min-h-11 text-red-600 hover:text-red-700"
                      disabled={busy}
                      onClick={() => setRemoving(a)}
                    >
                      {ba("remove")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {atLimit ? (
            <p className="text-sm text-gray-500">{sf("bankAccountsMax")}</p>
          ) : showForm ? (
            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 sm:p-6">
              <div className="space-y-1.5">
                <Label htmlFor="bank-select">{ba("selectBank")}</Label>
                <select
                  id="bank-select"
                  value={bankCode}
                  onChange={(e) => {
                    setBankCode(e.target.value);
                    setVerifiedName(null);
                  }}
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                >
                  <option value="">{ba("selectBank")}</option>
                  {banks.map((b) => (
                    <option key={`${b.code}-${b.name}`} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-account-number">{ba("accountNumberLabel")}</Label>
                <Input
                  id="bank-account-number"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={24}
                  value={accountNumber}
                  onChange={(e) => {
                    setAccountNumber(e.target.value);
                    setVerifiedName(null);
                  }}
                  className="min-h-11 text-base sm:text-sm"
                />
              </div>

              {verifiedName ? (
                <p className="text-sm text-gray-700">{ba("verifiedAs", { name: verifiedName })}</p>
              ) : verificationAvailable ? (
                <Button variant="outline" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => void verify()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : ba("verify")}
                </Button>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-sm text-gray-600">{ba("verificationUnavailable")}</p>
                  <Label htmlFor="bank-account-name">{ba("accountNameLabel")}</Label>
                  <Input
                    id="bank-account-name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="min-h-11 text-base sm:text-sm"
                  />
                </div>
              )}

              <Button
                className="min-h-11 w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565]"
                disabled={saveDisabled}
                onClick={() => void save()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : ba("save")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setShowForm(true)}>
              <Plus className="me-2 h-4 w-4" aria-hidden />
              {ba("addAnother")}
            </Button>
          )}
        </>
      )}

      <AlertDialog open={removing != null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ba("removeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{ba("removeConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11 bg-red-600 hover:bg-red-700" onClick={() => void confirmRemove()}>
              {ba("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AccountPageFrame>
  );
}
