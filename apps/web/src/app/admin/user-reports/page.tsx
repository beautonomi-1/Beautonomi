"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
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

interface AdverseSummary {
  total: number;
  adverse: number;
  unique_reporters: number;
  is_flagged: boolean;
}

interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  report_type: string;
  description: string;
  booking_id: string | null;
  status: string;
  resolution_notes: string | null;
  is_adverse_finding: boolean;
  admin_action_taken: string | null;
  resolved_at: string | null;
  created_at: string;
  reporter: { id: string; full_name: string | null; email: string; role?: string } | null;
  reported: { id: string; full_name: string | null; email: string; role?: string } | null;
  adverse_summary: AdverseSummary | null;
}

const PAGE_SIZE = 25;

export default function AdminUserReportsPage() {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [selectedReport, setSelectedReport] = useState<UserReport | null>(null);
  const [resolveAction, setResolveAction] = useState<"resolved" | "dismissed">("resolved");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isAdverseFinding, setIsAdverseFinding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Warn / deduct dialog
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [warnUserId, setWarnUserId] = useState<string | null>(null);
  const [warnUserName, setWarnUserName] = useState("");
  const [warnReason, setWarnReason] = useState("");
  const [warningSubmitting, setWarningSubmitting] = useState(false);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      const offset = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetcher.get<{ data: { data?: UserReport[]; total?: number } }>(
        `/api/admin/user-reports?${params.toString()}`
      );
      const inner = (res as { data?: { data?: UserReport[]; total?: number } })?.data;
      const list = Array.isArray(inner?.data) ? inner.data : [];
      setReports(list);
      setTotal(inner?.total ?? list.length);
    } catch {
      toast.error("Failed to load reports");
      setReports([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResolve = async () => {
    if (!selectedReport) return;
    setSubmitting(true);
    try {
      await fetcher.patch(`/api/admin/user-reports/${selectedReport.id}`, {
        status: resolveAction,
        resolution_notes: resolutionNotes.trim() || undefined,
        is_adverse_finding: resolveAction === "resolved" ? isAdverseFinding : false,
      });
      toast.success(
        resolveAction === "resolved"
          ? isAdverseFinding
            ? "Report resolved with adverse finding"
            : "Report resolved"
          : "Report dismissed"
      );
      setSelectedReport(null);
      setResolutionNotes("");
      setIsAdverseFinding(false);
      loadReports();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to update report");
    } finally {
      setSubmitting(false);
    }
  };

  const openResolve = (report: UserReport, action: "resolved" | "dismissed") => {
    setSelectedReport(report);
    setResolveAction(action);
    setResolutionNotes("");
    setIsAdverseFinding(false);
  };

  const openWarnDialog = (userId: string, name: string) => {
    setWarnUserId(userId);
    setWarnUserName(name);
    setWarnReason("");
    setWarnDialogOpen(true);
  };

  const handleWarn = async () => {
    if (!warnUserId || !warnReason.trim()) return;
    setWarningSubmitting(true);
    try {
      await fetcher.post(`/api/admin/users/${warnUserId}/warn`, {
        reason: warnReason.trim(),
        send_notification: true,
      });
      toast.success("Warning issued successfully");
      setWarnDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to issue warning");
    } finally {
      setWarningSubmitting(false);
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString();
  const reportTypeLabel = (t: string) =>
    t === "customer_reported_provider" ? "Customer \u2192 Provider" : "Provider \u2192 Customer";

  const filtered = search.trim()
    ? reports.filter((r) => {
        const q = search.toLowerCase();
        return (
          (r.reporter?.full_name?.toLowerCase().includes(q)) ||
          (r.reporter?.email?.toLowerCase().includes(q)) ||
          (r.reported?.full_name?.toLowerCase().includes(q)) ||
          (r.reported?.email?.toLowerCase().includes(q)) ||
          (r.description?.toLowerCase().includes(q))
        );
      })
    : reports;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Reports</h1>
            <p className="text-gray-600 mt-1">
              Reports between customers and providers. Mark adverse findings to track problematic users.
            </p>
          </div>
          <Button variant="outline" onClick={loadReports} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Search by name, email, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }} className="w-full">
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
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-600">
                No reports found.
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-lg border bg-white p-4 shadow-sm ${
                      r.adverse_summary?.is_flagged
                        ? "border-red-300 bg-red-50/30"
                        : r.is_adverse_finding
                        ? "border-amber-300"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant="outline">
                            {reportTypeLabel(r.report_type)}
                          </Badge>
                          {r.is_adverse_finding && (
                            <Badge className="bg-red-100 text-red-800 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Adverse Finding
                            </Badge>
                          )}
                          {r.adverse_summary?.is_flagged && (
                            <Badge className="bg-red-600 text-white text-xs animate-pulse">
                              <ShieldAlert className="w-3 h-3 mr-1" />
                              FLAGGED ({r.adverse_summary.adverse} adverse from {r.adverse_summary.unique_reporters} reporters)
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 font-medium">
                          Reporter:{" "}
                          <Link
                            href={`/admin/users/${r.reporter_id}`}
                            className="text-[#FF0077] hover:underline inline-flex items-center gap-0.5"
                          >
                            {r.reporter?.full_name || r.reporter?.email || r.reporter_id}
                            {r.reporter?.role && (
                              <span className="text-xs text-gray-400 ml-1">({r.reporter.role})</span>
                            )}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </p>
                        <p className="text-sm text-gray-500">
                          Reported:{" "}
                          <Link
                            href={`/admin/users/${r.reported_user_id}`}
                            className="text-[#FF0077] hover:underline inline-flex items-center gap-0.5"
                          >
                            {r.reported?.full_name || r.reported?.email || r.reported_user_id}
                            {r.reported?.role && (
                              <span className="text-xs text-gray-400 ml-1">({r.reported.role})</span>
                            )}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                          {r.adverse_summary && r.adverse_summary.total > 0 && (
                            <span className="ml-2 text-xs font-medium text-gray-500">
                              ({r.adverse_summary.total} total reports, {r.adverse_summary.adverse} adverse)
                            </span>
                          )}
                        </p>
                        {r.booking_id && (
                          <p className="text-sm text-gray-600 mt-1">
                            Booking:{" "}
                            <Link
                              href={`/admin/bookings/${r.booking_id}`}
                              className="text-[#FF0077] hover:underline inline-flex items-center gap-0.5"
                            >
                              View booking
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </p>
                        )}
                        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.description}</p>
                        <p className="text-xs text-gray-400 mt-2">{formatDate(r.created_at)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
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
                          <div className="flex items-center gap-2">
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
                          </div>
                        )}
                        {r.adverse_summary && r.adverse_summary.adverse >= 1 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-700 border-red-200"
                            onClick={() =>
                              openWarnDialog(
                                r.reported_user_id,
                                r.reported?.full_name || r.reported?.email || "User"
                              )
                            }
                          >
                            <AlertTriangle className="w-4 h-4 mr-1" />
                            Warn User
                          </Button>
                        )}
                      </div>
                    </div>
                    {r.resolution_notes && (
                      <p className="text-xs text-gray-500 mt-2 border-t pt-2">
                        Resolution: {r.resolution_notes}
                      </p>
                    )}
                    {r.admin_action_taken && (
                      <p className="text-xs text-orange-600 mt-1">
                        Action taken: {r.admin_action_taken.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <span className="text-sm text-gray-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Resolve/Dismiss Dialog */}
        <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {resolveAction === "resolved" ? "Resolve report" : "Dismiss report"}
              </DialogTitle>
              <DialogDescription>
                {resolveAction === "resolved"
                  ? "Investigate and mark findings. If substantiated, check 'Adverse Finding' to count toward the 3-strike flag."
                  : "This report will be dismissed and won't count toward adverse findings."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Resolution notes (optional)</Label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Contacted both parties, issue resolved."
                  rows={3}
                  className="resize-none"
                />
              </div>
              {resolveAction === "resolved" && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                  <input
                    type="checkbox"
                    id="adverseFinding"
                    checked={isAdverseFinding}
                    onChange={(e) => setIsAdverseFinding(e.target.checked)}
                    className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <Label htmlFor="adverseFinding" className="text-red-800 font-medium cursor-pointer">
                      Mark as Adverse Finding
                    </Label>
                    <p className="text-xs text-red-600 mt-0.5">
                      This complaint was substantiated against the reported user.
                      3+ adverse findings from different reporters triggers an automatic flag.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedReport(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleResolve}
                disabled={submitting}
                className={resolveAction === "resolved" && isAdverseFinding ? "bg-red-600 hover:bg-red-700" : ""}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {resolveAction === "resolved"
                  ? isAdverseFinding
                    ? "Resolve with Adverse Finding"
                    : "Resolve"
                  : "Dismiss"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Warn User Dialog */}
        <Dialog open={warnDialogOpen} onOpenChange={setWarnDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue Warning to {warnUserName}</DialogTitle>
              <DialogDescription>
                The user will receive a system notification with your warning. This is logged for audit purposes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Warning reason</Label>
              <Textarea
                value={warnReason}
                onChange={(e) => setWarnReason(e.target.value)}
                placeholder="e.g. Multiple substantiated complaints about service quality..."
                rows={3}
                className="resize-none"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWarnDialogOpen(false)} disabled={warningSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleWarn}
                disabled={warningSubmitting || !warnReason.trim()}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {warningSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Issue Warning
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
