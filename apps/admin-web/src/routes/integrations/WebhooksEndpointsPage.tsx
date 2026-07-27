import { Fragment, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToast } from "@/lib/adminToast";
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
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { cn } from "@/lib/cn";

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events?: string[];
  is_active: boolean;
  retry_count?: number;
  timeout_seconds?: number;
  headers?: Record<string, string>;
  created_at?: string;
}

const AVAILABLE_EVENTS = [
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.completed",
  "payment.succeeded",
  "payment.failed",
  "refund.issued",
  "provider.activated",
  "provider.suspended",
  "user.registered",
  "review.created",
  "order.created",
  "order.fulfilled",
  "payout.approved",
  "payout.paid",
];

function defaultForm() {
  return {
    name: "",
    url: "",
    events: [] as string[],
    retry_count: "3",
    timeout_seconds: "30",
    is_active: true,
  };
}

// ─── Failures tab ─────────────────────────────────────────────────────────────

interface WebhookFailureRow {
  id: string;
  event_type?: string;
  source?: string;
  endpoint_id?: string;
  error_message?: string | null;
  // webhook_events tracks delivery attempts in attempt_count (migration 111).
  attempt_count?: number;
  payload?: unknown;
  created_at?: string;
  next_retry_at?: string | null;
  status?: string;
}

