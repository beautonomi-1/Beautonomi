import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToast } from "@/lib/adminToast";
import { adminToolbarButtonClass } from "@/lib/adminUi";
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
import { adminSpaTo } from "@/lib/adminSpaPath";

type FlagRow = {
  id: string;
  feature_key?: string;
  feature_name: string;
  category?: string;
  enabled: boolean;
  description?: string;
  tenant_id?: string | null;
};

const FLAG_CATEGORIES = [
  "booking",
  "payments",
  "ecommerce",
  "provider",
  "marketing",
  "platform",
  "ai",
  "experimental",
  "rollout",
];

function defaultForm() {
  return { feature_key: "", feature_name: "", category: "", description: "", enabled: true };
}

type FormState = { feature_key: string; feature_name: string; category: string; description: string; enabled: boolean };

export function FeatureFlagsListPage() {
  useAdminDocumentTitle("Feature Flags");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());

  const q = useQuery({
    queryKey: adminQueryKeys.featureFlags(),
    queryFn: async () => {
      const res = await adminApi.getJson<{ data?: FlagRow[]; error?: unknown } | FlagRow[]>(
        "/api/admin/feature-flags",
        { timeoutMs: 60_000 }
      );
      // API can return { data: [...] } or plain array
      if (Array.isArray(res)) return res;
      if (res && typeof res === "object" && "data" in res && Array.isArray(res.data)) return res.data;
      return [];
    },
    enabled: allowed,
  });

  const rows: FlagRow[] = (Array.isArray(q.data) ? q.data : []).filter((r) =>
    !search ||
    r.feature_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.feature_key ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.featureFlags() });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson("/api/admin/feature-flags", body),
    onSuccess: () => {
      adminToast.success("Feature flag created");
      setShowCreate(false);
      setForm(defaultForm());
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create flag"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminApi.patchJson(`/api/admin/feature-flags/${id}`, { enabled }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => adminToast.error(err.message || "Failed to toggle flag"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/feature-flags/${id}`),
    onSuccess: () => {
      adminToast.success("Feature flag deleted");
      invalidate();
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to delete flag"),
  });

  // Group by category
  const byCategory: Record<string, FlagRow[]> = {};
  for (const flag of rows) {
    const cat = flag.category ?? "Uncategorised";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(flag);
  }

  if (denied) return denied;
  if (q.isLoading)
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Feature flags" />
        <AdminPanel><AdminPageSkeleton rows={5} /></AdminPanel>
      </div>
    );
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Feature flags"
        description="Toggle features on/off per tenant or globally. Toggles take effect immediately."
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
              onClick={() => { setForm(defaultForm()); setShowCreate(true); }}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + New flag
            </button>
          </div>
        }
      />

      <p className="text-sm text-gray-600">
        <Link to={adminSpaTo("/admin/control-plane/feature-flags")} className="font-medium text-gray-900 underline">
          Control plane tools (preview &amp; resolver) →
        </Link>
      </p>

      {/* Search */}
      <input
        type="search"
        placeholder="Search flags…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />

      {/* Create modal */}
      <AdminModal open={showCreate} title="Create feature flag" onClose={() => setShowCreate(false)} footer={null}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Feature key *</label>
              <input
                type="text"
                value={form.feature_key}
                onChange={(e) => setForm((f) => ({ ...f, feature_key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                placeholder="e.g. enable_express_booking"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">Use snake_case. This is the key used in code.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display name *</label>
              <input
                type="text"
                value={form.feature_name}
                onChange={(e) => setForm((f) => ({ ...f, feature_name: e.target.value }))}
                placeholder="e.g. Express Booking"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              >
                <option value="">No category</option>
                {FLAG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What does this flag control?"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="accent-gray-900"
              />
              Enabled
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                disabled={createMut.isPending || !form.feature_key.trim() || !form.feature_name.trim()}
                onClick={() => createMut.mutate({ feature_key: form.feature_key.trim(), feature_name: form.feature_name.trim(), category: form.category || null, description: form.description || null, enabled: form.enabled })}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {createMut.isPending ? "Creating…" : "Create flag"}
              </button>
            </div>
          </div>
      </AdminModal>

      {rows.length === 0 && !search ? (
        <EmptyState
          title="No flags"
          action={
            <button type="button" onClick={() => setShowCreate(true)} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              + New flag
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <AdminPanel><p className="text-sm text-gray-400 py-4 text-center">No flags matching "{search}"</p></AdminPanel>
      ) : (
        Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([cat, flags]) => (
          <div key={cat}>
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{cat}</h3>
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh>Feature</AdminTh>
                  <AdminTh>Description</AdminTh>
                  <AdminTh>Scope</AdminTh>
                  <AdminTh>Enabled</AdminTh>
                  <AdminTh>Actions</AdminTh>
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {flags.map((r) => (
                  <tr key={r.id}>
                    <AdminTd>
                      <div className="font-mono text-xs font-medium text-gray-900">{r.feature_key ?? r.feature_name}</div>
                      {r.feature_key && r.feature_name !== r.feature_key && (
                        <div className="text-xs text-gray-400">{r.feature_name}</div>
                      )}
                    </AdminTd>
                    <AdminTd className="max-w-xs text-xs text-gray-500">{r.description ?? "—"}</AdminTd>
                    <AdminTd className="text-xs">{r.tenant_id ? "Tenant" : "Global"}</AdminTd>
                    <AdminTd>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.enabled}
                        disabled={toggleMut.isPending}
                        onClick={() => toggleMut.mutate({ id: r.id, enabled: !r.enabled })}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${r.enabled ? "bg-indigo-600" : "bg-gray-200"}`}
                      >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition ${r.enabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </AdminTd>
                    <AdminTd>
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => { if (confirm(`Delete flag "${r.feature_key ?? r.feature_name}"? This may break features that rely on it.`)) deleteMut.mutate(r.id); }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          </div>
        ))
      )}
    </div>
  );
}
