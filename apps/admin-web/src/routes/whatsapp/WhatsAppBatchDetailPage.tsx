import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { Loader2, Pause, Play, XCircle, ArrowLeft, CheckCircle2, Clock, AlertTriangle, Send } from "lucide-react";
import { cn } from "@/lib/cn";

interface Batch {
  id: string;
  status: string;
  total_count: number;
  queued_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  cancelled_count: number;
  pause_reason: string | null;
  created_at: string;
}

interface QueueMsg {
  id: string;
  lead_id: string;
  to_number: string;
  status: string;
  sent_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  retry_count: number;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  queued: { bg: "bg-gray-100", text: "text-gray-700" },
  processing: { bg: "bg-blue-100", text: "text-blue-700" },
  paused: { bg: "bg-amber-100", text: "text-amber-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
  cancelled: { bg: "bg-red-100", text: "text-red-600" },
};

const MSG_DOT: Record<string, string> = {
  queued: "bg-gray-400",
  sending: "bg-blue-400",
  sent: "bg-blue-500",
  delivered: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-gray-300",
  rate_limited: "bg-amber-400",
};

export function WhatsAppBatchDetailPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required for WhatsApp batches."
  );
  const { batchId } = useParams<{ batchId: string }>();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const batchQuery = useQuery({
    queryKey: adminQueryKeys.whatsapp.batchDetail(batchId || ""),
    queryFn: () =>
      adminApi.getJson<{ batch: Batch; messages: QueueMsg[]; meta: { total: number; has_more: boolean } }>(
        `/api/admin/whatsapp/bulk/${batchId}?page=${page}&limit=20`,
      ),
    enabled: allowed && Boolean(batchId),
    refetchInterval: 10000,
  });

  const pauseMutation = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/whatsapp/bulk/${batchId}/pause`),
    onSuccess: () => { adminToast.success("Batch paused."); void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.batchDetail(batchId || "") }); },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const resumeMutation = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/whatsapp/bulk/${batchId}/resume`),
    onSuccess: () => { adminToast.success("Batch resumed."); void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.batchDetail(batchId || "") }); },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/whatsapp/bulk/${batchId}/cancel`),
    onSuccess: () => { adminToast.success("Remaining messages cancelled."); void qc.invalidateQueries({ queryKey: adminQueryKeys.whatsapp.batchDetail(batchId || "") }); },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;

  if (!batchId || batchQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const data = batchQuery.data;
  if (!data) {
    return <p className="py-12 text-center text-sm text-gray-500">Batch not found.</p>;
  }

  const { batch, messages, meta } = data;
  const progress = batch.total_count > 0 ? ((batch.sent_count + batch.delivered_count) / batch.total_count) * 100 : 0;
  const statusStyle = STATUS_STYLES[batch.status] || STATUS_STYLES.queued;

  return (
    <div className="space-y-6">
      <Link
        to={adminSpaTo("/admin/whatsapp/sessions")}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Sessions
      </Link>

      <AdminPageHeader
        title={`Batch ${batchId?.slice(0, 8)}…`}
        description={`Created ${new Date(batch.created_at).toLocaleString()}`}
        actions={
          <div className="flex gap-2">
            {batch.status === "processing" || batch.status === "queued" ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
              >
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : null}
            {batch.status === "paused" ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              >
                <Play className="h-4 w-4" /> Resume
              </button>
            ) : null}
            {["processing", "queued", "paused"].includes(batch.status) ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
                onClick={() => { if (window.confirm("Cancel all remaining messages?")) cancelMutation.mutate(); }}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="h-4 w-4" /> Cancel Remaining
              </button>
            ) : null}
          </div>
        }
      />

      {/* Status banner */}
      <div className={cn("rounded-xl px-4 py-3 text-sm font-medium", statusStyle.bg, statusStyle.text)}>
        Status: {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
        {batch.pause_reason && ` — ${batch.pause_reason}`}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AdminMetricCard label="Queued" value={batch.queued_count} variant="slate" />
        <AdminMetricCard label="Sending" value={0} variant="violet" />
        <AdminMetricCard label="Sent" value={batch.sent_count} variant="violet" />
        <AdminMetricCard label="Delivered" value={batch.delivered_count} variant="emerald" />
        <AdminMetricCard label="Failed" value={batch.failed_count} variant="rose" />
        <AdminMetricCard label="Cancelled" value={batch.cancelled_count} variant="amber" />
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      {/* Messages table */}
      <AdminPanel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Retries</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {messages.map((m) => (
                <tr key={m.id} className={cn(m.status === "failed" && "bg-red-50/50")}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", MSG_DOT[m.status] || "bg-gray-300")} />
                      <span className="text-xs">{m.status}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">{m.to_number}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{m.sent_at ? new Date(m.sent_at).toLocaleTimeString() : "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{m.retry_count}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs text-red-600">{m.failure_reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.total > 20 && (
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-xs text-gray-500">{meta.total} messages</p>
            <div className="flex gap-2">
              <button
                className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40"
                disabled={!meta.has_more}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
