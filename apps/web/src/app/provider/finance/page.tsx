"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FinanceBookingPaymentsSection } from "./FinanceBookingPaymentsSection";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, Calendar, Download, ArrowUpRight, FileText, Building2, CheckCircle2, Loader2, Plus } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError, DEFAULT_FETCH_TIMEOUT_MS } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { Lock } from "lucide-react";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { formatStatusLabel } from "@/lib/locale/status-label";
import { ActiveLocationChip } from "@/components/provider/ActiveLocationChip";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { PAYOUT_COUNTRIES, getCurrencyForCountry } from "@/lib/payments/payout-countries";
import { ledgerRowDisplaySign } from "@/lib/provider/provider-ledger-transaction-view";

function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface EarningsData {
  total_earnings: number;
  recognized_revenue_total?: number;
  recognized_revenue_last_period?: number;
  period_provider_earnings?: number;
  pending_payouts: number;
  available_balance: number;
  payout_balance_unavailable?: boolean;
  payout_hold_days?: number;
  minimum_payout_amount?: number;
  this_month: number;
  last_month: number;
  growth_percentage: number;
  bookings_earnings_total?: number;
  bookings_earnings_this_period?: number;
  product_sales_earnings_total?: number;
  product_sales_earnings_this_period?: number;
  platform_fees_deducted?: number;
  platform_fees_deducted_this_period?: number;
  gift_card_sales_this_period?: number;
  membership_sales_this_period?: number;
  travel_fees_total?: number;
  travel_fees_this_period?: number;
  refunds_total?: number;
  refunds_this_period?: number;
  walk_in_additional_charges_total?: number;
  walk_in_additional_charges_this_period?: number;
  tips_total?: number;
  tips_this_period?: number;
  cancellation_fees_total?: number;
  cancellation_fees_this_period?: number;
  additional_charges_total?: number;
  additional_charges_this_period?: number;
  membership_discounts_this_period?: number;
  loyalty_discounts_this_period?: number;
  promo_discounts_this_period?: number;
  membership_discounts_total?: number;
  loyalty_discounts_total?: number;
  promo_discounts_total?: number;
  raw_payout_balance?: number;
  has_negative_payout_balance?: boolean;
  balance_owed_to_platform?: number;
  ledger_currencies?: string[];
  ledger_currency_note?: string | null;
  payout_reconciliation?: {
    recognized_payoutable_earnings: number;
    on_hold: number;
    excluded_provider_collected: number;
    already_paid_out: number;
    pending_payouts: number;
    available_balance: number;
  };
}

interface Transaction {
  id: string;
  booking_id?: string | null;
  transaction_type?: string;
  type: "booking" | "payout" | "refund" | "platform_fee";
  amount: number;
  net?: number;
  fees?: number;
  commission?: number;
  currency: string;
  description: string;
  date: string;
  status: "completed" | "pending" | "failed";
}

interface Payout {
  id: string;
  provider_id: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  bank_account_id?: string;
  notes?: string;
  requested_at: string;
  processed_at?: string;
  failure_reason?: string;
  rejected_at?: string | null;
}

function formatPayoutDisplayStatus(payout: Pick<Payout, "status" | "rejected_at">, t: (key: string) => string): string {
  if (payout.status === "failed" && payout.rejected_at) return t("web.provider.finance.rejected");
  return formatStatusLabel(payout.status);
}

interface PayoutAccount {
  id: string;
  account_name: string;
  account_number_last4: string;
  bank_name: string | null;
  active: boolean;
  is_primary?: boolean;
}

interface Bank {
  code: string;
  name: string;
  country: string;
  currency: string;
  type: string;
}

interface NextPayoutDateData {
  payout_schedule: string;
  minimum_payout_amount: number;
  payout_hold_days: number;
  next_payout_date: string | null;
  next_payout_description: string;
}

