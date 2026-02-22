"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, DollarSign } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Refund {
  id: string;
  booking_id: string;
  transaction_type: string;
  amount: number;
  refund_amount: number | null;
  refund_reference: string | null;
  refund_reason: string | null;
  refunded_at: string | null;
  refunded_by: string | null;
  status: string;
  created_at: string;
  booking: {
    id: string;
    booking_number: string;
    status: string;
    total_amount: number;
    customer: { id: string; full_name: string | null; email: string };
    provider: { id: string; business_name: string };
  };
  refunded_by_user: { id: string; full_name: string | null; email: string } | null;
}

export default function AdminRefunds() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  useEffect(() => {
    loadRefunds();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filter changes

  const loadRefunds = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetcher.get<{
        data: { refunds: Refund[]; statistics: any; pagination: any };
      }>(`/api/admin/refunds?${params.toString()}`);

      setRefunds(response.data.refunds);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load refunds";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessRefund = async () => {
    if (!selectedRefund || !refundAmount || !refundReason) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await fetcher.post(`/api/admin/refunds/${selectedRefund.id}`, {
        refund_amount: parseFloat(refundAmount),
        refund_reason: refundReason,
      });

      toast.success("Refund processed successfully");
      setShowProcessDialog(false);
      setSelectedRefund(null);
      setRefundAmount("");
      setRefundReason("");
      loadRefunds();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to process refund");
    }
  };

  const filteredRefunds = refunds.filter((refund) => {
    const matchesSearch =
      refund.booking?.booking_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      refund.booking?.customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      refund.booking?.customer?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      refund.refund_reference?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const groupedRefunds = {
    all: filteredRefunds,
    success: filteredRefunds.filter((r) => r.status === "success"),
    failed: filteredRefunds.filter((r) => r.status === "failed"),
    pending: filteredRefunds.filter((r) => r.status === "pending"),
    refunded: filteredRefunds.filter((r) => r.status === "refunded"),
    partially_refunded: filteredRefunds.filter((r) => r.status === "partially_refunded"),
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading refunds..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load refunds"
          description={error}
          action={{
            label: "Retry",
            onClick: loadRefunds,
          }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Refunds Management</h1>
            <p className="text-gray-600 mt-1">Process and manage all refunds</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search by booking number, customer, or reference..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="partially_refunded">Partially Refunded</option>
            </select>
          </div>
        </div>

        {/* Refunds List */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All ({groupedRefunds.all.length})</TabsTrigger>
            <TabsTrigger value="refunded">Refunded ({groupedRefunds.refunded.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({groupedRefunds.pending.length})</TabsTrigger>
            <TabsTrigger value="failed">Failed ({groupedRefunds.failed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <RefundList
              refunds={groupedRefunds.all}
              onProcess={(refund) => {
                setSelectedRefund(refund);
                setRefundAmount(refund.amount.toString());
                setShowProcessDialog(true);
              }}
            />
          </TabsContent>
          <TabsContent value="refunded" className="space-y-4">
            <RefundList refunds={groupedRefunds.refunded} onProcess={() => {}} />
          </TabsContent>
          <TabsContent value="pending" className="space-y-4">
            <RefundList
              refunds={groupedRefunds.pending}
              onProcess={(refund) => {
                setSelectedRefund(refund);
                setRefundAmount(refund.amount.toString());
                setShowProcessDialog(true);
              }}
            />
          </TabsContent>
          <TabsContent value="failed" className="space-y-4">
            <RefundList refunds={groupedRefunds.failed} onProcess={() => {}} />
          </TabsContent>
        </Tabs>

        {/* Process Refund Dialog */}
        <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Refund</DialogTitle>
              <DialogDescription>
                Process a refund for this transaction. The refund amount cannot exceed the
                transaction amount.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Refund Amount</Label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Enter refund amount"
                  max={selectedRefund?.amount}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Transaction amount: ${selectedRefund?.amount.toFixed(2)}
                </p>
              </div>
              <div>
                <Label>Refund Reason *</Label>
                <Textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter reason for refund..."
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowProcessDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleProcessRefund}>Process Refund</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

function RefundList({
  refunds,
  onProcess,
}: {
  refunds: Refund[];
  onProcess: (refund: Refund) => void;
}) {
  if (refunds.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg border border-gray-200 text-center">
        <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No refunds found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {refunds.map((refund) => (
        <div key={refund.id} className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Badge
                  variant={
                    refund.status === "refunded"
                      ? "default"
                      : refund.status === "failed"
                      ? "destructive"
                      : refund.status === "pending"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {refund.status}
                </Badge>
                {refund.refund_amount && (
                  <Badge variant="outline">
                    ${refund.refund_amount.toFixed(2)} refunded
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                <span>
                  <strong>Booking:</strong> {refund.booking?.booking_number}
                </span>
                <span>
                  <strong>Amount:</strong> ${refund.amount.toFixed(2)}
                </span>
                <span>
                  <strong>Customer:</strong>{" "}
                  {refund.booking?.customer?.full_name || refund.booking?.customer?.email}
                </span>
                <span>
                  <strong>Provider:</strong> {refund.booking?.provider?.business_name}
                </span>
              </div>
              {refund.refund_reason && (
                <div className="text-sm text-gray-600 mb-2">
                  <strong>Reason:</strong> {refund.refund_reason}
                </div>
              )}
              {refund.refunded_at && (
                <div className="text-sm text-gray-600">
                  <strong>Refunded:</strong> {new Date(refund.refunded_at).toLocaleString()} by{" "}
                  {refund.refunded_by_user?.full_name || refund.refunded_by_user?.email}
                </div>
              )}
            </div>
            {refund.status !== "refunded" && refund.status !== "partially_refunded" && (
              <Button onClick={() => onProcess(refund)}>Process Refund</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