function WebhookFailuresTab({ allowed }: { allowed: boolean }) {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const page = Math.max(1, parseInt(sp.get("fp") || "1", 10) || 1);
  const source = sp.get("fsrc") || "";

  const updateParams = useCallback(
    (next: Record<string, string | null>) => {
      const n = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === "") n.delete(k);
        else n.set(k, v);
      }
      setSp(n, { replace: true });
    },
    [sp, setSp]
  );

  const q = useQuery({
    queryKey: ["admin", "webhook-failures", page, source],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: "30" });
      if (source) p.set("source", source);
      return adminApi.getRawJson<{
        data: WebhookFailureRow[];
        meta: { page: number; limit: number; total: number; has_more: boolean };
      }>(`/api/admin/webhooks/failures?${p}`, { timeoutMs: 30_000 });
    },
    enabled: allowed,
  });

  const retryMut = useMutation({
    mutationFn: (id: string) =>
      // postJson unwraps { data: T } → returns T directly
      adminApi.postJson<{ id: string; retry_initiated: boolean; delivered: boolean }>(
        `/api/admin/webhooks/failures/${id}/retry`,
        {},
      ),
    onSuccess: (res) => {
      if (res?.delivered) {
        adminToast.success("Webhook re-delivered successfully");
      } else {
        adminToast.warning("Retry queued — the endpoint returned a non-2xx response. Check failures again shortly.");
      }
      void qc.invalidateQueries({ queryKey: ["admin", "webhook-failures"] });
    },
    onError: (err: Error) => adminToast.error(err.message || "Retry failed"),
  });

  if (q.isLoading) return <AdminPageSkeleton rows={4} />;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const failures = q.data?.data ?? [];
  const meta = q.data?.meta;
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter by source (e.g. paystack, yoco)"
          defaultValue={source}
          onBlur={(e) => updateParams({ fsrc: e.target.value.trim() || null, fp: "1" })}
          onKeyDown={(e) => {
            if (e.key === "Enter")
              updateParams({ fsrc: (e.target as HTMLInputElement).value.trim() || null, fp: "1" });
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {source && (
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
            onClick={() => updateParams({ fsrc: null, fp: "1" })}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          className={adminToolbarButtonClass(q.isFetching)}
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
        >
          Refresh
        </button>
        <span className="ml-auto text-sm text-gray-500">{meta?.total ?? 0} failure{meta?.total !== 1 ? "s" : ""}</span>
      </div>

      {failures.length === 0 ? (
        <EmptyState
          title="No webhook failures"
          description="All recent webhook deliveries succeeded. Failures will appear here for monitoring and retry."
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>When</AdminTh>
              <AdminTh>Event type</AdminTh>
              <AdminTh>Source</AdminTh>
              <AdminTh>Retries</AdminTh>
              <AdminTh>Error</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {failures.map((f) => (
              <tr key={f.id}>
                <AdminTd className="whitespace-nowrap text-xs">
                  {f.created_at ? new Date(f.created_at).toLocaleString() : "—"}
                </AdminTd>
                <AdminTd className="text-xs font-mono">{f.event_type ?? "—"}</AdminTd>
                <AdminTd className="text-xs">{f.source ?? "—"}</AdminTd>
                <AdminTd className="text-xs">{f.attempt_count ?? 0}</AdminTd>
                <AdminTd className="max-w-xs text-xs text-red-700">
                  <span title={f.error_message ?? undefined} className="line-clamp-2">
                    {f.error_message ?? "Unknown error"}
                  </span>
                </AdminTd>
                <AdminTd>
                  <button
                    type="button"
                    disabled={retryMut.isPending}
                    onClick={() => retryMut.mutate(f.id)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    Retry
                  </button>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {meta && meta.total > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => updateParams({ fp: String(page - 1) })}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => updateParams({ fp: String(page + 1) })}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type WebhookTab = "endpoints" | "failures";
const WEBHOOK_TABS: { id: WebhookTab; label: string }[] = [
  { id: "endpoints", label: "Endpoints" },
  { id: "failures", label: "Failures & Retry" },
];

export function WebhooksEndpointsPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required."
  );
  useAdminDocumentTitle("Webhooks");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const activeTab = (sp.get("tab") as WebhookTab | null) ?? "endpoints";

  const setTab = (tab: WebhookTab) => {
    const n = new URLSearchParams(sp);
    n.set("tab", tab);
    setSp(n, { replace: true });
  };

  const [showCreate, setShowCreate] = useState(false);
  const [editEndpoint, setEditEndpoint] = useState<WebhookEndpoint | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [form, setForm] = useState(defaultForm());

  const q = useQuery({
    queryKey: adminQueryKeys.webhooks(),
    queryFn: () =>
      adminApi.getJson<{ endpoints: WebhookEndpoint[] }>("/api/admin/webhooks/endpoints", {
        timeoutMs: 30_000,
      }),
    enabled: allowed,
  });

  const rows = q.data?.endpoints ?? [];

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: adminQueryKeys.webhooks() });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson<{ endpoint: WebhookEndpoint & { secret: string } }>(
        "/api/admin/webhooks/endpoints",
        body
      ),
    onSuccess: (res) => {
      setCreatedSecret(res.endpoint.secret ?? null);
      setShowCreate(false);
      setForm(defaultForm());
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to register endpoint"),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/webhooks/endpoints/${id}`, body),
    onSuccess: () => {
      adminToast.success("Webhook endpoint updated");
      setEditEndpoint(null);
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      adminApi.patchJson(`/api/admin/webhooks/endpoints/${id}`, { is_active }),
    onSuccess: (_, { is_active }) => {
      adminToast.success(is_active ? "Endpoint activated" : "Endpoint disabled");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to toggle"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      adminApi.deleteJson(`/api/admin/webhooks/endpoints/${id}`),
    onSuccess: () => {
      adminToast.success("Webhook endpoint deleted");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to delete"),
  });

  function openCreate() {
    setForm(defaultForm());
    setShowCreate(true);
  }

  function openEdit(ep: WebhookEndpoint) {
    setForm({
      name: ep.name,
      url: ep.url,
      events: ep.events ?? [],
      retry_count: String(ep.retry_count ?? 3),
      timeout_seconds: String(ep.timeout_seconds ?? 30),
      is_active: ep.is_active,
    });
    setEditEndpoint(ep);
  }

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev)
        ? f.events.filter((e) => e !== ev)
        : [...f.events, ev],
    }));
  }

  function copySecret() {
    if (createdSecret) {
      void navigator.clipboard.writeText(createdSecret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  }

  if (denied) return denied;

  const tabBar = (
    <div className="flex gap-1 border-b border-gray-200">
      {WEBHOOK_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            activeTab === t.id
              ? "border-b-2 border-primary text-primary"
              : "text-gray-500 hover:text-gray-800"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  if (activeTab === "failures") {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Webhooks"
          description="Manage webhook endpoints and monitor failed deliveries."
        />
        {tabBar}
        <WebhookFailuresTab allowed={allowed} />
      </div>
    );
  }

  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Webhooks" />
        {tabBar}
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Webhooks"
        description="Register external endpoints to receive real-time platform events. Signing secrets are only shown once."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass(q.isFetching)}
              disabled={q.isFetching}
              onClick={() => void q.refetch()}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + Register endpoint
            </button>
          </div>
        }
      />
      {tabBar}

      {/* Signing secret reveal (once) */}
      <AdminModal
        open={!!createdSecret}
        title="Endpoint registered — copy signing secret"
        onClose={() => { setCreatedSecret(null); setSecretCopied(false); }}
        footer={null}
      >
        <div className="space-y-4">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Use this secret to verify webhook signatures. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs break-all">
              {createdSecret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              {secretCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setCreatedSecret(null); setSecretCopied(false); }}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Done — I&apos;ve saved the secret
            </button>
          </div>
        </div>
      </AdminModal>

      {/* Create modal */}
      <AdminModal open={showCreate} title="Register webhook endpoint" onClose={() => setShowCreate(false)} footer={null}>
        <EndpointForm
          form={form}
          setForm={setForm}
          toggleEvent={toggleEvent}
          isPending={createMut.isPending}
          onCancel={() => setShowCreate(false)}
          onSave={() =>
            createMut.mutate({
              name: form.name.trim(),
              url: form.url.trim(),
              events: form.events,
              retry_count: Number(form.retry_count) || 3,
              timeout_seconds: Number(form.timeout_seconds) || 30,
              is_active: form.is_active,
            })
          }
          saveLabel="Register endpoint"
        />
      </AdminModal>

      {/* Edit modal */}
      <AdminModal
        open={!!editEndpoint}
        title={`Edit: ${editEndpoint?.name ?? ""}`}
        onClose={() => setEditEndpoint(null)}
        footer={null}
      >
        {editEndpoint && (
          <EndpointForm
            form={form}
            setForm={setForm}
            toggleEvent={toggleEvent}
            isPending={patchMut.isPending}
            onCancel={() => setEditEndpoint(null)}
            onSave={() =>
              patchMut.mutate({
                id: editEndpoint.id,
                body: {
                  name: form.name.trim(),
                  url: form.url.trim(),
                  events: form.events,
                  retry_count: Number(form.retry_count),
                  timeout_seconds: Number(form.timeout_seconds),
                  is_active: form.is_active,
                },
              })
            }
            saveLabel="Save changes"
          />
        )}
      </AdminModal>

      {rows.length === 0 ? (
        <EmptyState
          title="No webhook endpoints"
          description="Register an endpoint to start receiving real-time platform events."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + Register endpoint
            </button>
          }
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>URL</AdminTh>
              <AdminTh>Events</AdminTh>
              <AdminTh>Retries</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((ep) => (
              <Fragment key={ep.id}>
                <tr className={ep.is_active ? "" : "opacity-50"}>
                  <AdminTd className="font-medium">{ep.name}</AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs text-gray-500">
                    {ep.url}
                  </AdminTd>
                  <AdminTd>
                    {!ep.events || ep.events.length === 0 ? (
                      <span className="text-xs text-gray-400">all events</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {ep.events.slice(0, 2).map((ev) => (
                          <span
                            key={ev}
                            className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700"
                          >
                            {ev}
                          </span>
                        ))}
                        {ep.events.length > 2 && (
                          <span className="text-xs text-gray-400">
                            +{ep.events.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {ep.retry_count ?? 3}x
                  </AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      onClick={() =>
                        toggleMut.mutate({ id: ep.id, is_active: !ep.is_active })
                      }
                      disabled={toggleMut.isPending}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ep.is_active ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {ep.is_active ? "Active" : "Disabled"}
                    </button>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(ep)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Delete webhook endpoint "${ep.name}"? This cannot be undone.`
                            )
                          )
                            deleteMut.mutate(ep.id);
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </AdminTd>
                </tr>
              </Fragment>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

function EndpointForm({
  form,
  setForm,
  toggleEvent,
  isPending,
  onCancel,
  onSave,
  saveLabel,
}: {
  form: ReturnType<typeof defaultForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof defaultForm>>>;
  toggleEvent: (ev: string) => void;
  isPending: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  const isValid = form.name.trim().length > 0 && form.url.trim().startsWith("http");
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Production Event Handler"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Endpoint URL *
        </label>
        <input
          type="url"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          placeholder="https://your-server.com/webhooks/beautonomi"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Events to receive
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Leave all unchecked to receive every event.
        </p>
        <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
          {AVAILABLE_EVENTS.map((ev) => (
            <label
              key={ev}
              className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={form.events.includes(ev)}
                onChange={() => toggleEvent(ev)}
                className="accent-gray-900"
              />
              <code className="text-xs">{ev}</code>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Retry attempts
          </label>
          <input
            type="number"
            min={0}
            max={10}
            value={form.retry_count}
            onChange={(e) => setForm((f) => ({ ...f, retry_count: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Timeout (seconds)
          </label>
          <input
            type="number"
            min={5}
            max={120}
            value={form.timeout_seconds}
            onChange={(e) =>
              setForm((f) => ({ ...f, timeout_seconds: e.target.value }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          className="accent-gray-900"
        />
        Active (receive events immediately)
      </label>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || !isValid}
          onClick={onSave}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
