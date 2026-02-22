"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, AlertCircle } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Dispute {
  id: string;
  booking_id: string;
  reason: string;
  description: string | null;
  opened_by: "customer" | "provider" | "admin";
  status: "open" | "resolved" | "closed";
  opened_at: string;
  resolved_at: string | null;
  resolution: "refund_full" | "refund_partial" | "deny" | null;
  refund_amount: number | null;
  notes: string | null;
  booking: {
    id: string;
    booking_number: string;
    status: string;
    total_amount: number;
    customer: { id: string; full_name: string | null; email: string };
    provider: { id: string; business_name: string; owner_name: string | null };
  };
}

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolution, setResolution] = useState<"refund_full" | "refund_partial" | "deny">("deny");
  const [refundAmount, setRefundAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadDisputes();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filter changes

  const loadDisputes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetcher.get<{
        data: { disputes: Dispute[]; statistics: any; pagination: any };
      }>(`/api/admin/disputes?${params.toString()}`);

      setDisputes(response.data.disputes);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load disputes";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedDispute) return;

    try {
      const updateData: any = {
        status: "resolved",
        resolution,
        notes,
      };

      if (resolution === "refund_full") {
        updateData.refund_amount = selectedDispute.booking.total_amount;
      } else if (resolution === "refund_partial") {
        updateData.refund_amount = parseFloat(refundAmount);
      }

      await fetcher.patch(`/api/admin/disputes/${selectedDispute.id}`, updateData);

      toast.success("Dispute resolved successfully");
      setShowResolveDialog(false);
      setSelectedDispute(null);
      setNotes("");
      setRefundAmount("");
      loadDisputes();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to resolve dispute");
    }
  };

  const filteredDisputes = disputes.filter((dispute) => {
    const matchesSearch =
      dispute.booking?.booking_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dispute.booking?.customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dispute.booking?.customer?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dispute.booking?.provider?.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dispute.reason?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const groupedDisputes = {
    all: filteredDisputes,
    open: filteredDisputes.filter((d) => d.status === "open"),
    resolved: filteredDisputes.filter((d) => d.status === "resolved"),
    closed: filteredDisputes.filter((d) => d.status === "closed"),
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading disputes..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load disputes"
          description={error}
          action={{
            label: "Retry",
            onClick: loadDisputes,
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
            <h1 className="text-3xl font-bold text-gray-900">Disputes & Support</h1>
            <p className="text-gray-600 mt-1">Manage booking disputes and support tickets</p>
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
                  placeholder="Search by booking number, customer, provider, or reason..."
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
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {/* Disputes List */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All ({groupedDisputes.all.length})</TabsTrigger>
            <TabsTrigger value="open">Open ({groupedDisputes.open.length})</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({groupedDisputes.resolved.length})</TabsTrigger>
            <TabsTrigger value="closed">Closed ({groupedDisputes.closed.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <DisputeList
              disputes={groupedDisputes.all}
              onResolve={(dispute) => {
                setSelectedDispute(dispute);
                setShowResolveDialog(true);
              }}
            />
          </TabsContent>
          <TabsContent value="open" className="space-y-4">
            <DisputeList
              disputes={groupedDisputes.open}
              onResolve={(dispute) => {
                setSelectedDispute(dispute);
                setShowResolveDialog(true);
              }}
            />
          </TabsContent>
          <TabsContent value="resolved" className="space-y-4">
            <DisputeList disputes={groupedDisputes.resolved} onResolve={() => {}} />
          </TabsContent>
          <TabsContent value="closed" className="space-y-4">
            <DisputeList disputes={groupedDisputes.closed} onResolve={() => {}} />
          </TabsContent>
        </Tabs>

        {/* Resolve Dialog */}
        <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resolve Dispute</DialogTitle>
              <DialogDescription>
                Choose a resolution for this dispute and add any notes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Resolution</Label>
                <Select value={resolution} onValueChange={(v: any) => setResolution(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="refund_full">Full Refund</SelectItem>
                    <SelectItem value="refund_partial">Partial Refund</SelectItem>
                    <SelectItem value="deny">Deny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {resolution === "refund_partial" && (
                <div>
                  <Label>Refund Amount</Label>
                  <Input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="Enter refund amount"
                    max={selectedDispute?.booking.total_amount}
                  />
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add resolution notes..."
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleResolve}>Resolve</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

function DisputeList({
  disputes,
  onResolve,
}: {
  disputes: Dispute[];
  onResolve: (dispute: Dispute) => void;
}) {
  if (disputes.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg border border-gray-200 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No disputes found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {disputes.map((dispute) => (
        <div key={dispute.id} className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Badge
                  variant={
                    dispute.status === "open"
                      ? "destructive"
                      : dispute.status === "resolved"
                      ? "default"
                      : "secondary"
                  }
                >
                  {dispute.status}
                </Badge>
                <Badge variant="outline">Opened by: {dispute.opened_by}</Badge>
                {dispute.resolution && (
                  <Badge variant="outline">Resolution: {dispute.resolution}</Badge>
                )}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{dispute.reason}</h3>
              {dispute.description && (
                <p className="text-gray-600 mb-3">{dispute.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>
                  <strong>Booking:</strong> {dispute.booking?.booking_number}
                </span>
                <span>
                  <strong>Amount:</strong> ${dispute.booking?.total_amount?.toFixed(2)}
                </span>
                <span>
                  <strong>Customer:</strong>{" "}
                  {dispute.booking?.customer?.full_name || dispute.booking?.customer?.email}
                </span>
                <span>
                  <strong>Provider:</strong> {dispute.booking?.provider?.business_name}
                </span>
                <span>
                  <strong>Opened:</strong> {new Date(dispute.opened_at).toLocaleDateString()}
                </span>
              </div>
              {dispute.refund_amount && (
                <div className="mt-2 text-sm">
                  <strong>Refund Amount:</strong> ${dispute.refund_amount.toFixed(2)}
                </div>
              )}
              {dispute.notes && (
                <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm">
                  <strong>Notes:</strong> {dispute.notes}
                </div>
              )}
            </div>
            {dispute.status === "open" && (
              <Button onClick={() => onResolve(dispute)}>Resolve</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
