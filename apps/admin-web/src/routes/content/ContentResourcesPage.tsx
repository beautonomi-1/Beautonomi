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

type Resource = {
  id: string;
  title: string;
  content?: string;
  type?: string;
  url?: string | null;
  is_active?: boolean;
  is_published?: boolean;
  updated_at?: string;
  created_at?: string;
};

type ResourcesPayload = { data?: Resource[] };

function ResourceForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<Resource>;
  onSave: (d: Partial<Resource>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [content, setContent] = useState(initial.content ?? "");
  const [type, setType] = useState(initial.type ?? "article");
  const [url, setUrl] = useState(initial.url ?? "");
  const [isActive, setIsActive] = useState(initial.is_active !== false && initial.is_published !== false);

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Getting started guide"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="article">Article</option>
            <option value="guide">Guide</option>
            <option value="video">Video</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">URL (optional)</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Content *</label>
          <textarea rows={4} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="resActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-indigo-600" />
          <label htmlFor="resActive" className="text-sm text-gray-700">Active / Published</label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !title.trim() || !content.trim()}
          onClick={() => onSave({
            ...(initial.id ? { id: initial.id } : {}),
            title: title.trim(),
            content: content.trim(),
            type,
            url: url || null,
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

export function ContentResourcesPage() {
  useAdminDocumentTitle("CMS Resources");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.contentResources(),
    queryFn: () => adminApi.getRawJson<ResourcesPayload>("/api/admin/content/resources", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.contentResources() });

  const createMut = useMutation({
    mutationFn: (d: Partial<Resource>) => adminApi.postJson("/api/admin/content/resources", d),
    onSuccess: () => { invalidate(); setCreating(false); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<Resource> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/resources/${id}`, d),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/resources/${id}`),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = (q.data?.data ?? []) as Resource[];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="CMS resources" />
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
      <AdminPageHeader title="CMS resources" description="Manage tenant-scoped learning resources." />

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New resource
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
            <ResourceForm
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
            <ResourceForm
              initial={editRow}
              onSave={(d) => updateMut.mutate(d as Partial<Resource> & { id: string })}
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
        <EmptyState title="No resources" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Title</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Published</AdminTh>
              <AdminTh>Updated</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-medium">{r.title}</AdminTd>
                <AdminTd className="text-xs">{r.type}</AdminTd>
                <AdminTd>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.is_active !== false && r.is_published !== false
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {r.is_active !== false && r.is_published !== false ? "Active" : "Inactive"}
                  </span>
                </AdminTd>
                <AdminTd className="text-xs text-gray-500">{(r.updated_at ?? r.created_at ?? "").slice(0, 10)}</AdminTd>
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
                      onClick={() => { if (confirm(`Delete "${r.title}"?`)) deleteMut.mutate(r.id); }}
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
