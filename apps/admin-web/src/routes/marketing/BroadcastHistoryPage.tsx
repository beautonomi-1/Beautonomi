import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToolbarButtonClass, adminTabButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";

type ChannelFilter = "all" | "push" | "sms" | "email";
type AnnouncementType = "general" | "promotion" | "event" | "news";

type BroadcastRow = {
  id: string;
  channel: string;
  subject?: string;
  message?: string;
  message_preview?: string;
  body?: string;
  title?: string;
  status?: string;
  delivery_status?: string;
  recipient_type?: string;
  recipient_count?: number;
  total_recipients?: number;
  sent_count?: number;
  sent_at?: string;
  created_at?: string;
  notification_id?: string;
  metadata?: Record<string, unknown> | null;
};

type BroadcastDetailEnvelope = {
  data: {
    broadcast: BroadcastRow;
  };
};

type BroadcastEnvelope = {
  data: {
    broadcasts: BroadcastRow[];
    meta: { page: number; limit: number; total: number; has_more: boolean };
  };
};

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  delivered: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  partial: "bg-amber-100 text-amber-800",
  pending: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-800",
};

const ANN_TYPE_COLORS: Record<AnnouncementType, string> = {
  general: "bg-gray-100 text-gray-700",
  promotion: "bg-amber-100 text-amber-700",
  event: "bg-indigo-100 text-indigo-700",
  news: "bg-blue-100 text-blue-700",
};

