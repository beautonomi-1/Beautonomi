"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Info,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";

interface FinanceSummary {
  service_collected_gross: number;
  service_collected_net: number;
  gateway_fees: number;

  platform_commission_gross: number;
  platform_refund_impact: number;
  platform_commission_net: number;
  platform_take_net: number;

  tips_gross: number;
  taxes_gross: number;

  subscription_collected_gross: number;
  subscription_net: number;
  subscription_gateway_fees: number;
  ads_net: number;
  ads_gross: number;
  ads_gateway_fees: number;
  total_platform_take_net: number;

  provider_earnings: number;
  refunds_gross: number;
  gmv_growth: number;
  gift_card_sales: number;
  membership_sales: number;

  wallet_topup_revenue: number;
  referral_payouts: number;
  total_platform_take_after_referrals: number;

  period: {
    start_date: string | null;
    end_date: string | null;
  };
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  fees: number;
  commission: number;
  net: number;
  created_at: string;
  booking?: {
    id: string;
    booking_number: string;
  };
}

export default function AdminFinance() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50; // Items per page

  useEffect(() => {
    loadFinanceData();
  }, [startDate, endDate, page]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters/page change

  const loadFinanceData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load summary
      const summaryParams = new URLSearchParams();
      if (startDate) summaryParams.set("start_date", startDate);
      if (endDate) summaryParams.set("end_date", endDate);

      const summaryResponse = await fetcher.get<{
        data: FinanceSummary;
        error: null;
      }>(`/api/admin/finance/summary?${summaryParams.toString()}`);

      setSummary(summaryResponse.data);

      // Load transactions
      const txParams = new URLSearchParams();
      if (startDate) txParams.set("start_date", startDate);
      if (endDate) txParams.set("end_date", endDate);
      txParams.set("page", page.toString());
      txParams.set("limit", "50");

      const txResponse = await fetcher.get<{
        data: Transaction[];
        error: null;
        meta: { page: number; limit: number; total: number; has_more: boolean };
      }>(`/api/admin/finance/transactions?${txParams.toString()}`);

      setTransactions(txResponse.data || []);
      if (txResponse.meta) {
        setTotal(txResponse.meta.total);
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message || "Failed to load finance data"
          : "Failed to load finance data";
      setError(errorMessage);
      console.error("Error loading finance data:", err);
      // Set empty arrays on error to prevent crashes
      if (!summary) {
        setTransactions([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

   
  const _handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      
      const response = await fetch(`/api/admin/export/transactions?${params.toString()}`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Export downloaded");
    } catch {
      toast.error("Failed to export data");
    }
  };

  if (isLoading && !summary) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading finance data..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <div>
            <div className="flex items-start gap-2 mb-1 sm:mb-2">
              <h1 className="text-2xl sm:text-3xl font-semibold">Finance Overview</h1>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="mt-1 text-gray-400 hover:text-gray-600 transition-colors">
                    <Info className="w-5 h-5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-96 max-h-[80vh] overflow-y-auto">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Revenue Calculation Guide</h3>
                    
                    <div>
                      <h4 className="font-medium text-xs mb-1">Service Revenue Flow:</h4>
                      <div className="text-xs text-gray-600 space-y-1">
                        <p><strong>1. Gross Amount:</strong> Total amount customer pays (services + addons + travel fees + tips)</p>
                        <p><strong>2. Gateway Fees:</strong> Payment processing fees deducted (e.g., 1.5% + R2.50 per transaction)</p>
                        <p><strong>3. Net Collected:</strong> Gross - Gateway Fees = What actually arrives in your account</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-xs mb-1">Platform Revenue Split:</h4>
                      <div className="text-xs text-gray-600 space-y-1">
                        <p><strong>Commission</strong> = platform fees (the platform&apos;s share of booking revenue).</p>
                        <p><strong>Commission (Gross):</strong> Platform&apos;s % of booking revenue before refunds</p>
                        <p><strong>Refund Impact:</strong> Commission lost on refunded bookings</p>
                        <p><strong>Commission (Net):</strong> Gross Commission - Refund Impact</p>
                        <p><strong>Platform Take (Net):</strong> Commission (Net) - Gateway Fees = Your actual revenue</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-xs mb-1">Provider Earnings:</h4>
                      <div className="text-xs text-gray-600 space-y-1">
                        <p><strong>Provider Share:</strong> Remaining amount after platform commission</p>
                        <p><strong>Formula:</strong> Net Collected - Platform Commission = Provider Earnings</p>
                        <p className="text-gray-500 italic">Note: Gateway fees are deducted from platform revenue, not provider earnings</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-2 rounded border border-blue-200">
                      <p className="text-xs font-medium text-blue-900 mb-1">Example Calculation:</p>
                      <div className="text-xs text-blue-800 space-y-0.5">
                        <p>Booking: R1,000</p>
                        <p>Gateway Fee (1.5%): -R15</p>
                        <p>Net Collected: R985</p>
                        <p>Platform Commission (20%): R197</p>
                        <p>Platform Take: R197 - R15 = R182</p>
                        <p>Provider Earnings: R985 - R197 = R788</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-xs mb-1">True platform financial picture:</h4>
                      <div className="text-xs text-gray-600 space-y-1">
                        <p><strong>Referrals:</strong> Payouts to referrers (wallet credits) are a platform expense and reduce net take.</p>
                        <p><strong>Gift cards:</strong> Sales are platform revenue when sold; redemptions are part of booking GMV (no double count).</p>
                        <p><strong>Wallet:</strong> Top-ups are cash in (revenue); spending from wallet on bookings is already in Services Collected.</p>
                        <p><strong>Total Platform Take (after referrals &amp; wallet):</strong> Commission + Subscriptions + Wallet top-up − Referral payouts = true net platform revenue.</p>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-sm sm:text-base text-gray-600">Platform financial metrics and transactions</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                try {
                  const params = new URLSearchParams();
                  if (startDate) params.set("start_date", startDate);
                  if (endDate) params.set("end_date", endDate);
                  
                  const response = await fetch(`/api/admin/export/finance?${params.toString()}`);
                  if (!response.ok) throw new Error("Export failed");
                  
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `finance-export-${new Date().toISOString().split("T")[0]}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  toast.success("Export downloaded");
                } catch {
                  toast.error("Failed to export financial data");
                }
              }}
              size="sm"
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Date Filters */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <label className="text-xs sm:text-sm font-medium mb-1 block">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm sm:text-base"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs sm:text-sm font-medium mb-1 block">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm sm:text-base"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setPage(1);
              }}
              className="w-full sm:w-auto"
            >
              Clear
            </Button>
          </div>
        </div>

        {error ? (
          <EmptyState
            title="Failed to load finance data"
            description={error}
            action={{ label: "Retry", onClick: loadFinanceData }}
          />
        ) : (
          <>
            {/* Summary Cards */}
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
                <SummaryCard
                  title="Services Collected (Gross)"
                  value={summary.service_collected_gross}
                  icon={<DollarSign className="w-5 h-5" />}
                  trend={summary.gmv_growth}
                  format="currency"
                  infoTooltip="Total amount customers paid for services, addons, travel fees, and tips before any deductions. This is the gross transaction value (GMV)."
                />
                <SummaryCard
                  title="Commission (Gross)"
                  value={summary.platform_commission_gross}
                  icon={<TrendingUp className="w-5 h-5" />}
                  format="currency"
                  infoTooltip="Platform's commission percentage of all booking revenue before accounting for refunds. Calculated as: Gross Revenue × Commission Rate."
                />
                <SummaryCard
                  title="Platform Take (Net)"
                  value={summary.platform_take_net}
                  icon={<DollarSign className="w-5 h-5" />}
                  format="currency"
                  infoTooltip="Your actual platform revenue after deducting gateway fees. Formula: Commission (Net) - Gateway Fees. This is the money that stays with the platform."
                />
                <SummaryCard
                  title="Provider Earnings"
                  value={summary.provider_earnings}
                  icon={<DollarSign className="w-5 h-5" />}
                  format="currency"
                  infoTooltip="Amount providers receive after platform commission is deducted. Formula: Net Collected - Platform Commission. Gateway fees do not affect provider earnings."
                />
              </div>
            )}

            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
                <SummaryCard
                  title="Gateway Fees"
                  value={summary.gateway_fees}
                  icon={<TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="Total payment processing fees charged by payment gateways (Paystack, Stripe, etc.). These fees are deducted from platform revenue, reducing your net take. Calculated based on your fee configurations."
                />
                <SummaryCard
                  title="Refunds (Gross)"
                  value={summary.refunds_gross}
                  icon={<TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="Total amount refunded to customers in the period (gross refund value)."
                />
                <SummaryCard
                  title="Gift Card Sales"
                  value={summary.gift_card_sales}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="Revenue from gift card purchases (recorded in finance ledger when customer buys a card). Redemptions are part of booking GMV."
                />
                <SummaryCard
                  title="Membership Sales"
                  value={summary.membership_sales}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="Revenue from membership purchases (one-time or recurring)."
                />
                <SummaryCard
                  title="Wallet Top-up Revenue"
                  value={summary.wallet_topup_revenue ?? 0}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="Cash received when customers top up their wallet balance (Paystack). When they spend wallet on bookings, that is already included in Services Collected."
                />
                <SummaryCard
                  title="Referral Payouts"
                  value={summary.referral_payouts ?? 0}
                  icon={<TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="Total amount paid out to referrers (wallet credits when referred users complete a qualifying booking). This is a platform expense."
                />
              </div>
            )}

            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
                <SummaryCard
                  title="Subscription Revenue (Net)"
                  value={summary.subscription_net}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                />
                <SummaryCard
                  title="Ads Revenue (Net)"
                  value={summary.ads_net ?? 0}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="Provider pre-pay for ad campaign budget. Platform receives this when providers fund campaigns."
                />
                <SummaryCard
                  title="Subscription Fees (Gross)"
                  value={summary.subscription_collected_gross}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                />
                <SummaryCard
                  title="Tips (Gross)"
                  value={summary.tips_gross}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                />
                <SummaryCard
                  title="Taxes (Gross)"
                  value={summary.taxes_gross}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                />
              </div>
            )}

            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
                <SummaryCard
                  title="Total Platform Take (Net)"
                  value={summary.total_platform_take_net}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="Commission (net) + Subscription revenue + Ads revenue, before wallet top-up and referral payouts. Use the card below for true platform net."
                />
                <SummaryCard
                  title="Total Platform Take (after referrals & wallet)"
                  value={summary.total_platform_take_after_referrals ?? summary.total_platform_take_net}
                  icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
                  format="currency"
                  infoTooltip="True platform net: Commission + Subscriptions + Wallet top-up revenue − Referral payouts. This is the full financial picture including gift-card-style revenue and referral expense."
                />
              </div>
            )}

            {/* Transactions Table */}
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
              <div className="px-3 sm:px-6 py-3 sm:py-4 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <h2 className="text-base sm:text-lg font-semibold">Transactions</h2>
                <div className="text-xs sm:text-sm text-gray-600">
                  {total} total transactions
                </div>
              </div>
              
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Date
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Fees
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Net
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Booking
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 lg:px-6 py-8 text-center text-gray-500">
                          No transactions found
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                            {tx.transaction_type}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            R {tx.amount.toLocaleString()}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            R {tx.fees.toLocaleString()}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            R {tx.net.toLocaleString()}
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {tx.booking?.booking_number || "N/A"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden">
                {transactions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">
                    No transactions found
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-gray-900 capitalize">
                                {tx.transaction_type}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </div>
                            {tx.booking?.booking_number && (
                              <div className="text-xs text-gray-500 mt-1">
                                Booking: {tx.booking.booking_number}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-gray-900">
                              R {tx.net.toLocaleString()}
                            </div>
                            {tx.fees > 0 && (
                              <div className="text-xs text-gray-500">
                                Fees: R {tx.fees.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                        {tx.amount !== tx.net && (
                          <div className="text-xs text-gray-500 pt-1 border-t">
                            Gross: R {tx.amount.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {total > limit && (
                <div className="px-3 sm:px-6 py-3 sm:py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
                  <div className="text-xs sm:text-sm text-gray-700 text-center sm:text-left">
                    Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} transactions
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={total <= page * limit}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </RoleGuard>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  trend,
  format = "number",
  infoTooltip,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend?: number;
  format?: "number" | "currency";
  infoTooltip?: string;
}) {
  const formattedValue =
    format === "currency" ? `R ${value.toLocaleString()}` : value.toLocaleString();

  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="p-2 bg-gray-100 rounded-lg text-gray-600">{icon}</div>
        <div className="flex items-center gap-2">
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs sm:text-sm ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
              {trend >= 0 ? (
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
              ) : (
                <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
              )}
              {Math.abs(trend).toFixed(1)}%
            </div>
          )}
          {infoTooltip && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-gray-400 hover:text-gray-600 transition-colors">
                  <Info className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <p className="text-xs text-gray-600">{infoTooltip}</p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <h3 className="text-xl sm:text-2xl font-semibold mb-1 break-words">{formattedValue}</h3>
      <p className="text-xs sm:text-sm text-gray-600 leading-tight">{title}</p>
    </div>
  );
}
