"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Wallet,
  ArrowUpRight,
  Building2,
  CreditCard,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePermissions } from "@/hooks/usePermissions";
import { Lock } from "lucide-react";

interface EarningsData {
  total_earnings: number;
  pending_payouts: number;
  available_balance: number;
  minimum_payout_amount?: number;
  this_month: number;
  last_month: number;
  growth_percentage: number;
}

interface PayoutAccount {
  id: string;
  account_name: string;
  account_number_last4: string;
  bank_name: string | null;
  active: boolean;
  created_at: string;
}

interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  requested_at: string;
  notes?: string | null;
}

export default function FinanceHubPage() {
  const { hasPermission } = usePermissions();
  const canRequestPayout = hasPermission("process_payments");

  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [isRequestingPayout, setIsRequestingPayout] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [financeRes, accountsRes, payoutsRes] = await Promise.all([
        fetcher.get<{ data: { earnings: EarningsData } }>("/api/provider/finance?range=month"),
        fetcher.get<{ data: PayoutAccount[] }>("/api/provider/payout-accounts"),
        fetcher.get<{ data: Payout[] }>("/api/provider/payouts"),
      ]);
      setEarnings(financeRes.data?.earnings ?? null);
      const accts = accountsRes.data || [];
      setAccounts(accts);
      setPayouts(payoutsRes.data || []);
      if (accts.length > 0 && !selectedBankId) {
        setSelectedBankId(accts[0].id);
      }
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : "Failed to load finance data";
      setError(msg);
      console.error("Error loading finance hub:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const primaryAccount = accounts.find((a) => a.active) ?? accounts[0];
  const availableBalance = earnings?.available_balance ?? 0;
  const pendingPayouts = earnings?.pending_payouts ?? 0;
  const minimumPayout = earnings?.minimum_payout_amount ?? 100;

  const handleRequestPayout = async () => {
    const amount = parseFloat(payoutAmount);
    if (!payoutAmount || amount <= 0) {
      toast.error("Please enter a valid payout amount");
      return;
    }
    if (amount < minimumPayout) {
      toast.error(`Minimum payout is ZAR ${minimumPayout.toLocaleString()}`);
      return;
    }
    if (amount > availableBalance) {
      toast.error("Insufficient balance for this payout");
      return;
    }
    if (accounts.length === 0) {
      toast.error("Add a bank account first in Settings → Payout Accounts");
      return;
    }

    try {
      setIsRequestingPayout(true);
      await fetcher.post("/api/provider/payouts", {
        amount,
        notes: payoutNotes || undefined,
        bank_account_id: selectedBankId || primaryAccount?.id || undefined,
      });
      toast.success("Payout request submitted");
      setShowPayoutDialog(false);
      setPayoutAmount("");
      setPayoutNotes("");
      loadData();
    } catch (err) {
      const msg = err instanceof FetchError ? err.message : "Failed to request payout";
      toast.error(msg);
    } finally {
      setIsRequestingPayout(false);
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Finance Hub"
          subtitle="Earnings and payouts"
          breadcrumbs={[
            { label: "Home", href: "/provider/dashboard" },
            { label: "More", href: "/provider/more" },
            { label: "Finance Hub" },
          ]}
        />
        <LoadingTimeout loadingMessage="Loading finance..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Finance Hub"
        subtitle="Available balance, payouts, and bank account"
        breadcrumbs={[
          { label: "Home", href: "/provider/dashboard" },
          { label: "More", href: "/provider/more" },
          { label: "Finance Hub" },
        ]}
      />

      {error && (
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* Available for payout */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Available for payout
          </h2>
          <p className="text-3xl font-semibold text-green-600">
            ZAR {(earnings?.available_balance ?? 0).toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            This is the amount you can request to be paid out to your bank account. Minimum payout: ZAR {minimumPayout.toLocaleString()}.
          </p>
          {pendingPayouts > 0 && (
            <p className="text-sm text-amber-600 mt-2">
              Pending payout requests: ZAR {pendingPayouts.toLocaleString()}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {canRequestPayout ? (
              <Button
                className="bg-[#FF0077] hover:bg-[#D60565]"
                onClick={() => setShowPayoutDialog(true)}
                disabled={availableBalance <= 0 || accounts.length === 0}
              >
                <ArrowUpRight className="w-4 h-4 mr-2" />
                Request Payout
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Lock className="h-4 w-4 flex-shrink-0" />
                <span>You don&apos;t have permission to request payouts. Contact your administrator.</span>
              </div>
            )}
            <Button variant="outline" asChild>
              <Link href="/provider/finance">Full finance & earnings</Link>
            </Button>
          </div>
        </div>

        {/* Bank account — clear which one we pay out to */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payout bank account
          </h2>
          {primaryAccount ? (
            <>
              <p className="text-sm text-gray-600 mb-2">
                Payouts will be sent to this account:
              </p>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF0077]/10 text-[#FF0077]">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{primaryAccount.account_name}</p>
                    <p className="text-sm text-gray-500">
                      ****{primaryAccount.account_number_last4}
                      {primaryAccount.bank_name ? ` · ${primaryAccount.bank_name}` : ""}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Primary
                </span>
              </div>
              {accounts.length > 1 && (
                <p className="text-xs text-gray-500 mt-2">
                  You have {accounts.length} bank accounts. You can choose which to use when requesting a payout.
                </p>
              )}
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link href="/provider/settings/payout-accounts">
                  Manage bank accounts
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <p className="font-medium text-gray-900">No bank account added</p>
                <p className="text-sm text-gray-600 mt-1">
                  Add a bank account to receive payouts. Request payout will be available after you add one.
                </p>
                <Button size="sm" className="mt-3 bg-[#FF0077] hover:bg-[#D60565]" asChild>
                  <Link href="/provider/settings/payout-accounts">Add bank account</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Payout history */}
        {payouts.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Recent payout requests
            </h2>
            <ul className="space-y-3">
              {payouts.slice(0, 10).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="font-medium">
                      {p.currency} {p.amount.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(p.requested_at).toLocaleDateString("en-ZA", {
                        dateStyle: "medium",
                      })}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : p.status === "pending" || p.status === "processing"
                        ? "bg-amber-100 text-amber-800"
                        : p.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="mt-2" asChild>
              <Link href="/provider/finance">View all on Finance page</Link>
            </Button>
          </div>
        )}
      </div>

      {/* Request Payout Dialog (only open when user has permission) */}
      <Dialog open={showPayoutDialog && canRequestPayout} onOpenChange={setShowPayoutDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Payout</DialogTitle>
            <DialogDescription>
              Amount will be sent to your selected bank account. Processing times depend on your bank.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Available for payout</Label>
              <Input
                value={`ZAR ${availableBalance.toLocaleString()}`}
                disabled
                className="mt-1 bg-gray-50"
              />
            </div>
            <div>
              <Label htmlFor="payout-amount">Amount (ZAR) * — min ZAR {minimumPayout.toLocaleString()}</Label>
              <Input
                id="payout-amount"
                type="number"
                min={minimumPayout}
                max={availableBalance}
                step="0.01"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1"
              />
              {payoutAmount && parseFloat(payoutAmount) < minimumPayout && (
                <p className="text-sm text-red-600 mt-1">Below minimum payout (ZAR {minimumPayout.toLocaleString()})</p>
              )}
              {payoutAmount && parseFloat(payoutAmount) > availableBalance && (
                <p className="text-sm text-red-600 mt-1">Amount exceeds available balance</p>
              )}
            </div>
            {accounts.length > 1 && (
              <div>
                <Label>Pay out to</Label>
                <Select
                  value={selectedBankId || primaryAccount?.id}
                  onValueChange={setSelectedBankId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_name} ****{a.account_number_last4}
                        {a.bank_name ? ` (${a.bank_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Payouts will be sent to this account</p>
              </div>
            )}
            <div>
              <Label htmlFor="payout-notes">Notes (optional)</Label>
              <Textarea
                id="payout-notes"
                value={payoutNotes}
                onChange={(e) => setPayoutNotes(e.target.value)}
                placeholder="Any notes for this request"
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPayoutDialog(false);
                setPayoutAmount("");
                setPayoutNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRequestPayout}
              disabled={
                isRequestingPayout ||
                !payoutAmount ||
                parseFloat(payoutAmount) < minimumPayout ||
                parseFloat(payoutAmount) > availableBalance
              }
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isRequestingPayout ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Request Payout"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
