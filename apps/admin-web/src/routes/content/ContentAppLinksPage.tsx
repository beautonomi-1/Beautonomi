import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
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

type AppLink = {
  id: string;
  platform: string;
  url: string;
  label?: string;
  is_active?: boolean;
  updated_at?: string;
  created_at?: string;
};

type AppLinksPayload = { data?: AppLink[] };

function AppLinkForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<AppLink>;
  onSave: (d: Partial<AppLink>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [platform, setPlatform] = useState(initial.platform ?? "ios");
  const [url, setUrl] = useState(initial.url ?? "");
  const [label, setLabel] = useState(initial.label ?? "");
  const [isActive, setIsActive] = useState(initial.is_active !== false);

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Platform *</label>
          <select className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
            <option value="web">Web</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Download on the App Store" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">URL *</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://apps.apple.com/…" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="linkActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-indigo-600" />
          <label htmlFor="linkActive" className="text-sm text-gray-700">Active</label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !url.trim()}
          onClick={() => onSave({
            ...(initial.id ? { id: initial.id } : {}),
            platform,
            url: url.trim(),
            label: label || undefined,
            is_active: isActive,
          })}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : initial.id ? "Update" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ContentAppLinksPage() {
  useAdminDocumentTitle("App Links");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.contentAppLinks(),
    queryFn: () => adminApi.getRawJson<AppLinksPayload>("/api/admin/content/app-links", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.contentAppLinks() });

  const createMut = useMutation({
    mutationFn: (d: Partial<AppLink>) => adminApi.postJson("/api/admin/content/app-links", d),
    onSuccess: () => { invalidate(); setCreating(false); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<AppLink> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/app-links/${id}`, d),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/app-links/${id}`),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = (q.data?.data ?? []) as AppLink[];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="App Links" />
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

  const editRow = editId ? rows.find((r) => r.id === editId) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="App Links" description="Manage download links for iOS, Android, and web." />

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New link
          </button>
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        </div>
        {creating && (
          <div className="mb-4">
            <AppLinkForm
              initial={{}}
              onSave={(d) => createMut.mutate(d)}
              onCancel={() => setCreating(false)}
              isSaving={createMut.isPending}
              error={mutError}
            />
          </div>
        )}
        {editId && editRow && (
          <div className="mb-4">
            <AppLinkForm
              initial={editRow}
              onSave={(d) => updateMut.mutate(d as Partial<AppLink> & { id: string })}
              onCancel={() => setEditId(null)}
              isSaving={updateMut.isPending}
              error={mutError}
            />
          </div>
        )}
      </AdminPanel>

      {mutError && !creating && !editId && (
        <p className="text-sm text-red-600 px-1">{mutError}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No app links" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Platform</AdminTh>
              <AdminTh>Label</AdminTh>
              <AdminTh>URL</AdminTh>
              <AdminTh>Active</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-medium text-xs uppercase">{r.platform}</AdminTd>
                <AdminTd className="text-xs">{r.label ?? "—"}</AdminTd>
                <AdminTd className="text-xs text-gray-500 max-w-xs truncate">{r.url}</AdminTd>
                <AdminTd>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.is_active !== false
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {r.is_active !== false ? "Active" : "Inactive"}
                  </span>
                </AdminTd>
                <AdminTd>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditId(r.id); setCreating(false); setMutError(null); }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deleteMut.isPending}
                      onClick={() => { if (confirm(`Delete this link?`)) deleteMut.mutate(r.id); }}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
