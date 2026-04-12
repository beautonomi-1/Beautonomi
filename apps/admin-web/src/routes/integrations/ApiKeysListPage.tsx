import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  AdminTh,
  AdminTd,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToolbarButtonClass } from "@/lib/adminUi";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix?: string;
  permissions?: string[];
  is_active: boolean;
  rate_limit_per_minute?: number;
  rate_limit_per_hour?: number;
  rate_limit_per_day?: number;
  expires_at?: string | null;
  created_at?: string;
  last_used_at?: string | null;
  created_by?: string | null;
}

interface CreateKeyResponse {
  key: ApiKeyRow & { api_key: string };
}

const PERMISSION_OPTIONS = [
  "bookings:read",
  "bookings:write",
  "providers:read",
  "providers:write",
  "users:read",
  "analytics:read",
  "webhooks:read",
  "webhooks:write",
];

export function ApiKeysListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required."
  );
  useAdminDocumentTitle("API Keys");
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editKey, setEditKey] = useState<ApiKeyRow | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  // form state
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [ratePerMin, setRatePerMin] = useState("60");
  const [ratePerHour, setRatePerHour] = useState("1000");
  const [ratePerDay, setRatePerDay] = useState("10000");

  const q = useQuery({
    queryKey: adminQueryKeys.apiKeys("all"),
    queryFn: () => adminApi.getJson<{ keys: ApiKeyRow[] }>("/api/admin/api-keys", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.apiKeys("all") });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson<CreateKeyResponse>("/api/admin/api-keys", body),
    onSuccess: (res) => {
      setCreatedSecret(res.key.api_key);
      setShowCreate(false);
      resetForm();
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create API key"),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/api-keys/${id}`, body),
    onSuccess: () => {
      adminToast.success("API key updated");
      setEditKey(null);
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      adminApi.patchJson(`/api/admin/api-keys/${id}`, { is_active }),
    onSuccess: (_, { is_active }) => {
      adminToast.success(is_active ? "Key activated" : "Key deactivated");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to toggle"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/api-keys/${id}`),
    onSuccess: () => {
      adminToast.success("API key revoked and deleted");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to revoke"),
  });

  const rows = q.data?.keys ?? [];

  function resetForm() {
    setName("");
    setPermissions([]);
    setExpiresAt("");
    setRatePerMin("60");
    setRatePerHour("1000");
    setRatePerDay("10000");
  }

  function openCreate() {
    resetForm();
    setShowCreate(true);
  }

  function openEdit(k: ApiKeyRow) {
    setName(k.name);
    setPermissions(k.permissions ?? []);
    setExpiresAt(k.expires_at ? k.expires_at.slice(0, 10) : "");
    setRatePerMin(String(k.rate_limit_per_minute ?? 60));
    setRatePerHour(String(k.rate_limit_per_hour ?? 1000));
    setRatePerDay(String(k.rate_limit_per_day ?? 10000));
    setEditKey(k);
  }

  function togglePerm(p: string) {
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function copySecret() {
    if (createdSecret) {
      void navigator.clipboard.writeText(createdSecret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  }

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="API Keys" />
        <AdminPanel><AdminPageSkeleton rows={4} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="API Keys"
        description="Manage platform API keys. Secrets are only shown once at creation."
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
              + New API key
            </button>
          </div>
        }
      />

      {/* Secret reveal modal (shown once after creation) */}
      <AdminModal
        open={!!createdSecret}
        title="API key created — copy now"
        onClose={() => { setCreatedSecret(null); setSecretCopied(false); }}
        footer={null}
      >
        <div className="space-y-4">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            This is the only time the full key will be shown. Copy it now and store it securely.
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
              Done — I&apos;ve saved the key
            </button>
          </div>
        </div>
      </AdminModal>

      {/* Create modal */}
      <AdminModal open={showCreate} title="Create API key" onClose={() => setShowCreate(false)} footer={null}>
        <KeyForm
          name={name} setName={setName}
          permissions={permissions} togglePerm={togglePerm}
          expiresAt={expiresAt} setExpiresAt={setExpiresAt}
          ratePerMin={ratePerMin} setRatePerMin={setRatePerMin}
          ratePerHour={ratePerHour} setRatePerHour={setRatePerHour}
          ratePerDay={ratePerDay} setRatePerDay={setRatePerDay}
          isPending={createMut.isPending}
          onCancel={() => setShowCreate(false)}
          onSave={() =>
            createMut.mutate({
              name: name.trim(),
              permissions,
              expires_at: expiresAt || null,
              rate_limit_per_minute: Number(ratePerMin) || 60,
              rate_limit_per_hour: Number(ratePerHour) || 1000,
              rate_limit_per_day: Number(ratePerDay) || 10000,
            })
          }
          saveLabel="Create key"
        />
      </AdminModal>

      {/* Edit modal */}
      <AdminModal open={!!editKey} title={`Edit key: ${editKey?.name ?? ""}`} onClose={() => setEditKey(null)} footer={null}>
        {editKey && (
          <KeyForm
            name={name} setName={setName}
            permissions={permissions} togglePerm={togglePerm}
            expiresAt={expiresAt} setExpiresAt={setExpiresAt}
            ratePerMin={ratePerMin} setRatePerMin={setRatePerMin}
            ratePerHour={ratePerHour} setRatePerHour={setRatePerHour}
            ratePerDay={ratePerDay} setRatePerDay={setRatePerDay}
            isPending={patchMut.isPending}
            onCancel={() => setEditKey(null)}
            onSave={() =>
              patchMut.mutate({
                id: editKey.id,
                body: {
                  name: name.trim(),
                  permissions,
                  expires_at: expiresAt || null,
                  rate_limit_per_minute: Number(ratePerMin),
                  rate_limit_per_hour: Number(ratePerHour),
                  rate_limit_per_day: Number(ratePerDay),
                },
              })
            }
            saveLabel="Save changes"
          />
        )}
      </AdminModal>

      {rows.length === 0 ? (
        <EmptyState
          title="No API keys"
          description="Create an API key to allow external integrations to access the platform."
          action={
            <button type="button" onClick={openCreate} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              + New API key
            </button>
          }
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Prefix</AdminTh>
              <AdminTh>Permissions</AdminTh>
              <AdminTh>Rate limits</AdminTh>
              <AdminTh>Expires</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((k) => (
              <Fragment key={k.id}>
                <tr className={k.is_active ? "" : "opacity-50"}>
                  <AdminTd className="font-medium">{k.name}</AdminTd>
                  <AdminTd>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">
                      {k.key_prefix ?? "—"}
                    </code>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap gap-1">
                      {(k.permissions ?? []).length === 0 ? (
                        <span className="text-xs text-gray-400">all</span>
                      ) : (
                        (k.permissions ?? []).slice(0, 3).map((p) => (
                          <span key={p} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">{p}</span>
                        ))
                      )}
                      {(k.permissions ?? []).length > 3 && (
                        <span className="text-xs text-gray-400">+{(k.permissions ?? []).length - 3}</span>
                      )}
                    </div>
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {k.rate_limit_per_minute ?? 60}/min · {k.rate_limit_per_hour ?? 1000}/hr
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {k.expires_at ? (
                      <span className={new Date(k.expires_at) < new Date() ? "text-red-600 font-medium" : "text-gray-600"}>
                        {new Date(k.expires_at).toLocaleDateString()}
                        {new Date(k.expires_at) < new Date() ? " (expired)" : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      onClick={() => toggleMut.mutate({ id: k.id, is_active: !k.is_active })}
                      disabled={toggleMut.isPending}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${k.is_active ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {k.is_active ? "Active" : "Inactive"}
                    </button>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(k)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`Permanently revoke key "${k.name}"? This cannot be undone.`))
                            deleteMut.mutate(k.id);
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Revoke
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

function KeyForm({
  name, setName,
  permissions, togglePerm,
  expiresAt, setExpiresAt,
  ratePerMin, setRatePerMin,
  ratePerHour, setRatePerHour,
  ratePerDay, setRatePerDay,
  isPending, onCancel, onSave, saveLabel,
}: {
  name: string; setName: (v: string) => void;
  permissions: string[]; togglePerm: (p: string) => void;
  expiresAt: string; setExpiresAt: (v: string) => void;
  ratePerMin: string; setRatePerMin: (v: string) => void;
  ratePerHour: string; setRatePerHour: (v: string) => void;
  ratePerDay: string; setRatePerDay: (v: string) => void;
  isPending: boolean; onCancel: () => void; onSave: () => void; saveLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mobile App Integration"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Permissions</label>
        <p className="text-xs text-gray-400 mb-2">Leave all unchecked for full access.</p>
        <div className="grid grid-cols-2 gap-2">
          {PERMISSION_OPTIONS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={permissions.includes(p)}
                onChange={() => togglePerm(p)}
                className="accent-gray-900"
              />
              <code className="text-xs text-gray-600">{p}</code>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Expires (optional)</label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Rate (per min)", value: ratePerMin, set: setRatePerMin },
          { label: "Rate (per hour)", value: ratePerHour, set: setRatePerHour },
          { label: "Rate (per day)", value: ratePerDay, set: setRatePerDay },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
            <input
              type="number"
              min={1}
              value={value}
              onChange={(e) => set(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={onSave}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
