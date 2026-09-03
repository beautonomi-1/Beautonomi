import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE, ADMIN_SECTION_INTEGRATIONS_DEV, ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPageAny } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { cn } from "@/lib/cn";

type InboundEvent = {
  id: string;
  event_id?: string | null;
  source: string;
  event_type?: string | null;
  status: string;
  attempt_count?: number | null;
  error_message?: string | null;
  payload?: Record<string, unknown>;
  created_at: string;
  replayable?: boolean;
};

type InboundPayload = {
  events: InboundEvent[];
  total?: number;
  signature_failures?: {
    last_24h?: Record<string, { events: number; attempts: number }>;
    last_7d?: Record<string, { events: number; attempts: number }>;
  };
};

export function InboundWebhooksPage() {
  useAdminDocumentTitle("Inbound webhooks");
  const { allowed, denied } = useAdminSectionPageAny(
    [ADMIN_SECTION_INTEGRATIONS_DEV, ADMIN_SECTION_FINANCE, ADMIN_SECTION_OPERATIONS],
    "Finance, operations, or integrations access is required.",
  );
  const qc = useQueryClient();
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [sigOnly, setSigOnly] = useState(false);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: adminQueryKeys.inboundWebhooks(source, status, sigOnly, q),
    enabled: allowed,
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (source) params.set("source", source);
      if (status) params.set("status", status);
      if (sigOnly) params.set("signature_failures", "1");
      if (q.trim()) params.set("q", q.trim());
      return adminApi.getJson<InboundPayload>(`/api/admin/webhooks/inbound?${params}`, { timeoutMs: 30_000 });
    },
  });

  const replayMut = useMutation({
    mutationFn: (id: string) => adminApi.postJson(`/api/admin/webhooks/inbound/${id}/replay`, { force: false }),
    onSuccess: () => {
      adminToast.success("Replay dispatched");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.inboundWebhooks(source, status, sigOnly, q) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;

  const rows = query.data?.events ?? [];
  const authFailed = isAdminApiAuthFailure(query.error);
  const open = rows.find((r) => r.id === openId);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Inbound webhooks"
        description="Paystack, Stripe, and Flutterwave events from webhook_events. Signature failures and replay (idempotent handlers)."
      />
      <AdminPanel>
        <div className="mb-4 flex flex-wrap gap-2">
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            <option value="paystack">Paystack</option>
            <option value="stripe">Stripe</option>
            <option value="flutterwave">Flutterwave</option>
          </select>
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="processed">Processed</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={sigOnly} onChange={(e) => setSigOnly(e.target.checked)} />
            Signature failures only
          </label>
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Search event id / error"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className={adminToolbarButtonClass()} onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
        {query.data?.signature_failures ? (
          <p className="mb-3 text-xs text-gray-600">
            Signature rejects 24h: {JSON.stringify(query.data.signature_failures.last_24h ?? {})} · 7d:{" "}
            {JSON.stringify(query.data.signature_failures.last_7d ?? {})}
          </p>
        ) : null}
        {query.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : authFailed ? (
          <AdminRetryBlock message={query.error instanceof Error ? query.error.message : "Failed to load"} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No inbound events" description="PSP webhooks appear here after ingest, including HMAC failures." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh>Time</AdminTh>
              <AdminTh>Source</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Error</AdminTh>
              <AdminTh>Actions</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <AdminTd className="text-xs text-gray-600">{new Date(row.created_at).toLocaleString()}</AdminTd>
                  <AdminTd className="font-mono text-xs">{row.source}</AdminTd>
                  <AdminTd className="font-mono text-xs">{row.event_type ?? "—"}</AdminTd>
                  <AdminTd>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        row.status === "failed" || row.event_type === "signature_rejected"
                          ? "bg-red-100 text-red-800"
                          : row.status === "processed"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800",
                      )}
                    >
                      {row.status}
                    </span>
                  </AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs text-red-700" title={row.error_message ?? undefined}>
                    {row.error_message ?? "—"}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className="text-xs text-violet-700 underline" onClick={() => setOpenId(row.id)}>
                        Payload
                      </button>
                      {row.replayable ? (
                        <button
                          type="button"
                          className="text-xs text-emerald-700 underline"
                          onClick={() => void replayMut.mutate(row.id)}
                          disabled={replayMut.isPending}
                        >
                          Replay
                        </button>
                      ) : null}
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
      {open ? (
        <AdminPanel>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Sanitized payload · {open.event_id ?? open.id}</h3>
            <button type="button" className={adminToolbarButtonClass()} onClick={() => setOpenId(null)}>
              Close
            </button>
          </div>
          <pre className="max-h-[28rem] overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(open.payload ?? {}, null, 2)}</pre>
        </AdminPanel>
      ) : null}
    </div>
  );
}
