"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Payout {
  id: string;
  provider_id: string;
  amount: number;
  status: "pending" | "processing" | "completed" | "failed";
  scheduled_at: string;
  processed_at: string | null;
  failure_reason: string | null;
  transfer_code?: string | null;
  payout_provider?: string | null;
  recipient_code?: string | null;
  provider?: {
    id: string;
    business_name: string;
    slug: string;
  };
  bank_account?: {
    account_name: string;
    account_number_last4: string;
    bank_name: string | null;
    bank_code: string;
  } | null;
}

export default function AdminPayouts() {
  const searchParams = useSearchParams();
  const providerIdFromUrl = searchParams.get("provider_id");
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [showMarkFailedDialog, setShowMarkFailedDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [failureReason, setFailureReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadPayouts();
  }, [statusFilter, page, providerIdFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters/pagination change

  const loadPayouts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (providerIdFromUrl) params.set("provider_id", providerIdFromUrl);
      params.set("page", page.toString());
      params.set("limit", "50");

      const response = await fetcher.get<{
        data: Payout[];
        error: null;
        meta: { page: number; limit: number; total: number; has_more: boolean };
      }>(`/api/admin/payouts?${params.toString()}`);

      setPayouts(response.data || []);
      if (response.meta) {
        setTotal(response.meta.total);
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load payouts";
      setError(errorMessage);
      console.error("Error loading payouts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPaid = async (payoutId: string) => {
    if (!confirm("Mark this payout as paid?")) return;

    try {
      await fetcher.post(`/api/admin/payouts/${payoutId}/mark-paid`);
      toast.success("Payout marked as paid");
      loadPayouts();
    } catch {
      toast.error("Failed to update payout");
    }
  };

  const handleInitiateTransfer = async (payoutId: string) => {
    if (!confirm("Initiate Paystack transfer for this payout now?")) return;
    try {
      await fetcher.post(`/api/admin/payouts/${payoutId}/initiate-transfer`, {});
      toast.success("Transfer initiated");
      loadPayouts();
    } catch {
      toast.error("Failed to initiate transfer");
    }
  };

  const handleApprove = async (payoutId: string) => {
    try {
      await fetcher.post(`/api/admin/payouts/${payoutId}/approve`, {});
      toast.success("Payout approved successfully");
      loadPayouts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve payout");
    }
  };

  const handleReject = async () => {
    if (!selectedPayout || !rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    try {
      await fetcher.post(`/api/admin/payouts/${selectedPayout.id}/reject`, {
        reason: rejectReason,
      });
      toast.success("Payout rejected successfully");
      setShowRejectDialog(false);
      setRejectReason("");
      setSelectedPayout(null);
      loadPayouts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject payout");
    }
  };

  const handleMarkFailed = async () => {
    if (!selectedPayout || !failureReason.trim()) {
      toast.error("Please provide a failure reason");
      return;
    }

    try {
      await fetcher.post(`/api/admin/payouts/${selectedPayout.id}/mark-failed`, {
        failure_reason: failureReason,
      });
      toast.success("Payout marked as failed");
      setShowMarkFailedDialog(false);
      setFailureReason("");
      setSelectedPayout(null);
      loadPayouts();
    } catch {
      toast.error("Failed to update payout");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case "processing":
        return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
  };

  if (isLoading && payouts.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading payouts..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-1 sm:mb-2">Payout Management</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Manage provider payout queue. Provider payouts are paid to their linked bank account. Customer refunds are processed via payments/refunds, not this queue.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-4 sm:mb-6">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 sm:px-4 py-2 text-sm sm:text-base border rounded-md bg-white w-full sm:w-auto"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Payouts Table */}
        {error ? (
          <EmptyState
            title="Failed to load payouts"
            description={error}
            action={{ label: "Retry", onClick: loadPayouts }}
          />
        ) : payouts.length === 0 ? (
          <EmptyState title="No payouts found" description="No payouts match your filters" />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white border rounded-lg overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Provider
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Scheduled
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Processed
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payouts.map((payout) => (
                      <tr key={payout.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 lg:px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {payout.provider?.business_name || "Unknown"}
                          </div>
                          {payout.bank_account && (
                            <div className="text-xs text-gray-500 mt-1">
                              {payout.bank_account.account_name} • {payout.bank_account.bank_name || "Bank"} • •••• {payout.bank_account.account_number_last4}
                            </div>
                          )}
                          {!payout.bank_account && payout.status === "pending" && (
                            <div className="text-xs text-amber-600 mt-1">
                              ⚠️ No bank account configured
                            </div>
                          )}
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ZAR {payout.amount.toLocaleString()}
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap">{getStatusBadge(payout.status)}</td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(payout.scheduled_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {payout.processed_at
                            ? new Date(payout.processed_at).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex flex-wrap gap-2">
                            {payout.status === "pending" ? (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => handleApprove(payout.id)}
                                >
                                  <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setSelectedPayout(payout);
                                    setShowRejectDialog(true);
                                  }}
                                >
                                  <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleInitiateTransfer(payout.id)}
                                >
                                  <Wallet className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  Initiate
                                </Button>
                              </>
                            ) : payout.status === "processing" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkPaid(payout.id)}
                                >
                                  <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  Mark Paid
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedPayout(payout);
                                    setShowMarkFailedDialog(true);
                                  }}
                                >
                                  <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  Mark Failed
                                </Button>
                              </>
                            ) : null}
                          </div>
                          {payout.failure_reason && (
                            <div className="text-xs text-red-600 mt-1 max-w-xs truncate">
                              {payout.failure_reason}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-sm sm:text-base truncate">
                          {payout.provider?.business_name || "Unknown Provider"}
                        </h3>
                        {getStatusBadge(payout.status)}
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                        ZAR {payout.amount.toLocaleString()}
                      </div>
                      {payout.bank_account ? (
                        <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded mb-2">
                          <div className="font-medium">{payout.bank_account.account_name}</div>
                          <div>{payout.bank_account.bank_name || "Bank"} • •••• {payout.bank_account.account_number_last4}</div>
                        </div>
                      ) : payout.status === "pending" ? (
                        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded mb-2">
                          ⚠️ No bank account configured
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Scheduled:
                      </span>
                      <span className="font-medium">
                        {new Date(payout.scheduled_at).toLocaleDateString()}
                      </span>
                    </div>
                    {payout.processed_at && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-gray-500 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Processed:
                        </span>
                        <span className="font-medium">
                          {new Date(payout.processed_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {payout.failure_reason && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        <strong>Failure Reason:</strong> {payout.failure_reason}
                      </div>
                    )}
                  </div>

                  {payout.status === "pending" && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <Button
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm"
                        onClick={() => handleApprove(payout.id)}
                      >
                        <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setSelectedPayout(payout);
                          setShowRejectDialog(true);
                        }}
                        className="w-full text-xs sm:text-sm"
                      >
                        <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInitiateTransfer(payout.id)}
                        className="w-full text-xs sm:text-sm"
                      >
                        <Wallet className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                        Initiate Transfer
                      </Button>
                    </div>
                  )}
                  {payout.status === "processing" && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkPaid(payout.id)}
                          className="flex-1 text-xs sm:text-sm"
                        >
                          <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Mark Paid
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedPayout(payout);
                            setShowMarkFailedDialog(true);
                          }}
                          className="flex-1 text-xs sm:text-sm"
                        >
                          <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Mark Failed
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {total > 50 && (
              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
                <div className="text-xs sm:text-sm text-gray-700 text-center sm:text-left">
                  Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, total)} of {total} payouts
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
                    disabled={total <= page * 50}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Reject Payout</DialogTitle>
              <DialogDescription className="text-sm sm:text-base">
                Provide a reason for rejecting this payout request.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm sm:text-base font-medium mb-2 block">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-3 text-sm sm:text-base border rounded-md min-h-[100px] resize-none"
                placeholder="e.g., Insufficient balance, invalid account details..."
                required
              />
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason("");
                  setSelectedPayout(null);
                }}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700"
                disabled={!rejectReason.trim()}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject Payout
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark Failed Dialog */}
        <Dialog open={showMarkFailedDialog} onOpenChange={setShowMarkFailedDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Mark Payout as Failed</DialogTitle>
              <DialogDescription className="text-sm sm:text-base">
                Provide a reason for marking this payout as failed.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="text-sm sm:text-base font-medium mb-2 block">
                Failure Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                className="w-full p-3 text-sm sm:text-base border rounded-md min-h-[100px] resize-none"
                placeholder="e.g., Invalid bank account, insufficient funds..."
                required
              />
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setShowMarkFailedDialog(false);
                  setFailureReason("");
                  setSelectedPayout(null);
                }}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleMarkFailed}
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700"
                disabled={!failureReason.trim()}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Mark as Failed
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
