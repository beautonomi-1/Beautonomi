"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DollarSign, TrendingUp, Calendar, Download, ArrowUpRight, FileText } from "lucide-react";
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

interface EarningsData {
  total_earnings: number;
  pending_payouts: number;
  available_balance: number;
  minimum_payout_amount?: number;
  this_month: number;
  last_month: number;
  growth_percentage: number;
  bookings_earnings_total?: number;
  gift_card_sales_this_period?: number;
  membership_sales_this_period?: number;
  travel_fees_total?: number;
  travel_fees_this_period?: number;
  refunds_total?: number;
}

interface Transaction {
  id: string;
  booking_id?: string | null;
  transaction_type?: string;
  type: "booking" | "payout" | "refund";
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
}

interface PayoutAccount {
  id: string;
  account_name: string;
  account_number_last4: string;
  bank_name: string | null;
  active: boolean;
}

export default function ProviderFinance() {
  const { selectedLocationId } = useProviderPortal();
  const { hasPermission } = usePermissions();
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
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    loadFinanceData();
    loadPayouts();
    loadPayoutAccounts();
  }, [dateRange, selectedLocationId]);

  const loadFinanceData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = selectedLocationId
        ? `/api/provider/finance?range=${dateRange}&location_id=${selectedLocationId}`
        : `/api/provider/finance?range=${dateRange}`;
      
      const response = await fetcher.get<{
        data: { earnings: EarningsData; transactions: Transaction[] };
      }>(url);
      setEarnings(response.data.earnings);
      setTransactions(response.data.transactions);
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
      if (accts.length > 0 && !selectedBankId) setSelectedBankId(accts[0].id);
    } catch (err) {
      console.warn("Failed to load payout accounts:", err);
    }
  };

  const handleRequestPayout = async () => {
    if (!payoutAmount || parseFloat(payoutAmount) <= 0) {
      toast.error("Please enter a valid payout amount");
      return;
    }

    const minimumPayout = earnings?.minimum_payout_amount ?? 100;
    if (parseFloat(payoutAmount) < minimumPayout) {
      toast.error(`Minimum payout is ZAR ${minimumPayout.toLocaleString()}`);
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

  const handleExport = () => {
    try {
      const url = `/api/provider/finance/export?range=${encodeURIComponent(dateRange)}`;
      // Browser will download due to Content-Disposition on the response.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("Failed to start export");
    }
  };

  const handleTransactionClick = async (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setShowTransactionDialog(true);
    setIsLoadingDetails(true);
    setTransactionDetails(null);
    
    try {
      // If transaction has a booking_id, fetch booking details
      if (transaction.booking_id) {
        try {
          const response = await fetcher.get<{ data: unknown }>(`/api/provider/bookings/${transaction.booking_id}`);
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
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading finance data..." />
      </div>
    );
  }

  if (error || !earnings) {
    return (
      <div className="container mx-auto px-4 py-8">
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
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Finance & Earnings</h1>
            <p className="text-gray-600">Track your revenue and earnings</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 md:mt-0 items-center">
            {canRequestPayout ? (
            <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
              <DialogTrigger asChild>
                <Button className="bg-[#FF0077] hover:bg-[#D60565]">
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  Request Payout
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Payout</DialogTitle>
                  <DialogDescription>
                    Request a payout from your available balance
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="available-balance">Available Balance</Label>
                    <Input
                      id="available-balance"
                      value={`ZAR ${earnings.available_balance.toLocaleString()}`}
                      disabled
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="payout-amount">Payout Amount (ZAR) * — min ZAR {(earnings.minimum_payout_amount ?? 100).toLocaleString()}</Label>
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
                        Below minimum payout (ZAR {(earnings.minimum_payout_amount ?? 100).toLocaleString()})
                      </p>
                    )}
                    {payoutAmount && parseFloat(payoutAmount) > earnings.available_balance && (
                      <p className="text-sm text-red-600 mt-1">
                        Amount exceeds available balance
                      </p>
                    )}
                  </div>
                  {payoutAccounts.length === 0 && (
                    <p className="text-sm text-amber-600">
                      Add a bank account in Settings → Payout Accounts to receive payouts.
                    </p>
                  )}
                  {payoutAccounts.length > 1 && (
                    <div>
                      <Label>Pay out to</Label>
                      <select
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        value={selectedBankId || payoutAccounts[0]?.id}
                        onChange={(e) => setSelectedBankId(e.target.value)}
                      >
                        {payoutAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_name} ****{a.account_number_last4}
                            {a.bank_name ? ` (${a.bank_name})` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Payouts will be sent to this account</p>
                    </div>
                  )}
                  {payoutAccounts.length === 1 && (
                    <p className="text-xs text-gray-500">
                      Payout will be sent to {payoutAccounts[0].account_name} ****{payoutAccounts[0].account_number_last4}.
                    </p>
                  )}
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
                      setPayoutAmount("");
                      setPayoutNotes("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRequestPayout}
                    disabled={isRequestingPayout || payoutAccounts.length === 0 || !payoutAmount || parseFloat(payoutAmount) < (earnings.minimum_payout_amount ?? 100) || parseFloat(payoutAmount) > earnings.available_balance}
                    className="bg-[#FF0077] hover:bg-[#D60565]"
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
        </div>

        {/* Earnings Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Total Earnings</p>
              <DollarSign className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-semibold">
              ZAR {earnings.total_earnings.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Available Balance</p>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-semibold text-green-600">
              ZAR {earnings.available_balance.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Pending Payouts</p>
              <Calendar className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-3xl font-semibold text-yellow-600">
              ZAR {earnings.pending_payouts.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Revenue Streams */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white border rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">Service Earnings</p>
            <p className="text-2xl font-semibold">
              ZAR {(earnings.bookings_earnings_total || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">Travel Fees</p>
            <p className="text-2xl font-semibold text-purple-600">
              ZAR {(earnings.travel_fees_this_period || 0).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">From at-home bookings</p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">Gift Card Sales</p>
            <p className="text-2xl font-semibold">
              ZAR {(earnings.gift_card_sales_this_period || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">Membership Sales</p>
            <p className="text-2xl font-semibold">
              ZAR {(earnings.membership_sales_this_period || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">Refunds</p>
            <p className="text-2xl font-semibold text-red-600">
              ZAR {(earnings.refunds_total || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Monthly Comparison */}
        <div className="bg-white border rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Monthly Earnings</h2>
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
              <p className="text-sm text-gray-600 mb-1">This Month</p>
              <p className="text-2xl font-semibold">
                ZAR {earnings.this_month.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Last Month</p>
              <p className="text-2xl font-semibold">
                ZAR {earnings.last_month.toLocaleString()}
              </p>
              <p className="text-sm text-green-600 mt-1">
                +{earnings.growth_percentage}% growth
              </p>
            </div>
          </div>
        </div>

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
                      Payout Request - {payout.currency} {payout.amount.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Requested: {new Date(payout.requested_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    {payout.notes && (
                      <p className="text-sm text-gray-500 mt-1">{payout.notes}</p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      payout.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : payout.status === "pending" || payout.status === "processing"
                        ? "bg-yellow-100 text-yellow-800"
                        : payout.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {payout.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transactions */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Transaction History</h2>
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
              <div className="space-y-6 py-4">
                {/* Transaction Overview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Transaction Overview</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Description:</span>
                      <span className="font-medium">{selectedTransaction.description}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Date:</span>
                      <span className="font-medium">
                        {new Date(selectedTransaction.date).toLocaleDateString("en-US", {
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
                      <span className="font-medium capitalize">{selectedTransaction.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Type:</span>
                      <span className="font-medium capitalize">{selectedTransaction.transaction_type?.replace("_", " ") || selectedTransaction.type}</span>
                    </div>
                  </div>
                </div>

                {/* Amount Breakdown */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Amount Breakdown</h3>
                  <div className="space-y-2">
                    {selectedTransaction.net !== undefined && selectedTransaction.net !== selectedTransaction.amount && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gross Amount:</span>
                          <span className="font-medium">
                            {selectedTransaction.currency} {selectedTransaction.amount.toFixed(2)}
                          </span>
                        </div>
                        {selectedTransaction.fees && selectedTransaction.fees > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Fees:</span>
                            <span className="font-medium text-red-600">
                              -{selectedTransaction.currency} {selectedTransaction.fees.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {selectedTransaction.commission && selectedTransaction.commission > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Platform Commission:</span>
                            <span className="font-medium text-red-600">
                              -{selectedTransaction.currency} {selectedTransaction.commission.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between pt-2 border-t">
                          <span className="font-semibold">Net Amount:</span>
                          <span className="font-semibold text-green-600">
                            {selectedTransaction.currency} {selectedTransaction.net.toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                    {(!selectedTransaction.net || selectedTransaction.net === selectedTransaction.amount) && (
                      <div className="flex justify-between">
                        <span className="font-semibold">Amount:</span>
                        <span className="font-semibold text-green-600">
                          {selectedTransaction.currency} {selectedTransaction.amount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Booking Details (if available) */}
                {transactionDetails && selectedTransaction.booking_id && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Booking Details</h3>
                    <div className="space-y-2">
                      {transactionDetails.booking_number && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Booking Number:</span>
                          <span className="font-medium">{transactionDetails.booking_number}</span>
                        </div>
                      )}
                      {transactionDetails.total_amount && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Booking Total:</span>
                          <span className="font-medium">
                            ZAR {Number(transactionDetails.total_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {transactionDetails.service_fee_amount && Number(transactionDetails.service_fee_amount) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Service Fee:</span>
                          <span className="font-medium">
                            ZAR {Number(transactionDetails.service_fee_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {transactionDetails.tax_amount && Number(transactionDetails.tax_amount) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Tax (VAT):</span>
                          <span className="font-medium">
                            ZAR {Number(transactionDetails.tax_amount).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {transactionDetails.travel_fee && Number(transactionDetails.travel_fee) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Travel Fee:</span>
                          <span className="font-medium">
                            ZAR {Number(transactionDetails.travel_fee).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {transactionDetails.booking_source && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Booking Source:</span>
                          <span className="font-medium capitalize">
                            {transactionDetails.booking_source.replace("_", " ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
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

function TransactionRow({ transaction, onClick }: { transaction: Transaction; onClick: () => void }) {
  const getTypeColor = () => {
    switch (transaction.type) {
      case "booking":
        return "text-green-600";
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
          {new Date(transaction.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <p className={`font-semibold ${getTypeColor()}`}>
          {transaction.type === "payout" || transaction.type === "refund"
            ? "-"
            : "+"}
          {transaction.currency} {transaction.amount.toFixed(2)}
        </p>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor()}`}
        >
          {transaction.status}
        </span>
      </div>
    </div>
  );
}
