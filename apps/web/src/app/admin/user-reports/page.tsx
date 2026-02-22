"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  report_type: string;
  description: string;
  booking_id: string | null;
  status: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  reporter: { id: string; full_name: string | null; email: string } | null;
  reported: { id: string; full_name: string | null; email: string } | null;
}

export default function AdminUserReportsPage() {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedReport, setSelectedReport] = useState<UserReport | null>(null);
  const [resolveAction, setResolveAction] = useState<"resolved" | "dismissed">("resolved");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetcher.get<{ data: { data: UserReport[] } }>(
        `/api/admin/user-reports?${params.toString()}`
      );
      const data = (res as { data?: { data?: UserReport[] } })?.data;
      setReports(Array.isArray(data?.data) ? data.data : []);
    } catch {
      toast.error("Failed to load reports");
      setReports([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filter changes

  const handleResolve = async () => {
    if (!selectedReport) return;
    setSubmitting(true);
    try {
      await fetcher.patch(`/api/admin/user-reports/${selectedReport.id}`, {
        status: resolveAction,
        resolution_notes: resolutionNotes.trim() || undefined,
      });
      toast.success(resolveAction === "resolved" ? "Report resolved" : "Report dismissed");
      setSelectedReport(null);
      setResolutionNotes("");
      loadReports();
    } catch {
      toast.error("Failed to update report");
    } finally {
      setSubmitting(false);
    }
  };

  const openResolve = (report: UserReport, action: "resolved" | "dismissed") => {
    setSelectedReport(report);
    setResolveAction(action);
    setResolutionNotes("");
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString();
  const reportTypeLabel = (t: string) =>
    t === "customer_reported_provider" ? "Customer → Provider" : "Provider → Customer";

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Reports</h1>
            <p className="text-gray-600 mt-1">
              Customer reports about providers and provider reports about customers. Resolve or dismiss.
            </p>
          </div>
          <Button variant="outline" onClick={loadReports} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          <TabsContent value={statusFilter} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#FF0077]" />
              </div>
            ) : reports.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-600">
                No reports found.
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Badge variant="outline" className="mb-2">
                          {reportTypeLabel(r.report_type)}
                        </Badge>
                        <p className="text-sm text-gray-900 font-medium">
                          Reporter: {r.reporter?.full_name || r.reporter?.email || r.reporter_id}
                        </p>
                        <p className="text-sm text-gray-500">
                          Reported: {r.reported?.full_name || r.reported?.email || r.reported_user_id}
                        </p>
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.description}</p>
                        <p className="text-xs text-gray-400 mt-2">{formatDate(r.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            r.status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : r.status === "resolved"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {r.status}
                        </Badge>
                        {r.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-700 border-green-200"
                              onClick={() => openResolve(r, "resolved")}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Resolve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-gray-600"
                              onClick={() => openResolve(r, "dismissed")}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Dismiss
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {r.resolution_notes && (
                      <p className="text-xs text-gray-500 mt-2 border-t pt-2">
                        Resolution: {r.resolution_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {resolveAction === "resolved" ? "Resolve report" : "Dismiss report"}
              </DialogTitle>
              <DialogDescription>
                {resolveAction === "resolved"
                  ? "Add optional notes for your records."
                  : "Optionally add a reason for dismissal."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Resolution notes (optional)</Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g. Contacted both parties, issue resolved."
                rows={3}
                className="resize-none"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedReport(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleResolve} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {resolveAction === "resolved" ? "Resolve" : "Dismiss"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