export function BroadcastHistoryPage() {
  useAdminDocumentTitle("Broadcast History");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const channel = (sp.get("channel") || "all") as ChannelFilter;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const qk = useMemo(() => adminQueryKeys.broadcastHistory(`p=${page}|c=${channel}`), [page, channel]);
  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "25");
      if (channel !== "all") p.set("channel", channel);
      return adminApi.getRawJson<BroadcastEnvelope>(`/api/admin/broadcast/history?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const detailQ = useQuery({
    queryKey: adminQueryKeys.broadcastDetail(expandedId ?? ""),
    queryFn: () =>
      adminApi.getRawJson<BroadcastDetailEnvelope>(
        `/api/admin/broadcast/${encodeURIComponent(expandedId!)}`,
        { timeoutMs: 30_000 },
      ),
    enabled: allowed && !!expandedId,
  });

  const inner = q.data?.data;
  const rows = inner?.broadcasts ?? [];
  const meta = inner?.meta;

  function setChannel(c: ChannelFilter) {
    const n = new URLSearchParams(sp);
    if (c === "all") n.delete("channel"); else n.set("channel", c);
    n.set("page", "1");
    setSp(n, { replace: true });
  }
  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    n.set("page", String(next));
    setSp(n, { replace: true });
  }

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Broadcast history" description="Paginated delivery log" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const detailBroadcast = detailQ.data?.data?.broadcast ?? rows.find((r) => r.id === expandedId) ?? null;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Broadcast history" description="GET /api/admin/broadcast/history" />

      {/* Top nav */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          to={adminSpaTo("/admin/broadcast")}
          className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] transition hover:border-gray-300 hover:bg-gray-50"
        >
          ← Broadcast hub
        </Link>
        <Link
          to={adminSpaTo("/admin/broadcast/compose")}
          className="inline-flex min-h-11 items-center font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
        >
          Compose broadcast
        </Link>
      </div>

      {/* Channel filter */}
      <div className="flex flex-wrap gap-2">
        {(["all", "push", "sms", "email"] as ChannelFilter[]).map((c) => (
          <button key={c} type="button" className={adminTabButtonClass(channel === c)} onClick={() => setChannel(c)}>
            {c === "all" ? "All channels" : c === "push" ? "📣 Push" : c === "sms" ? "💬 SMS" : "✉️ Email"}
          </button>
        ))}
      </div>

      {meta && (
        <AdminPanel>
          <p className="text-sm text-gray-600">
            Page {meta.page} · {meta.total} total
          </p>
        </AdminPanel>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No broadcasts" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Channel</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Subject / Title</AdminTh>
              <AdminTh>Recipients</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Sent at</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const statusStr = String(r.status ?? r.delivery_status ?? "—");
              const statusClass = STATUS_COLORS[statusStr] ?? "bg-gray-100 text-gray-700";
              const subject = String(r.subject ?? r.title ?? r.message_preview ?? r.body ?? "—").slice(0, 80);
              const recipientCount = String(r.recipient_count ?? r.total_recipients ?? r.sent_count ?? "—");
              const meta = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
              const annType = r.channel === "push" ? String(meta.announcement_type ?? "general") as AnnouncementType : null;
              const isExpanded = expandedId === r.id;

              return (
                <Fragment key={r.id}>
                  <tr
                    className={cn("cursor-pointer transition-colors", isExpanded ? "bg-indigo-50" : "hover:bg-gray-50")}
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <AdminTd>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium capitalize text-gray-700">
                        {r.channel}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      {annType ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            ANN_TYPE_COLORS[annType] ?? "bg-gray-100 text-gray-700",
                          )}
                        >
                          {annType}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </AdminTd>
                    <AdminTd className="max-w-xs truncate text-xs text-gray-700">{subject}</AdminTd>
                    <AdminTd className="tabular-nums text-xs">{recipientCount}</AdminTd>
                    <AdminTd>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusClass}`}>{statusStr}</span>
                    </AdminTd>
                    <AdminTd className="text-xs text-gray-500">
                      {String(r.sent_at ?? r.created_at ?? "").slice(0, 16).replace("T", " ")}
                    </AdminTd>
                    <AdminTd>
                      <Link
                        to={adminSpaTo(`/admin/broadcast/compose?from=${encodeURIComponent(r.id)}`)}
                        className="text-xs font-medium text-indigo-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Duplicate
                      </Link>
                    </AdminTd>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-indigo-50">
                      <td colSpan={7} className="px-4 py-4">
                        {detailQ.isLoading ? (
                          <p className="text-xs text-gray-500">Loading…</p>
                        ) : (
                          <div className="space-y-3 text-sm text-gray-800 max-w-2xl">
                            <p>
                              <span className="font-semibold">Recipients:</span>{" "}
                              {detailBroadcast?.recipient_type ?? "—"} ({detailBroadcast?.recipient_count ?? "—"})
                            </p>
                            <p className="whitespace-pre-wrap">
                              <span className="font-semibold">Message:</span>{" "}
                              {detailBroadcast?.message ?? r.message ?? "—"}
                            </p>
                            {detailBroadcast?.metadata &&
                              typeof detailBroadcast.metadata === "object" &&
                              Object.keys(detailBroadcast.metadata).length > 0 && (
                                <div>
                                  {(() => {
                                    const m = detailBroadcast.metadata as Record<string, unknown>;
                                    return (
                                      <div className="space-y-1">
                                        {Boolean(m.media_url) && (
                                          <p>
                                            <span className="font-semibold">Media:</span> {String(m.media_type ?? "")} —{" "}
                                            <a
                                              href={String(m.media_url)}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-indigo-700 underline break-all"
                                            >
                                              {String(m.media_url).slice(0, 80)}
                                            </a>
                                            {m.media_type === "image" && (
                                              <img
                                                src={String(m.media_url)}
                                                alt="Media"
                                                className="mt-1 h-20 w-auto rounded border border-gray-200 object-cover"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                              />
                                            )}
                                          </p>
                                        )}
                                        {Boolean(m.cta_label) && Boolean(m.cta_url) && (
                                          <p>
                                            <span className="font-semibold">CTA:</span> {String(m.cta_label)} →{" "}
                                            <a href={String(m.cta_url)} target="_blank" rel="noreferrer" className="text-indigo-700 underline">
                                              {String(m.cta_url).slice(0, 60)}
                                            </a>
                                          </p>
                                        )}
                                        {Boolean(m.expires_at) && (
                                          <p>
                                            <span className="font-semibold">Expires:</span> {String(m.expires_at)}
                                          </p>
                                        )}
                                        {Boolean(m.deep_link) && (
                                          <p>
                                            <span className="font-semibold">Deep link:</span> {String(m.deep_link)}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-xs text-gray-500 hover:underline">
                                      Raw metadata JSON
                                    </summary>
                                    <pre className="mt-1 rounded-md bg-gray-100 p-2 text-[10px] overflow-x-auto">
                                      {JSON.stringify(detailBroadcast.metadata, null, 2)}
                                    </pre>
                                  </details>
                                </div>
                              )}
                            {detailBroadcast?.notification_id && (
                              <p className="text-xs text-gray-500">
                                OneSignal ID: {detailBroadcast.notification_id}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {meta && (meta.has_more || page > 1) ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={adminToolbarButtonClass(page <= 1)}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(!meta.has_more)}
            disabled={!meta.has_more}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
