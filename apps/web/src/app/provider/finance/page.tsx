"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { FinanceBookingPaymentsSection } from "./FinanceBookingPaymentsSection";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, Calendar, Download, ArrowUpRight, FileText, Building2, CheckCircle2, Loader2, Plus } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
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

interface EarningsData {
  total_earnings: number;
  pending_payouts: number;
  available_balance: number;
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

function formatPayoutDisplayStatus(payout: Pick<Payout, "status" | "rejected_at">): string {
  if (payout.status === "failed" && payout.rejected_at) return "Rejected";
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
  const { selectedLocationId, provider: portalProvider } = useProviderPortal();
  const { hasPermission } = usePermissions();
  const { currencyCode, format: fmt } = useReportCurrency();
  const canRequestPayout = hasPermission("process_payments");

  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<"week" | "month" | "year" | "all">("month");
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

  const loadFinanceData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = selectedLocationId
        ? `/api/provider/finance?range=${dateRange}&location_id=${selectedLocationId}&transaction_feed=all`
        : `/api/provider/finance?range=${dateRange}`;
      
      const response = await fetcher.get<{
        data: { earnings: EarningsData; transactions: Transaction[] } | null;
      }>(url, { staleTimeMs: 0 });
      const payload = response.data;
      if (!payload?.earnings) {
        throw new Error("Invalid finance response");
      }
      setEarnings(payload.earnings);
      setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load finance data";
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
      const response = await fetcher.get<{ data: PayoutAccount[] }>("/api/provider/payout-accounts");
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
      toast.error("Failed to load bank list");
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
      toast.error("Enter an account number and select a bank first.");
      return;
    }
    if (bankForm.account_number.trim().length < 8 || bankForm.account_number.trim().length > 20) {
      toast.error("Account number must be 8-20 digits.");
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
        toast.success("Bank account verified");
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Bank account verification failed");
    } finally {
      setIsVerifyingBank(false);
    }
  };

  const handleAddPayoutAccountInline = async () => {
    if (!bankForm.account_number.trim() || !bankForm.bank_code || !bankForm.account_name.trim()) {
      toast.error("Account number, bank, and account name are required.");
      return;
    }
    if (bankForm.account_number.trim().length < 8 || bankForm.account_number.trim().length > 20) {
      toast.error("Account number must be 8-20 digits.");
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
      toast.success("Bank account added");
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
          toast.success("Bank account is already saved. Your list has been refreshed.");
          resetBankForm();
          setShowInlineBankForm(false);
          await loadPayoutAccounts();
          return;
        }
      } catch {
        // fall through
      }
      toast.error(err instanceof FetchError ? err.message : "Failed to add bank account");
    } finally {
      setIsSavingBank(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!payoutAmount || parseFloat(payoutAmount) <= 0) {
      toast.error("Please enter a valid payout amount");
      return;
    }

    const minimumPayout = earnings?.minimum_payout_amount ?? 100;
    if (parseFloat(payoutAmount) < minimumPayout) {
      toast.error(`Minimum payout is ${fmt(minimumPayout)}`);
      return;
    }
    if (!earnings || parseFloat(payoutAmount) > earnings.available_balance) {
      toast.error("Insufficient balance for this payout");
      return;
    }

    try {
      setIsRequestingPayout(true);
      const primaryId = payoutAccounts[0]?.id;
      await fetcher.post("/api/provider/payouts", {
        amount: parseFloat(payoutAmount),
        notes: payoutNotes || null,
        bank_account_id: selectedBankId || primaryId || undefined,
      });
      
      toast.success("Payout request submitted successfully");
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
          : "Failed to request payout";
      toast.error(errorMessage);
      console.error("Error requesting payout:", err);
    } finally {
      setIsRequestingPayout(false);
    }
  };

  const openPayoutDialog = () => {
    setShowPayoutDialog(true);
    setShowInlineBankForm(payoutAccounts.length === 0);
  };

  const handleExport = () => {
    try {
      // The CSV export is intentionally org-wide (all locations). If the page is
      // currently scoped to a single branch, the export will NOT match those
      // figures, so confirm before downloading to avoid a silent mismatch.
      const multiLocation = (portalProvider?.locations?.length ?? 0) > 1;
      if (multiLocation && selectedLocationId) {
        const proceed = window.confirm(
          "This CSV export covers all locations, not just the branch you're currently viewing. Continue?",
        );
        if (!proceed) return;
      }
      const params = new URLSearchParams({ range: dateRange });
      const url = `/api/provider/finance/export?${params.toString()}`;
      // Browser will download due to Content-Disposition on the response.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("Failed to start export");
    }
  };

  const rangeLabel =
    dateRange === "week" ? "Last 7 days" :
    dateRange === "month" ? "Month to date" :
    dateRange === "year" ? "Last 12 months" :
    "All time";

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
        <PageHeader title="Finance & Earnings" subtitle="Track earnings, payouts, and customer payments" />
        <LoadingTimeout loadingMessage="Loading finance data..." />
      </div>
    );
  }

  if (error || !earnings) {
    return (
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">
        <PageHeader title="Finance & Earnings" />
        <EmptyState
          title="Failed to load finance data"
          description={error || "Unable to load earnings information"}
          action={{
            label: "Retry",
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
          title="Finance & Earnings"
          subtitle="Track earnings for the selected period, request payouts, and search customer payments in one place"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Finance" },
          ]}
          actions={
            <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            {canRequestPayout ? (
            <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
              <DialogTrigger asChild>
                <Button className="provider-btn-brand px-5" onClick={openPayoutDialog}>
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  Request Payout
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
                      <ArrowUpRight className="h-4 w-4 text-emerald-700" />
                    </span>
                    Request payout
                  </DialogTitle>
                  <DialogDescription>
                    Withdraw from your all-time platform-held payout balance. Period earnings are shown separately on this page.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Available</p>
                      <p className="mt-1 text-2xl font-semibold text-emerald-950">{fmt(earnings.available_balance)}</p>
                    </div>
                    <div className="rounded-2xl border bg-white p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Minimum</p>
                      <p className="mt-1 text-lg font-semibold text-gray-950">{fmt(earnings.minimum_payout_amount ?? 100)}</p>
                    </div>
                    <div className="rounded-2xl border bg-white p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">In queue</p>
                      <p className="mt-1 text-lg font-semibold text-gray-950">{fmt(earnings.pending_payouts)}</p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="payout-amount">Payout Amount ({currencyCode}) * — min {fmt(earnings.minimum_payout_amount ?? 100)}</Label>
                    <Input
                      id="payout-amount"
                      type="number"
                      min={earnings.minimum_payout_amount ?? 100}
                      max={earnings.available_balance}
                      step="0.01"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="mt-1"
                    />
                    {payoutAmount && parseFloat(payoutAmount) < (earnings.minimum_payout_amount ?? 100) && (
                      <p className="text-sm text-red-600 mt-1">
                        Below minimum payout ({fmt(earnings.minimum_payout_amount ?? 100)})
                      </p>
                    )}
                    {payoutAmount && parseFloat(payoutAmount) > earnings.available_balance && (
                      <p className="text-sm text-red-600 mt-1">
                        Amount exceeds available balance
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label>Bank account</Label>
                        <p className="mt-1 text-xs text-gray-500">
                          Add or select the account that should receive this payout.
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
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {showInlineBankForm ? "Hide form" : "Add account"}
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
                              {a.is_primary ? " — Primary" : ""}
                              {!a.active ? " — Inactive" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {showInlineBankForm && (
                      <div className="mt-4 space-y-3 rounded-xl border bg-white p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label>Country</Label>
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
                            <Label>Bank</Label>
                            <select
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                              value={bankForm.bank_code}
                              disabled={isLoadingBanks}
                              onChange={(e) => {
                                setBankForm((prev) => ({ ...prev, bank_code: e.target.value }));
                                setVerifiedAccountName(null);
                              }}
                            >
                              <option value="">{isLoadingBanks ? "Loading banks..." : "Select bank"}</option>
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
                            <Label>Account number</Label>
                            <Input
                              value={bankForm.account_number}
                              onChange={(e) => {
                                setBankForm((prev) => ({ ...prev, account_number: e.target.value.replace(/\D/g, "") }));
                                setVerifiedAccountName(null);
                              }}
                              maxLength={20}
                              placeholder="Enter bank account number"
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
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                )}
                                Verify
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        <div>
                          <Label>Account holder name</Label>
                          <Input
                            value={bankForm.account_name}
                            onChange={(e) => {
                              const next = e.target.value;
                              setBankForm((prev) => ({ ...prev, account_name: next }));
                              if (verifiedAccountName && next.trim() !== verifiedAccountName.trim()) {
                                setVerifiedAccountName(null);
                              }
                            }}
                            placeholder="Account holder name"
                          />
                          {verifiedAccountName && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Verified as {verifiedAccountName}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label>Email (optional)</Label>
                          <Input
                            type="email"
                            value={bankForm.email}
                            onChange={(e) => setBankForm((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder="recipient@example.com"
                          />
                        </div>
                        <Button type="button" onClick={handleAddPayoutAccountInline} disabled={isSavingBank} className="w-full">
                          {isSavingBank ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
                          Save bank account
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="payout-notes">Notes (Optional)</Label>
                    <Textarea
                      id="payout-notes"
                      value={payoutNotes}
                      onChange={(e) => setPayoutNotes(e.target.value)}
                      placeholder="Add any notes about this payout request"
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
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRequestPayout}
                    disabled={isRequestingPayout || payoutAccounts.length === 0 || !payoutAmount || parseFloat(payoutAmount) < (earnings.minimum_payout_amount ?? 100) || parseFloat(payoutAmount) > earnings.available_balance}
                    className="bg-primary hover:bg-primary-hover"
                  >
                    {isRequestingPayout ? "Submitting..." : "Request Payout"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Lock className="h-4 w-4 flex-shrink-0" />
                <span>You don&apos;t have permission to request payouts. Contact your administrator.</span>
              </div>
            )}
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.location.href = "/provider/finance/vat-reports"}
              className="flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              VAT Reports
            </Button>
          </div>
          }
        />

        <ActiveLocationChip />

        {/* Earnings Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <SectionCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">{rangeLabel} earnings</p>
              <DollarSign className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-semibold">
              {fmt(earnings.total_earnings)}
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Net provider share from the selected period&apos;s ledger rows. This is not the same as all-time available payout balance.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Gift card / membership sales below are liability movements — do not add them to earnings totals.
            </p>
          </SectionCard>
          <SectionCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">All-time available to withdraw</p>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-bold text-green-600">
              {fmt(earnings.available_balance)}
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              All payoutable platform-held earnings minus completed payouts and your pending requests
              {(earnings.payout_hold_days ?? 0) > 0
                ? `, after a ${earnings.payout_hold_days}-day hold on new earnings`
                : ""}
              . Cash settled outside the app is not included.
            </p>
            {earnings.has_negative_payout_balance ? (
              <p className="text-xs font-medium text-amber-800 mt-2">
                Balance owed to platform: {fmt(earnings.balance_owed_to_platform ?? 0)} (raw ledger balance{" "}
                {fmt(earnings.raw_payout_balance ?? 0)}). Withdrawable amount is floored at 0 until settled.
              </p>
            ) : null}
          </SectionCard>
          <SectionCard className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Payout requests in queue</p>
              <Calendar className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-bold text-yellow-600">
              {fmt(earnings.pending_payouts)}
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Sum of your requests still pending or processing (already deducted from available balance).
            </p>
          </SectionCard>
        </div>

        {/* How your available balance is calculated (recognized revenue -> withdrawable) */}
        {earnings.payout_reconciliation ? (
          <SectionCard className="p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-900">How your available balance is calculated</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Headline revenue reports can read higher than withdrawable because they include cash you collected
              directly. Here is the full bridge:
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-gray-700">Recognized payoutable earnings (net of refunds)</dt>
                <dd className="font-medium text-gray-900">{fmt(earnings.payout_reconciliation.recognized_payoutable_earnings)}</dd>
              </div>
              {(earnings.payout_reconciliation.excluded_provider_collected ?? 0) > 0 ? (
                <div className="flex items-center justify-between text-gray-500">
                  <dt>Excluded: cash / Yoco / EFT you collected directly (not held by us)</dt>
                  <dd>{fmt(earnings.payout_reconciliation.excluded_provider_collected)}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-gray-500">
                <dt>
                  − On hold
                  {(earnings.payout_hold_days ?? 0) > 0 ? ` (clears ${earnings.payout_hold_days} days after each booking)` : ""}
                </dt>
                <dd>{fmt(earnings.payout_reconciliation.on_hold)}</dd>
              </div>
              <div className="flex items-center justify-between text-gray-500">
                <dt>− Pending / processing payout requests</dt>
                <dd>{fmt(earnings.payout_reconciliation.pending_payouts)}</dd>
              </div>
              <div className="flex items-center justify-between text-gray-500">
                <dt>− Already paid out</dt>
                <dd>{fmt(earnings.payout_reconciliation.already_paid_out)}</dd>
              </div>
              <div className="flex items-center justify-between border-t pt-2 mt-2">
                <dt className="font-semibold text-gray-900">= Available to withdraw</dt>
                <dd className="font-semibold text-green-600">{fmt(earnings.payout_reconciliation.available_balance)}</dd>
              </div>
            </dl>
            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
              Note: subscription and ads are billed to your card separately and are never deducted from this balance.
            </p>
          </SectionCard>
        ) : null}

        {/* Revenue Streams */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Service Earnings ({rangeLabel})</p>
            <p className="text-2xl font-semibold">
              {fmt(earnings.bookings_earnings_this_period ?? earnings.bookings_earnings_total ?? 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">From bookings &amp; appointments</p>
          </div>
          {(earnings.product_sales_earnings_total ?? 0) > 0 && (
            <div className="provider-card provider-card-padding">
              <p className="text-sm text-gray-600 mb-2">Product Sales</p>
              <p className="text-2xl font-semibold text-indigo-600">
                {fmt(earnings.product_sales_earnings_this_period ?? earnings.product_sales_earnings_total ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Online product orders (incl. tax &amp; shipping)</p>
            </div>
          )}
          {(earnings.platform_fees_deducted ?? 0) > 0 && (
            <div className="provider-card provider-card-padding">
              <p className="text-sm text-gray-600 mb-2">Platform Fees Deducted</p>
              <p className="text-2xl font-semibold text-orange-600">
                {fmt(earnings.platform_fees_deducted_this_period ?? earnings.platform_fees_deducted ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Customer-paid booking &amp; shop platform fees (ledger), not your % commission line
              </p>
            </div>
          )}
          {((earnings.membership_discounts_this_period ?? 0) > 0 ||
            (earnings.loyalty_discounts_this_period ?? 0) > 0 ||
            (earnings.promo_discounts_this_period ?? 0) > 0) && (
            <div className="bg-white border rounded-lg p-6 md:col-span-2 lg:col-span-3">
              <p className="text-sm font-medium text-gray-800 mb-2">Discounts on bookings ({rangeLabel})</p>
              <p className="text-xs text-gray-500 mb-4">
                Already included in what the customer paid — informational only, not added on top of earnings.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(earnings.membership_discounts_this_period ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-gray-600">Membership discount</p>
                    <p className="text-lg font-semibold text-slate-800">{fmt(earnings.membership_discounts_this_period ?? 0)}</p>
                  </div>
                )}
                {(earnings.loyalty_discounts_this_period ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-gray-600">Loyalty discount</p>
                    <p className="text-lg font-semibold text-slate-800">{fmt(earnings.loyalty_discounts_this_period ?? 0)}</p>
                  </div>
                )}
                {(earnings.promo_discounts_this_period ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-gray-600">Promo / coupon discount</p>
                    <p className="text-lg font-semibold text-slate-800">{fmt(earnings.promo_discounts_this_period ?? 0)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Travel Fees</p>
            <p className="text-2xl font-semibold text-purple-600">
              {fmt(earnings.travel_fees_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Travel component (included in service earnings)</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Gift Card Sales</p>
            <p className="text-2xl font-semibold">
              {fmt(earnings.gift_card_sales_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Not additive with service earnings (liability / float)</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Membership Sales</p>
            <p className="text-2xl font-semibold">
              {fmt(earnings.membership_sales_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Not additive with service earnings (deferred revenue)</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Refunds</p>
            <p className="text-2xl font-semibold text-red-600">
              {fmt(earnings.refunds_this_period ?? earnings.refunds_total ?? 0)}
            </p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Walk-in add-ons</p>
            <p className="text-2xl font-semibold text-gray-700">
              {fmt(earnings.walk_in_additional_charges_this_period ?? earnings.walk_in_additional_charges_total ?? 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Cash/card at salon (not in payout balance)</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Tips</p>
            <p className="text-2xl font-semibold text-emerald-600">
              {fmt(earnings.tips_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Tips from customers</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Cancellation Fees</p>
            <p className="text-2xl font-semibold text-amber-600">
              {fmt(earnings.cancellation_fees_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Fees from booking cancellations</p>
          </div>
          <div className="provider-card provider-card-padding">
            <p className="text-sm text-gray-600 mb-2">Additional Charges</p>
            <p className="text-2xl font-semibold text-blue-600">
              {fmt(earnings.additional_charges_this_period || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Extra charges added to bookings</p>
          </div>
        </div>

        {/* Monthly Comparison */}
        <div className="bg-white border rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Earnings comparison</h2>
            <div className="flex gap-2">
              {(["week", "month", "year", "all"] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1 rounded text-sm capitalize ${
                    dateRange === range
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Selected period</p>
              <p className="text-2xl font-semibold">
                {fmt(earnings.this_month)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Previous comparison</p>
              <p className="text-2xl font-semibold">
                {fmt(earnings.last_month)}
              </p>
              <p
                className={`text-sm mt-1 ${
                  earnings.growth_percentage >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {earnings.growth_percentage >= 0 ? "+" : ""}
                {earnings.growth_percentage}% vs previous period
              </p>
            </div>
          </div>
        </div>

        {nextPayoutDate ? (
          <div className="bg-white border rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-2">Payout schedule</h2>
            <p className="text-sm text-gray-600">{nextPayoutDate.next_payout_description}</p>
            {nextPayoutDate.next_payout_date ? (
              <p className="text-lg font-medium text-gray-900 mt-2">
                Next scheduled payout:{" "}
                {new Date(nextPayoutDate.next_payout_date).toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            ) : null}
            <p className="text-xs text-gray-500 mt-2">
              Schedule: {nextPayoutDate.payout_schedule.replace(/_/g, " ")} · Minimum{" "}
              {fmt(nextPayoutDate.minimum_payout_amount)} · Hold {nextPayoutDate.payout_hold_days} days
            </p>
          </div>
        ) : null}

        <FinanceBookingPaymentsSection />

        {/* Payouts */}
        {payouts.length > 0 && (
          <div className="bg-white border rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Payout History</h2>
            </div>
            <div className="space-y-4">
              {payouts.map((payout) => (
                <div key={payout.id} className="flex items-center justify-between py-4 border-b last:border-0">
                  <div className="flex-1">
                    <p className="font-medium">
                      Payout Request - {fmt(payout.amount)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Requested: {new Date(payout.requested_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    {payout.notes && (
                      <p className="text-sm text-gray-500 mt-1">{payout.notes}</p>
                    )}
                    {payout.status === "failed" && payout.rejected_at && payout.failure_reason ? (
                      <p className="text-sm text-red-600 mt-1">Reason: {payout.failure_reason}</p>
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
                    {formatPayoutDisplayStatus(payout)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transactions */}
        <div className="provider-card provider-card-padding">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Transaction History</h2>
              {(portalProvider?.locations?.length ?? 0) > 1 && selectedLocationId ? (
                <p className="text-sm text-gray-500 mt-1">
                  Cards and earnings totals use the selected branch. This ledger list uses{" "}
                  <span className="font-medium text-gray-600">transaction_feed=all</span> — payouts and other rows without a
                  single-branch booking can still appear for the whole organization in this date range.
                </p>
              ) : null}
            </div>
          </div>

          {transactions.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="Your transaction history will appear here"
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
              <DialogTitle>Transaction Details</DialogTitle>
              <DialogDescription>
                Detailed information about this transaction
              </DialogDescription>
            </DialogHeader>
            
            {isLoadingDetails ? (
              <div className="py-8 text-center">
                <p className="text-gray-600">Loading transaction details...</p>
              </div>
            ) : selectedTransaction ? (
              <FinanceTransactionDetailBody
                transaction={selectedTransaction}
                transactionDetails={transactionDetails}
                fmt={fmt}
              />
            ) : (
              <div className="py-8 text-center">
                <p className="text-gray-600">No additional details available</p>
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
  const { signedPrimary, primaryClass } = providerFacingLedgerDisplay(transaction);
  const hasNetSplit =
    transaction.net !== undefined && transaction.net !== transaction.amount;

  return (
    <div className="space-y-6 py-4">
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Transaction Overview</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Description:</span>
            <span className="font-medium">{transaction.description}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Date:</span>
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
            <span className="text-gray-600">Status:</span>
            <span className="font-medium">{formatStatusLabel(transaction.status)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Type:</span>
            <span className="font-medium">
              {formatStatusLabel(transaction.transaction_type || transaction.type)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-3">Amount Breakdown</h3>
        <div className="space-y-2">
          {hasNetSplit ? (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600">Gross Amount:</span>
                <span className="font-medium">
                  {fmt(transaction.amount)}
                </span>
              </div>
              {transaction.fees && transaction.fees > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Fees:</span>
                  <span className="font-medium text-red-600">
                    -{fmt(transaction.fees)}
                  </span>
                </div>
              )}
              {transaction.commission && transaction.commission > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Platform Commission:</span>
                  <span className="font-medium text-red-600">
                    -{fmt(transaction.commission)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                <span className="font-semibold">Net Amount:</span>
                <span className={`font-semibold ${primaryClass}`}>
                  {fmt(signedPrimary)}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="font-semibold">Amount:</span>
              <span className={`font-semibold ${primaryClass}`}>
                {fmt(signedPrimary)}
              </span>
            </div>
          )}
        </div>
      </div>

      {transactionDetails && transaction.booking_id ? (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Booking Details</h3>
          <div className="space-y-2">
            {transactionDetails.booking_number && (
              <div className="flex justify-between">
                <span className="text-gray-600">Booking Number:</span>
                <span className="font-medium">{String(transactionDetails.booking_number)}</span>
              </div>
            )}
            {transactionDetails.total_amount && (
              <div className="flex justify-between">
                <span className="text-gray-600">Booking Total:</span>
                <span className="font-medium">{fmt(Number(transactionDetails.total_amount))}</span>
              </div>
            )}
            {transactionDetails.service_fee_amount && Number(transactionDetails.service_fee_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Platform Fee:</span>
                <span className="font-medium">{fmt(Number(transactionDetails.service_fee_amount))}</span>
              </div>
            )}
            {transactionDetails.tax_amount && Number(transactionDetails.tax_amount) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tax (VAT):</span>
                <span className="font-medium">{fmt(Number(transactionDetails.tax_amount))}</span>
              </div>
            )}
            {transactionDetails.travel_fee && Number(transactionDetails.travel_fee) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Travel Fee:</span>
                <span className="font-medium">{fmt(Number(transactionDetails.travel_fee))}</span>
              </div>
            )}
            {transactionDetails.booking_source && (
              <div className="flex justify-between">
                <span className="text-gray-600">Booking Source:</span>
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
