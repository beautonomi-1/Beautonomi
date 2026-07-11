import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { CpBack } from "./cpShared";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { cn } from "@/lib/cn";

type SafetyEventRow = {
  id: string;
  user_id: string;
  booking_id: string | null;
  event_type: string;
  status: string;
  aura_request_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
};

type SafetyLogsPayload = {
  data: SafetyEventRow[];
  total: number;
  limit: number;
  offset: number;
};

const LIMIT = 40;

const STATUS_BADGE: Record<string, string> = {
  created: "bg-rose-100 text-rose-900",
  dispatched: "bg-amber-100 text-amber-900",
  resolved: "bg-emerald-100 text-emerald-900",
  failed: "bg-gray-200 text-gray-800",
};

const TYPE_BADGE: Record<string, string> = {
  panic: "bg-red-100 text-red-900 font-medium",
  check_in: "bg-sky-100 text-sky-900",
  escalation: "bg-violet-100 text-violet-900",
};

function sinceIsoPreset(preset: string): string | undefined {
  if (preset === "all") return undefined;
  const now = Date.now();
  if (preset === "24h") return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (preset === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (preset === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return undefined;
}

export function CpSafetyLogsPage() {
  useAdminDocumentTitle("Safety logs");
  const { denied } = useSuperadminPage("Control plane is superadmin-only.");
  const qc = useQueryClient();

  const [eventType, setEventType] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | string>("open");
  const [sincePreset, setSincePreset] = useState<"all" | "24h" | "7d" | "30d">("7d");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const querySig = useMemo(() => {
    const statusParam =
      statusFilter === "all" ? "" : statusFilter === "open" ? "created,dispatched" : statusFilter;
    const since = sinceIsoPreset(sincePreset);
    return `t=${eventType}|s=${statusParam}|since=${since ?? ""}|p=${page}`;
  }, [eventType, statusFilter, sincePreset, page]);

  const listQuery = useQuery({
    queryKey: adminQueryKeys.safetyLogs(querySig),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(LIMIT));
      params.set("offset", String(page * LIMIT));
      if (eventType) params.set("event_type", eventType);
      if (statusFilter === "open") params.set("status", "created,dispatched");
      else if (statusFilter !== "all") params.set("status", statusFilter);
      const since = sinceIsoPreset(sincePreset);
      if (since) params.set("since", since);
      return adminApi.getJson<SafetyLogsPayload>(`/api/admin/safety/logs?${params}`, { timeoutMs: 60_000 });
    },
    enabled: !denied,
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      await adminApi.patchJson<{ id: string; status: string }>(
        `/api/admin/safety/logs/${encodeURIComponent(id)}`,
        { status: "resolved" },
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [...adminQueryKeys.root, "safety-logs"] });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.activity() });
      adminToast.success("Marked resolved");
    },
    onError: (e: Error) => adminToast.error(e.message || "Could not update event"),
  });

  if (denied) return denied;

  const rows = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const canPrev = page > 0;
  const canNext = (page + 1) * LIMIT < total;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Safety logs"
        description="Safety incidents raised from the apps (currently panic-button events; check-in and escalation types are reserved). Use tenant vs global scope in the header to switch all-tenants vs one tenant. Mark resolved after you have triaged Aura / field response."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Event type
          <select
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-900"
            value={eventType || "all"}
            onChange={(e) => {
              setPage(0);
              setEventType(e.target.value === "all" ? "" : e.target.value);
            }}
          >
            <option value="all">All</option>
            <option value="panic">Panic</option>
            <option value="check_in">Check-in</option>
            <option value="escalation">Escalation</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Status
          <select
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-900"
            value={statusFilter}
            onChange={(e) => {
              setPage(0);
              setStatusFilter(e.target.value);
            }}
          >
            <option value="open">Open (needs review)</option>
            <option value="all">All statuses</option>
            <option value="resolved">Resolved</option>
            <option value="failed">Failed</option>
            <option value="created">Created only</option>
            <option value="dispatched">Dispatched only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Time range
          <select
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-900"
            value={sincePreset}
            onChange={(e) => {
              setPage(0);
              setSincePreset(e.target.value as typeof sincePreset);
            }}
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </label>
      </div>

      {listQuery.isLoading ? (
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      ) : listQuery.isError ? (
        <AdminRetryBlock
          message={listQuery.error instanceof Error ? listQuery.error.message : "Could not load safety logs"}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <AdminPanel>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium text-gray-900">{rows.length}</span> of{" "}
              <span className="font-medium text-gray-900">{total}</span> matching events
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                disabled={!canNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="No safety events"
              description="No panic, check-in, or escalation events match the current filters. Try widening the time range or clearing the status filter."
            />
          ) : (
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh className="w-8" />
                  <AdminTh>When</AdminTh>
                  <AdminTh>Type</AdminTh>
                  <AdminTh>Status</AdminTh>
                  <AdminTh>User</AdminTh>
                  <AdminTh>Booking</AdminTh>
                  <AdminTh>Aura</AdminTh>
                  <AdminTh className="text-right">Actions</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {rows.map((r) => {
                  const open = r.status === "created" || r.status === "dispatched";
                  const isExpanded = expandedId === r.id;
                  const metaStr =
                    r.metadata && Object.keys(r.metadata).length > 0
                      ? JSON.stringify(r.metadata, null, 2)
                      : null;
                  return (
                    <Fragment key={r.id}>
                      <tr className="align-top">
                        <AdminTd className="pt-3">
                          <button
                            type="button"
                            className="text-gray-500 hover:text-gray-800"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Collapse details" : "Expand details"}
                            onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </AdminTd>
                        <AdminTd className="whitespace-nowrap text-xs text-gray-700">
                          {new Date(r.created_at).toLocaleString()}
                        </AdminTd>
                        <AdminTd>
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs",
                              TYPE_BADGE[r.event_type] ?? "bg-gray-100 text-gray-800",
                            )}
                          >
                            {r.event_type}
                          </span>
                        </AdminTd>
                        <AdminTd>
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs",
                              STATUS_BADGE[r.status] ?? "bg-gray-100 text-gray-800",
                            )}
                          >
                            {r.status}
                          </span>
                        </AdminTd>
                        <AdminTd>
                          <Link
                            to={adminSpaTo(`/admin/users/${encodeURIComponent(r.user_id)}`)}
                            className="font-mono text-xs text-primary underline hover:text-primary/80"
                          >
                            {r.user_id.slice(0, 8)}…
                          </Link>
                        </AdminTd>
                        <AdminTd>
                          {r.booking_id ? (
                            <Link
                              to={adminSpaTo(`/admin/bookings/${encodeURIComponent(r.booking_id)}`)}
                              className="inline-flex items-center gap-1 font-mono text-xs text-primary underline hover:text-primary/80"
                            >
                              Open
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </AdminTd>
                        <AdminTd className="max-w-[140px] truncate font-mono text-xs text-gray-600">
                          {r.aura_request_id ?? "—"}
                        </AdminTd>
                        <AdminTd className="text-right">
                          {open ? (
                            <button
                              type="button"
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              disabled={resolveMutation.isPending}
                              onClick={() => resolveMutation.mutate(r.id)}
                            >
                              Resolve
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </AdminTd>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${r.id}-meta`} className="bg-gray-50/80">
                          <AdminTd />
                          <AdminTd colSpan={7} className="pb-3 pt-0">
                            <div className="mt-1 rounded-lg border border-gray-200 bg-white p-3 text-xs">
                              <div className="font-medium text-gray-700">Event id</div>
                              <div className="mb-2 font-mono text-gray-600">{r.id}</div>
                              {metaStr ? (
                                <>
                                  <div className="font-medium text-gray-700">Metadata</div>
                                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-900/5 p-2 text-[11px] leading-relaxed text-gray-800">
                                    {metaStr}
                                  </pre>
                                </>
                              ) : (
                                <p className="text-gray-500">No metadata payload.</p>
                              )}
                            </div>
                          </AdminTd>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </AdminPanel>
      )}
    </div>
  );
}