export default function ProviderFinance() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { selectedLocationId, provider: portalProvider } = useProviderPortal();
  const { hasPermission } = usePermissions();
  const { currencyCode, format: fmt } = useReportCurrency();
  const canRequestPayout = hasPermission("edit_settings");
  const payoutsSectionRef = useRef<HTMLDivElement | null>(null);
  const deepLinkHandledRef = useRef(false);

  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "year" | "all">("month");
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [payoutAccounts, setPayoutAccounts] = useState<PayoutAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [isRequestingPayout, setIsRequestingPayout] = useState(false);
  const [showInlineBankForm, setShowInlineBankForm] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(false);
  const [isVerifyingBank, setIsVerifyingBank] = useState(false);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [verifiedAccountName, setVerifiedAccountName] = useState<string | null>(null);
  const [showVerifyAccountButton, setShowVerifyAccountButton] = useState(true);
  const [bankForm, setBankForm] = useState({
    country: "ZA",
    account_number: "",
    bank_code: "",
    account_name: "",
    email: "",
  });
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [nextPayoutDate, setNextPayoutDate] = useState<NextPayoutDateData | null>(null);

  useEffect(() => {
    loadFinanceData();
    loadPayouts();
    loadPayoutAccounts();
    void (async () => {
      try {
        const res = await fetcher.get<{ data: NextPayoutDateData }>("/api/provider/payouts/next-date");
        setNextPayoutDate(res.data ?? null);
      } catch {
        setNextPayoutDate(null);
      }
    })();
    void (async () => {
      try {
        const res = await fetcher.get<{
          data: { show_verify_account_button?: boolean };
        }>("/api/provider/payout-accounts/options");
        setShowVerifyAccountButton(res.data?.show_verify_account_button !== false);
      } catch {
        setShowVerifyAccountButton(true);
      }
    })();
  }, [dateRange, selectedLocationId]);

  useEffect(() => {
    if (showPayoutDialog && showInlineBankForm) {
      loadBanks(bankForm.country);
    }
  }, [showPayoutDialog, showInlineBankForm, bankForm.country]);

  // Honor More hub / mobile deep-links: ?tab=payouts scrolls to payout history
  // (and focuses the request flow once data is ready).
  useEffect(() => {
    const tab = (searchParams.get("tab") || "").toLowerCase();
    if (tab !== "payouts" || isLoading || deepLinkHandledRef.current) return;
    deepLinkHandledRef.current = true;
    const el = payoutsSectionRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchParams, isLoading]);

  const loadFinanceData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        range: dateRange,
        transaction_feed: "all",
        tx_limit: "200",
      });
      if (selectedLocationId) params.set("location_id", selectedLocationId);
      const url = `/api/provider/finance?${params.toString()}`;

      const response = await fetcher.get<{
        data: { earnings: EarningsData; transactions: Transaction[] } | null;
      }>(url, { staleTimeMs: 0, timeoutMs: 120_000 });
      const payload = response.data;
      if (!payload?.earnings) {
        throw new Error(t("web.provider.finance.invalidResponse"));
      }
      setEarnings(payload.earnings);
      setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.provider.common.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.provider.finance.loadFailed");
      setError(errorMessage);
      console.error("Error loading finance data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPayouts = async () => {
    try {
      const response = await fetcher.get<{ data: Payout[] }>("/api/provider/payouts");
      setPayouts(response.data || []);
    } catch (err) {
      console.warn("Failed to load payouts:", err);
    }
  };

  const loadPayoutAccounts = async () => {
    try {
      const response = await fetcher.get<{ data: PayoutAccount[] }>(
        "/api/provider/payout-accounts",
        { timeoutMs: Math.max(DEFAULT_FETCH_TIMEOUT_MS, 45_000) },
      );
      const accts = response.data || [];
      setPayoutAccounts(accts);
      if (accts.length > 0 && !selectedBankId) {
        // Prefer the primary active account; fall back to the first active.
        const primary =
          accts.find((a) => a.is_primary && a.active) ||
          accts.find((a) => a.active) ||
          accts[0];
        setSelectedBankId(primary.id);
      }
    } catch (err) {
      console.warn("Failed to load payout accounts:", err);
    }
  };

  const loadBanks = async (country: string) => {
    try {
      setIsLoadingBanks(true);
      // §payout-account-fix 2026-05: use the authenticated provider banks
      // endpoint so we get the verification-enabled Paystack list (matches the
      // mobile flow) rather than the broader public list.
      const response = await fetcher.get<{ data: { banks: Bank[] } | Bank[] }>(
        `/api/provider/payout-accounts/banks?country=${encodeURIComponent(country)}`
      );
      const payload = response.data as any;
      const banksList: Bank[] = Array.isArray(payload)
        ? payload
        : payload?.banks ?? [];
      setBanks(banksList);
    } catch (err) {
      console.warn("Failed to load banks:", err);
      toast.error(t("web.provider.finance.loadBankListFailed"));
    } finally {
      setIsLoadingBanks(false);
    }
  };

  const resetBankForm = () => {
    setBankForm({
      country: "ZA",
      account_number: "",
      bank_code: "",
      account_name: "",
      email: "",
    });
    setVerifiedAccountName(null);
  };

  const handleVerifyBankAccount = async () => {
    if (!bankForm.account_number.trim() || !bankForm.bank_code) {
      toast.error(t("web.provider.finance.enterAccountAndBank"));
      return;
    }
    if (bankForm.account_number.trim().length < 8 || bankForm.account_number.trim().length > 20) {
      toast.error(t("web.provider.finance.accountDigits"));
      return;
    }
    try {
      setIsVerifyingBank(true);
      const response = await fetcher.post<{ data: { account_name: string } }>(
        "/api/provider/payout-accounts/verify",
        {
          account_number: bankForm.account_number.trim(),
          bank_code: bankForm.bank_code,
        }
      );
      const name = response.data?.account_name;
      if (name) {
        setBankForm((prev) => ({ ...prev, account_name: name }));
        setVerifiedAccountName(name);
        toast.success(t("web.provider.finance.bankVerified"));
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.finance.bankVerifyFailed"));
    } finally {
      setIsVerifyingBank(false);
    }
  };

  const handleAddPayoutAccountInline = async () => {
    if (!bankForm.account_number.trim() || !bankForm.bank_code || !bankForm.account_name.trim()) {
      toast.error(t("web.provider.finance.accountBankNameRequired"));
      return;
    }
    if (bankForm.account_number.trim().length < 8 || bankForm.account_number.trim().length > 20) {
      toast.error(t("web.provider.finance.accountDigits"));
      return;
    }
    try {
      setIsSavingBank(true);
      const selectedBank = banks.find((b) => b.code === bankForm.bank_code);
      const recipientType =
        selectedBank?.type || (bankForm.country === "ZA" ? "basa" : "nuban");
      const response = await fetcher.post<{ data: PayoutAccount }>("/api/provider/payout-accounts", {
        type: recipientType,
        country: bankForm.country,
        account_number: bankForm.account_number.trim(),
        bank_code: bankForm.bank_code,
        account_name: bankForm.account_name.trim(),
        currency: getCurrencyForCountry(bankForm.country),
        ...(verifiedAccountName ? { verified_account_name: verifiedAccountName } : {}),
        email: bankForm.email.trim() || undefined,
      });
      toast.success(t("web.provider.finance.bankAdded"));
      resetBankForm();
      setShowInlineBankForm(false);
      await loadPayoutAccounts();
      const newId = response.data?.id;
      if (newId) setSelectedBankId(newId);
    } catch (err) {
      const accountNumberLast4 = bankForm.account_number.trim().slice(-4);
      const accountNameNorm = bankForm.account_name.trim().toLowerCase();
      try {
        const refreshed = await fetcher.get<{ data: PayoutAccount[] }>(
          "/api/provider/payout-accounts",
        );
        const alreadySaved = (refreshed.data ?? []).some(
          (account) =>
            account.account_number_last4 === accountNumberLast4 &&
            account.account_name.trim().toLowerCase() === accountNameNorm,
        );
        if (alreadySaved) {
          toast.success(t("web.provider.settings.pages.payout-accounts.bankAccountIsAlreadySavedYour"));
          resetBankForm();
          setShowInlineBankForm(false);
          await loadPayoutAccounts();
          return;
        }
      } catch {
        // fall through
      }
      toast.error(err instanceof FetchError ? err.message : t("web.provider.finance.addBankFailed"));
    } finally {
      setIsSavingBank(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!payoutAmount || parseFloat(payoutAmount) <= 0) {
      toast.error(t("web.provider.finance.validPayoutAmount"));
      return;
    }

    const requested = roundMoney2(parseFloat(payoutAmount));
    const minimumPayout = earnings?.minimum_payout_amount ?? 100;
    if (requested < minimumPayout) {
      toast.error(t("web.provider.finance.minimumPayout", { amount: fmt(minimumPayout) }));
      return;
    }
    if (earnings?.payout_balance_unavailable) {
      toast.error(t("web.provider.finance.withdrawLoadingMoment"));
      return;
    }
    if (!earnings || requested > roundMoney2(earnings.available_balance)) {
      toast.error(t("web.provider.finance.insufficientBalance"));
      return;
    }

    try {
      setIsRequestingPayout(true);
      const primaryId = payoutAccounts[0]?.id;
      await fetcher.post("/api/provider/payouts", {
        amount: requested,
        notes: payoutNotes || null,
        bank_account_id: selectedBankId || primaryId || undefined,
      });
      
      toast.success(t("web.provider.finance.payoutSubmitted"));
      setShowPayoutDialog(false);
      setShowInlineBankForm(false);
      setPayoutAmount("");
      setPayoutNotes("");
      loadFinanceData();
      loadPayouts();
      loadPayoutAccounts();
    } catch (err) {
      const errorMessage =
        err instanceof FetchError
          ? err.message
          : t("web.provider.finance.requestPayoutFailed");
      toast.error(errorMessage);
      console.error("Error requesting payout:", err);
    } finally {
      setIsRequestingPayout(false);
    }
  };

  const openPayoutDialog = () => {
    setShowPayoutDialog(true);
    setShowInlineBankForm(payoutAccounts.length === 0);
    if (earnings && !earnings.payout_balance_unavailable) {
      const available = roundMoney2(earnings.available_balance);
      const minimum = earnings.minimum_payout_amount ?? 100;
      setPayoutAmount(available >= minimum ? available.toFixed(2) : "");
    } else {
      setPayoutAmount("");
    }
  };

  const handleExport = () => {
    try {
      // The CSV export is intentionally org-wide (all locations). If the page is
      // currently scoped to a single branch, the export will NOT match those
      // figures, so confirm before downloading to avoid a silent mismatch.
      const multiLocation = (portalProvider?.locations?.length ?? 0) > 1;
      if (multiLocation && selectedLocationId) {
        const proceed = window.confirm(
          t("web.provider.finance.exportAllLocationsConfirm"),
        );
        if (!proceed) return;
      }
      const params = new URLSearchParams({ range: dateRange });
      const url = `/api/provider/finance/export?${params.toString()}`;
      // Browser will download due to Content-Disposition on the response.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert(t("web.provider.finance.exportFailed"));
    }
  };

  const rangeLabel =
    dateRange === "today" ? t("web.provider.finance.rangeToday") :
    dateRange === "week" ? t("web.provider.finance.rangeWeekMonToday") :
    dateRange === "month" ? t("web.provider.finance.rangeThisMonth") :
    dateRange === "year" ? t("web.provider.finance.rangeThisYear") :
    t("web.provider.finance.rangeAllTime");

  const handleTransactionClick = async (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setShowTransactionDialog(true);
    setIsLoadingDetails(true);
    setTransactionDetails(null);
    
    try {
      // If transaction has a booking_id, fetch booking details
      if (transaction.booking_id) {
        try {
          const response = await fetcher.get<{ data: any }>(`/api/provider/bookings/${transaction.booking_id}`);
          setTransactionDetails(response?.data ?? null);
        } catch (bookingError: any) {
          // Booking might not exist or provider doesn't have access
          // Silently handle - we'll just show transaction info without booking details
          console.warn("Could not load booking details:", bookingError.message);
          setTransactionDetails(null);
        }
      }
      // For non-booking transactions (gift cards, memberships), transactionDetails stays null
      // and we'll just show the transaction info
    } catch (err) {
      console.error("Failed to load transaction details:", err);
      // Don't show error to user - just show transaction info without booking details
      setTransactionDetails(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">
        <PageHeader title={t("web.provider.finance.pageTitle")} subtitle={t("web.provider.finance.pageSubtitleShort")} />
        <LoadingTimeout loadingMessage={t("web.provider.finance.loading")} />
      </div>
    );
  }

  if (error || !earnings) {
    return (
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">
        <PageHeader title={t("web.provider.finance.pageTitle")} />
        <EmptyState
          title={t("web.provider.finance.loadFailed")}
          description={error || t("web.provider.finance.unableToLoad")}
          action={{
            label: t("web.provider.common.retry"),
            onClick: loadFinanceData,
          }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">
        <PageHeader
          title={t("web.provider.finance.pageTitle")}
          subtitle={t("web.provider.finance.pageSubtitle")}
          breadcrumbs={[
            { label: t("web.provider.common.breadcrumbHome"), href: "/" },
            { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
            { label: t("web.provider.sidebar.items.finance") },
          ]}
          actions={
            <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            {canRequestPayout ? (
            <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
              <DialogTrigger asChild>
                <Button className="provider-btn-brand px-5" onClick={openPayoutDialog}>
                  <ArrowUpRight className="w-4 h-4 me-2" />
                  {t("web.provider.finance.requestPayout")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
                      <ArrowUpRight className="h-4 w-4 text-emerald-700" />
                    </span>
                    {t("web.provider.finance.requestPayoutTitle")}
                  </DialogTitle>
                  <DialogDescription>
                    {t("web.provider.finance.requestPayoutBody")}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">{t("web.provider.finance.available")}</p>
                      <p className="mt-1 text-2xl font-semibold text-emerald-950">
                        {earnings.payout_balance_unavailable ? "—" : fmt(earnings.available_balance)}
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-white p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("web.provider.finance.minimum")}</p>
                      <p className="mt-1 text-lg font-semibold text-gray-950">{fmt(earnings.minimum_payout_amount ?? 100)}</p>
                    </div>
                    <div className="rounded-2xl border bg-white p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("web.provider.finance.inQueue")}</p>
                      <p className="mt-1 text-lg font-semibold text-gray-950">{fmt(earnings.pending_payouts)}</p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="payout-amount">{t("web.provider.finance.payoutAmountLabel", { currency: currencyCode, amount: fmt(earnings.minimum_payout_amount ?? 100) })}</Label>
                    <Input
                      id="payout-amount"
                      type="number"
                      min={earnings.minimum_payout_amount ?? 100}
                      max={earnings.available_balance}
                      step="0.01"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      placeholder={t("web.provider.finance.enterAmount")}
                      className="mt-1"
                    />
                    {earnings.payout_balance_unavailable ? (
                      <p className="text-sm text-amber-700 mt-1">
                        {t("web.provider.finance.withdrawLoadFailed")}
                      </p>
                    ) : null}
                    {payoutAmount && roundMoney2(parseFloat(payoutAmount)) < (earnings.minimum_payout_amount ?? 100) && (
                      <p className="text-sm text-red-600 mt-1">
                        {t("web.provider.finance.belowMinimum", { amount: fmt(earnings.minimum_payout_amount ?? 100) })}
                      </p>
                    )}
                    {payoutAmount && !earnings.payout_balance_unavailable && roundMoney2(parseFloat(payoutAmount)) > roundMoney2(earnings.available_balance) && (
                      <p className="text-sm text-red-600 mt-1">
                        {t("web.provider.finance.exceedsBalance")}
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label>{t("provider.mobile.screens.moreTab.bankAccountFallback")}</Label>
                        <p className="mt-1 text-xs text-gray-500">
                          {t("web.provider.finance.addOrSelectAccount")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowInlineBankForm((value) => !value);
                          if (!showInlineBankForm) void loadBanks(bankForm.country);
                        }}
                      >
                        <Plus className="me-1 h-3.5 w-3.5" />
                        {showInlineBankForm ? t("web.provider.finance.hideForm") : t("web.provider.finance.addAccount")}
                      </Button>
                    </div>

                    {payoutAccounts.length > 0 && (
                      <div className="mt-3">
                        <select
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                          value={selectedBankId || payoutAccounts[0]?.id}
                          onChange={(e) => setSelectedBankId(e.target.value)}
                        >
                          {payoutAccounts.map((a) => (
                            <option key={a.id} value={a.id} disabled={!a.active}>
                              {a.account_name} ****{a.account_number_last4}
                              {a.bank_name ? ` (${a.bank_name})` : ""}
                              {a.is_primary ? t("web.provider.finance.primarySuffix") : ""}
                              {!a.active ? t("web.provider.finance.inactiveSuffix") : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {showInlineBankForm && (
                      <div className="mt-4 space-y-3 rounded-xl border bg-white p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label>{t("web.provider.finance.country")}</Label>
                            <select
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              value={bankForm.country}
                              onChange={(e) => {
                                setBankForm((prev) => ({ ...prev, country: e.target.value, bank_code: "" }));
                                setVerifiedAccountName(null);
                              }}
                            >
                              {PAYOUT_COUNTRIES.map((country) => (
                                <option key={country.code} value={country.code}>
                                  {country.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label>{t("web.provider.finance.bank")}</Label>
                            <select
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              value={bankForm.bank_code}
                              disabled={isLoadingBanks}
                              onChange={(e) => {
                                setBankForm((prev) => ({ ...prev, bank_code: e.target.value }));
                                setVerifiedAccountName(null);
                              }}
                            >
                              <option value="">{isLoadingBanks ? t("web.provider.finance.loadingBanks") : t("web.provider.finance.selectBank")}</option>
                              {banks.map((bank) => (
                                <option key={bank.code} value={bank.code}>
                                  {bank.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div
                          className={
                            showVerifyAccountButton
                              ? "grid gap-3 sm:grid-cols-[1fr_auto]"
                              : "grid gap-3"
                          }
                        >
                          <div>
                            <Label>{t("web.provider.finance.accountNumber")}</Label>
                            <Input
                              value={bankForm.account_number}
                              onChange={(e) => {
                                setBankForm((prev) => ({ ...prev, account_number: e.target.value.replace(/\D/g, "") }));
                                setVerifiedAccountName(null);
                              }}
                              maxLength={20}
                              placeholder={t("web.provider.finance.enterBankAccountNumber")}
                            />
                          </div>
                          {showVerifyAccountButton ? (
                            <div className="flex items-end">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleVerifyBankAccount}
                                disabled={isVerifyingBank}
                              >
                                {isVerifyingBank ? (
                                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="me-2 h-4 w-4" />
                                )}
                                {t("web.provider.bookings.detail.atHome.verify")}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        <div>
                          <Label>{t("web.provider.finance.accountHolderName")}</Label>
                          <Input
                            value={bankForm.account_name}
                            onChange={(e) => {
                              const next = e.target.value;
                              setBankForm((prev) => ({ ...prev, account_name: next }));
                              if (verifiedAccountName && next.trim() !== verifiedAccountName.trim()) {
                                setVerifiedAccountName(null);
                              }
                            }}
                            placeholder={t("web.provider.finance.accountHolderName")}
                          />
                          {verifiedAccountName && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              {t("web.provider.finance.verifiedAs", { name: verifiedAccountName })}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label>{t("web.provider.finance.emailOptional")}</Label>
                          <Input
                            type="email"
                            value={bankForm.email}
                            onChange={(e) => setBankForm((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder={t("web.provider.finance.recipientEmailPlaceholder")}
                          />
                        </div>
                        <Button type="button" onClick={handleAddPayoutAccountInline} disabled={isSavingBank} className="w-full">
                          {isSavingBank ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Building2 className="me-2 h-4 w-4" />}
                          {t("web.provider.finance.saveBankAccount")}
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="payout-notes">{t("web.provider.finance.notesOptional")}</Label>
                    <Textarea
                      id="payout-notes"
                      value={payoutNotes}
                      onChange={(e) => setPayoutNotes(e.target.value)}
                      placeholder={t("web.provider.finance.payoutNotesPlaceholder")}
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPayoutDialog(false);
                      setShowInlineBankForm(false);
                      setPayoutAmount("");
                      setPayoutNotes("");
                    }}
                  >
                    {t("web.provider.common.cancel")}
                  </Button>
                  <Button
                    onClick={handleRequestPayout}
                    disabled={isRequestingPayout || earnings.payout_balance_unavailable || payoutAccounts.length === 0 || !payoutAmount || roundMoney2(parseFloat(payoutAmount)) < (earnings.minimum_payout_amount ?? 100) || roundMoney2(parseFloat(payoutAmount)) > roundMoney2(earnings.available_balance)}
                    className="bg-primary hover:bg-primary-hover"
                  >
                    {isRequestingPayout ? t("web.provider.finance.submitting") : t("web.provider.finance.requestPayout")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Lock className="h-4 w-4 flex-shrink-0" />
                <span>{t("web.provider.finance.noPayoutPermission")}</span>
              </div>
            )}
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 me-2" />
              {t("web.provider.finance.exportLedger")}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/provider/settings/payout-accounts" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                {t("web.provider.finance.bankAccounts")}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/provider/payouts/statements" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {t("web.provider.finance.statements")}
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/provider/finance/vat-reports";
              }}
              className="flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {t("web.provider.finance.vatReports")}
            </Button>
          </div>
          }
        />

        <ActiveLocationChip />

        {/* Earnings Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <SectionCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">{t("web.provider.finance.rangeTotalEarned", { range: rangeLabel })}</p>
              <DollarSign className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-semibold">
              {fmt(earnings.recognized_revenue_total ?? 0)}
            </p>
            {(earnings.growth_percentage ?? 0) !== 0 && dateRange !== "all" ? (
              <p
                className={`text-sm mt-1 ${
                  (earnings.growth_percentage ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {(earnings.growth_percentage ?? 0) >= 0 ? "+" : ""}
                {t("web.provider.finance.vsComparison", { value: earnings.growth_percentage })}
              </p>
            ) : null}
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              {t("web.provider.finance.periodEarningsHint")}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t("web.provider.finance.giftCardMembershipNote")}
            </p>
          </SectionCard>
          <SectionCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">{t("web.provider.finance.allTimeAvailable")}</p>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-bold text-green-600">
              {earnings.payout_balance_unavailable ? "—" : fmt(earnings.available_balance)}
            </p>
            {earnings.payout_balance_unavailable ? (
              <p className="text-xs font-medium text-amber-800 mt-2">
                {t("web.provider.finance.withdrawLoadPeriodOk")}
              </p>
            ) : null}
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              {t("web.provider.finance.payoutableHintPrefix")}
              {(earnings.payout_hold_days ?? 0) > 0
                ? `${t("web.provider.finance.payoutableHintHold", { days: earnings.payout_hold_days })}`
                : ""}
              {t("web.provider.finance.payoutableHintSuffix")}
            </p>
            {earnings.has_negative_payout_balance ? (
              <p className="text-xs font-medium text-amber-800 mt-2">
                {t("web.provider.finance.balanceOwed", { owed: fmt(earnings.balance_owed_to_platform ?? 0), raw: fmt(earnings.raw_payout_balance ?? 0) })}
              </p>
            ) : null}
          </SectionCard>
          <SectionCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">{t("web.provider.finance.payoutsInQueue")}</p>
              <Calendar className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-bold text-yellow-600">
              {fmt(earnings.pending_payouts)}
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              {t("web.provider.finance.payoutsInQueueHint")}
            </p>
          </SectionCard>
        </div>

        {/* How your available balance is calculated (recognized revenue -> withdrawable) */}
        {earnings.payout_reconciliation ? (
          <SectionCard className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-900">{t("provider.mobile.components.payoutReconciliation.title")}</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              {t("web.provider.finance.reconIntro")}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-gray-700">{t("provider.mobile.components.payoutReconciliation.recognizedEarnings")}</dt>
                <dd className="font-medium text-gray-900">{fmt(earnings.payout_reconciliation.recognized_payoutable_earnings)}</dd>
              </div>
              {(earnings.payout_reconciliation.excluded_provider_collected ?? 0) > 0 ? (
                <div className="flex items-center justify-between text-gray-500">
                  <dt>{t("web.provider.finance.excludedCollected")}</dt>
                  <dd>{fmt(earnings.payout_reconciliation.excluded_provider_collected)}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-gray-500">
                <dt>
                  {t("provider.mobile.components.payoutReconciliation.onHold")}
                  {(earnings.payout_hold_days ?? 0) > 0 ? t("web.provider.finance.onHoldClears", { days: earnings.payout_hold_days }) : ""}
                </dt>
                <dd>{fmt(earnings.payout_reconciliation.on_hold)}</dd>
              </div>
              <div className="flex items-center justify-between text-gray-500">
                <dt>{t("web.provider.finance.pendingProcessingRequests")}</dt>
                <dd>{fmt(earnings.payout_reconciliation.pending_payouts)}</dd>
              </div>
              <div className="flex items-center justify-between text-gray-500">
                <dt>{t("provider.mobile.components.payoutReconciliation.alreadyPaidOut")}</dt>
                <dd>{fmt(earnings.payout_reconciliation.already_paid_out)}</dd>
              </div>
              <div className="flex items-center justify-between border-t pt-2 mt-2">
                <dt className="font-semibold text-gray-900">{t("provider.mobile.components.payoutReconciliation.available")}</dt>
                <dd className="font-semibold text-green-600">{fmt(earnings.payout_reconciliation.available_balance)}</dd>
              </div>
            </dl>
            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
              {t("web.provider.finance.reconFooter")}
            </p>
          </SectionCard>
        ) : null}

        {/* Revenue Streams */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.serviceEarnings", { range: rangeLabel })}</p>
            <p className="text-2xl font-semibold">
              {fmt(earnings.period_provider_earnings ?? earnings.bookings_earnings_this_period ?? 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.serviceEarningsHint")}</p>
          </div>
          {(earnings.product_sales_earnings_total ?? 0) > 0 && (
            <div className="provider-card provider-card-padding">
              <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.productSales")}</p>
              <p className="text-2xl font-semibold text-indigo-600">
                {fmt(earnings.product_sales_earnings_this_period ?? earnings.product_sales_earnings_total ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.productSalesHint")}</p>
            </div>
          )}
          {(earnings.platform_fees_deducted ?? 0) > 0 && (
            <div className="provider-card provider-card-padding">
              <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.platformFeesDeducted")}</p>
              <p className="text-2xl font-semibold text-orange-600">
                {fmt(earnings.platform_fees_deducted_this_period ?? earnings.platform_fees_deducted ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {t("web.provider.finance.platformFeesHint")}
              </p>
            </div>
          )}
          {((earnings.membership_discounts_this_period ?? 0) > 0 ||
            (earnings.loyalty_discounts_this_period ?? 0) > 0 ||
            (earnings.promo_discounts_this_period ?? 0) > 0) && (
            <div className="bg-white border rounded-lg p-6 md:col-span-2 lg:col-span-3">
              <p className="text-sm font-medium text-gray-800 mb-2">{t("web.provider.finance.discountsOnBookings", { range: rangeLabel })}</p>
              <p className="text-xs text-gray-500 mb-4">
                {t("web.provider.finance.discountsHint")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(earnings.membership_discounts_this_period ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-gray-600">{t("web.provider.finance.membershipDiscount")}</p>
                    <p className="text-lg font-semibold text-slate-800">{fmt(earnings.membership_discounts_this_period ?? 0)}</p>
                  </div>
                )}
                {(earnings.loyalty_discounts_this_period ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-gray-600">{t("web.provider.finance.loyaltyDiscount")}</p>
                    <p className="text-lg font-semibold text-slate-800">{fmt(earnings.loyalty_discounts_this_period ?? 0)}</p>
                  </div>
                )}
                {(earnings.promo_discounts_this_period ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-gray-600">{t("web.provider.finance.promoDiscount")}</p>
                    <p className="text-lg font-semibold text-slate-800">{fmt(earnings.promo_discounts_this_period ?? 0)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.travelFees")}</p>
            <p className="text-2xl font-semibold text-purple-600">
              {fmt(earnings.travel_fees_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.travelFeesHint")}</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.giftCardSales")}</p>
            <p className="text-2xl font-semibold">
              {fmt(earnings.gift_card_sales_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.giftCardSalesHint")}</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.membershipSales")}</p>
            <p className="text-2xl font-semibold">
              {fmt(earnings.membership_sales_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.membershipSalesHint")}</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.refunds")}</p>
            <p className="text-2xl font-semibold text-red-600">
              {fmt(earnings.refunds_this_period || 0)}
            </p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.walkInAddons")}</p>
            <p className="text-2xl font-semibold text-gray-700">
              {fmt(earnings.walk_in_additional_charges_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.walkInAddonsHint")}</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.tips")}</p>
            <p className="text-2xl font-semibold text-emerald-600">
              {fmt(earnings.tips_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.tipsHint")}</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.cancellationFees")}</p>
            <p className="text-2xl font-semibold text-amber-600">
              {fmt(earnings.cancellation_fees_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.cancellationFeesHint")}</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">{t("web.provider.finance.additionalCharges")}</p>
            <p className="text-2xl font-semibold text-blue-600">
              {fmt(earnings.additional_charges_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{t("web.provider.finance.additionalChargesHint")}</p>
          </div>
        </div>

        {/* Monthly Comparison */}
        <div className="bg-white border rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{t("web.provider.finance.earningsComparison")}</h2>
            <div className="flex gap-2">
              {([
                { value: "today", label: t("web.provider.finance.rangeToday") },
                { value: "week", label: t("web.provider.finance.rangeThisWeek") },
                { value: "month", label: t("web.provider.finance.rangeThisMonth") },
                { value: "year", label: t("web.provider.finance.rangeThisYear") },
                { value: "all", label: t("web.provider.finance.rangeAllTime") },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateRange(option.value)}
                  className={`px-3 py-1 rounded text-sm ${
                    dateRange === option.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">{t("web.provider.finance.selectedPeriodEarned")}</p>
              <p className="text-2xl font-semibold">
                {fmt(earnings.recognized_revenue_total ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {t("web.provider.finance.serviceEarningsOnly", { amount: fmt(earnings.period_provider_earnings ?? earnings.this_month ?? 0) })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">{t("web.provider.finance.previousComparison")}</p>
              <p className="text-2xl font-semibold">
                {fmt(earnings.recognized_revenue_last_period ?? 0)}
              </p>
              {dateRange !== "all" ? (
                <p
                  className={`text-sm mt-1 ${
                    earnings.growth_percentage >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {earnings.growth_percentage >= 0 ? "+" : ""}
                  {t("web.provider.finance.vsPreviousPeriod", { value: earnings.growth_percentage })}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {nextPayoutDate ? (
          <div className="bg-white border rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-2">{t("web.provider.finance.payoutSchedule")}</h2>
            <p className="text-sm text-gray-600">{nextPayoutDate.next_payout_description}</p>
            {nextPayoutDate.next_payout_date ? (
              <p className="text-lg font-medium text-gray-900 mt-2">
                {t("web.provider.finance.nextScheduledPayout")}{" "}
                {new Date(nextPayoutDate.next_payout_date).toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            ) : null}
            <p className="text-xs text-gray-500 mt-2">
              {t("web.provider.finance.scheduleMeta", { schedule: nextPayoutDate.payout_schedule.replace(/_/g, " "), amount: fmt(nextPayoutDate.minimum_payout_amount), days: nextPayoutDate.payout_hold_days })}
            </p>
          </div>
        ) : null}

        <FinanceBookingPaymentsSection timezone={portalProvider?.timezone} />

        {/* Bank accounts + payout history (always visible for discovery / deep-links) */}
        <div
          id="payouts"
          ref={payoutsSectionRef}
          className="bg-white border rounded-lg p-6 mb-8 scroll-mt-24"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-semibold">{t("web.provider.finance.payoutsAndBanks")}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {t("web.provider.finance.payoutsAndBanksHint")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/provider/settings/payout-accounts">{t("web.provider.finance.manageBankAccounts")}</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/provider/payouts/statements">{t("web.provider.finance.payoutStatements")}</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              {t("web.provider.finance.linkedBankAccounts")}
            </p>
            {payoutAccounts.length === 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-gray-600 flex-1">
                  {t("web.provider.finance.noBankYet")}
                </p>
                <Button size="sm" asChild>
                  <Link href="/provider/settings/payout-accounts">{t("web.provider.finance.addBankAccount")}</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {payoutAccounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {account.bank_name || t("provider.mobile.screens.moreTab.bankAccountFallback")}
                        {account.is_primary ? (
                          <span className="ms-2 text-[10px] font-semibold uppercase text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {t("web.provider.finance.primary")}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {account.account_name}
                        {account.account_number_last4
                          ? ` · •••• ${account.account_number_last4}`
                          : ""}
                        {!account.active ? t("web.provider.finance.inactiveDot") : ""}
                      </p>
                    </div>
                    <Building2 className="h-4 w-4 text-gray-300 shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">{t("web.provider.finance.payoutHistory")}</h3>
            <span className="text-xs text-gray-500">
              {payouts.length} {t("web.provider.finance.request", { count: payouts.length })}
            </span>
          </div>

          {payouts.length === 0 ? (
            <EmptyState
              title={t("provider.mobile.screens.payouts.emptyTitle")}
              description={t("web.provider.finance.noPayoutsDesc")}
              action={
                canRequestPayout
                  ? {
                      label: payoutAccounts.length === 0 ? t("provider.mobile.screens.moreTab.setUpBankAccount") : t("provider.mobile.screens.moreTab.requestPayout"),
                      onClick: () => {
                        if (payoutAccounts.length === 0) {
                          window.location.href = "/provider/settings/payout-accounts";
                          return;
                        }
                        setShowPayoutDialog(true);
                        setShowInlineBankForm(false);
                      },
                    }
                  : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="flex items-center justify-between py-4 border-b last:border-0"
                >
                  <div className="flex-1">
                    <p className="font-medium">{t("web.provider.finance.payoutRequestAmount", { amount: fmt(payout.amount) })}</p>
                    <p className="text-sm text-gray-600">
                      {t("web.provider.finance.requested")}{" "}
                      {new Date(payout.requested_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                      {payout.processed_at
                        ? t("web.provider.finance.processed", { date: new Date(payout.processed_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          }) })
                        : ""}
                    </p>
                    {payout.notes ? (
                      <p className="text-sm text-gray-500 mt-1">{payout.notes}</p>
                    ) : null}
                    {payout.status === "failed" && payout.rejected_at && payout.failure_reason ? (
                      <p className="text-sm text-red-600 mt-1">{t("web.provider.finance.reason", { reason: payout.failure_reason })}</p>
                    ) : null}
                  </div>
                  <span
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      payout.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : payout.status === "pending" || payout.status === "processing"
                          ? "bg-yellow-100 text-yellow-800"
                          : payout.status === "failed" && payout.rejected_at
                            ? "bg-orange-100 text-orange-800"
                            : payout.status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {formatPayoutDisplayStatus(payout, t)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transactions */}
        <div className="provider-card provider-card-padding">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">{t("web.provider.finance.transactionHistory")}</h2>
              {(portalProvider?.locations?.length ?? 0) > 1 && selectedLocationId ? (
                <p className="text-sm text-gray-500 mt-1">
                  {t("web.provider.finance.ledgerScopedNote")}
                </p>
              ) : null}
            </div>
          </div>

          {transactions.length === 0 ? (
            <EmptyState
              title={t("web.provider.finance.noTransactionsYet")}
              description={t("web.provider.finance.noTransactionsDesc")}
            />
          ) : (
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <TransactionRow 
                  key={transaction.id} 
                  transaction={transaction}
                  onClick={() => handleTransactionClick(transaction)}
                  fmt={fmt}
                />
              ))}
            </div>
          )}
        </div>

        {/* Transaction Details Dialog */}
        <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("web.provider.finance.transactionDetails")}</DialogTitle>
              <DialogDescription>
                {t("web.provider.finance.transactionDetailsDesc")}
              </DialogDescription>
            </DialogHeader>
            
            {isLoadingDetails ? (
              <div className="py-8 text-center">
                <p className="text-gray-600">{t("web.provider.finance.loadingTransactionDetails")}</p>
              </div>
            ) : selectedTransaction ? (
              <FinanceTransactionDetailBody
                transaction={selectedTransaction}
                transactionDetails={transactionDetails}
                fmt={fmt}
              />
            ) : (
              <div className="py-8 text-center">
                <p className="text-gray-600">{t("web.provider.finance.noAdditionalDetails")}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

/** Ledger debit/credit sign for finance page rows (API `type` + optional `transaction_type`). */
function financePageLedgerSign(t: Pick<Transaction, "transaction_type" | "type" | "amount" | "net">): 1 | -1 {
  const tt = t.transaction_type ?? "";
  if (typeof tt === "string" && tt.length > 0) {
    return ledgerRowDisplaySign({
      transaction_type: tt,
      net: t.net,
      amount: t.amount,
    });
  }
  if (t.type === "payout" || t.type === "refund" || t.type === "platform_fee") return -1;
  if (t.amount < 0 || (t.net !== undefined && t.net < 0)) return -1;
  return 1;
}

/** Signed primary line and Tailwind colour for provider-facing ledger semantics (matches list rows). */
function providerFacingLedgerDisplay(t: Transaction): { signedPrimary: number; primaryClass: string } {
  const sign = financePageLedgerSign(t);
  const tt = t.transaction_type ?? "";
  const basis = Number(t.net ?? t.amount ?? 0);
  const signedPrimary = sign * Math.abs(basis);
  const primaryClass =
    tt === "provider_earnings" && signedPrimary < 0
      ? "text-red-600"
      : sign < 0
        ? "text-amber-700"
        : signedPrimary < 0
          ? "text-red-600"
          : "text-green-600";
  return { signedPrimary, primaryClass };
}

function FinanceTransactionDetailBody({
  transaction,
  transactionDetails,
  fmt,
}: {
  transaction: Transaction;
  transactionDetails: Record<string, unknown> | null;
  fmt: (amount: number) => string;
}) {
  const { t } = useTranslation();
  const { signedPrimary, primaryClass } = providerFacingLedgerDisplay(transaction);
  const hasNetSplit =
    transaction.net !== undefined && transaction.net !== transaction.amount;

  return (
    <div className="space-y-6 py-4">
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-3">{t("web.provider.finance.transactionOverview")}</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">{t("web.provider.finance.description")}</span>
            <span className="font-medium">{transaction.description}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t("web.provider.finance.date")}</span>
            <span className="font-medium">
              {new Date(transaction.date).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t("web.provider.finance.status")}</span>
            <span className="font-medium">{formatStatusLabel(transaction.status)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t("web.provider.finance.type")}</span>
            <span className="font-medium">
              {formatStatusLabel(transaction.transaction_type || transaction.type)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-3">{t("web.provider.finance.amountBreakdown")}</h3>
        <div className="space-y-2">
          {hasNetSplit ? (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600">{t("web.provider.finance.grossAmount")}</span>
                <span className="font-medium">
                  {fmt(transaction.amount)}
                </span>
              </div>
              {transaction.fees && transaction.fees > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.finance.fees")}</span>
                  <span className="font-medium text-red-600">
                    -{fmt(transaction.fees)}
                  </span>
                </div>
              )}
              {transaction.commission && transaction.commission > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.finance.platformCommission")}</span>
                  <span className="font-medium text-red-600">
                    -{fmt(transaction.commission)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                <span className="font-semibold">{t("web.provider.finance.netAmount")}</span>
                <span className={`font-semibold ${primaryClass}`}>
                  {fmt(signedPrimary)}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="font-semibold">{t("web.provider.finance.amount")}</span>
              <span className={`font-semibold ${primaryClass}`}>
                {fmt(signedPrimary)}
              </span>
            </div>
          )}
        </div>
      </div>

      {transactionDetails && transaction.booking_id ? (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold mb-3">{t("web.provider.finance.bookingDetails")}</h3>
          <div className="space-y-2">
            {transactionDetails.booking_number && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t("web.provider.finance.bookingNumber")}</span>
                <span className="font-medium">{String(transactionDetails.booking_number)}</span>
              </div>
            )}
            {transactionDetails.total_amount && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t("web.provider.finance.bookingTotal")}</span>
                <span className="font-medium">{fmt(Number(transactionDetails.total_amount))}</span>
              </div>
            )}
            {transactionDetails.service_fee_amount && Number(transactionDetails.service_fee_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t("web.provider.finance.platformFee")}</span>
                <span className="font-medium">{fmt(Number(transactionDetails.service_fee_amount))}</span>
              </div>
            )}
            {transactionDetails.tax_amount && Number(transactionDetails.tax_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t("web.provider.finance.taxVat")}</span>
                <span className="font-medium">{fmt(Number(transactionDetails.tax_amount))}</span>
              </div>
            )}
            {transactionDetails.travel_fee && Number(transactionDetails.travel_fee) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t("web.provider.finance.travelFee")}</span>
                <span className="font-medium">{fmt(Number(transactionDetails.travel_fee))}</span>
              </div>
            )}
            {transactionDetails.booking_source && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t("web.provider.finance.bookingSource")}</span>
                <span className="font-medium capitalize">
                  {String(transactionDetails.booking_source).replace("_", " ")}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TransactionRow({ transaction, onClick, fmt }: { transaction: Transaction; onClick: () => void; fmt: (amount: number) => string }) {
  const tt = transaction.transaction_type;
  const isPlatformRetained =
    transaction.type === "platform_fee" ||
    tt === "service_fee" ||
    tt === "platform_fee";
  const isLedgerFeeLike =
    isPlatformRetained ||
    tt === "tax" ||
    tt === "provider_subscription_payment" ||
    tt === "provider_ads_payment";

  const displaySign = financePageLedgerSign(transaction);
  const displayAbs = Math.abs(Number(transaction.net ?? transaction.amount ?? 0));

  const getTypeColor = () => {
    if (isLedgerFeeLike) return "text-amber-600";
    if (tt === "tip") return "text-green-600";
    if (tt === "travel_fee") return "text-purple-600";
    if (tt === "cancellation_fee") {
      return (transaction.net ?? transaction.amount) < 0 ? "text-red-600" : "text-green-600";
    }
    switch (transaction.type) {
      case "booking":
        return tt === "provider_earnings" && (transaction.net ?? transaction.amount) < 0
          ? "text-red-600"
          : "text-green-600";
      case "payout":
        return "text-blue-600";
      case "refund":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusColor = () => {
    switch (transaction.status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div 
      className="flex items-center justify-between py-4 border-b last:border-0 cursor-pointer hover:bg-gray-50 transition-colors rounded px-2 -mx-2"
      onClick={onClick}
    >
      <div className="flex-1">
        <p className="font-medium">{transaction.description}</p>
        <p className="text-sm text-gray-600">
          {new Date(transaction.date).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <p className={`font-semibold ${getTypeColor()}`}>
          {displaySign < 0 ? "-" : "+"}
          {fmt(displayAbs)}
        </p>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor()}`}
        >
          {formatStatusLabel(transaction.status)}
        </span>
      </div>
    </div>
  );
}
