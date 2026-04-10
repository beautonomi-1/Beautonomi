import { useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
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

type Article = {
  id: string;
  title: string;
  slug: string;
  status?: string;
  audience?: string;
  category_id?: string;
  summary?: string;
  body?: string;
  content_type?: string;
  content_format?: string;
  is_internal?: boolean;
  published_at?: string | null;
  image_url?: string | null;
};

function ArticleForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<Article>;
  onSave: (d: Partial<Article>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [categoryId, setCategoryId] = useState(initial.category_id ?? "");
  const [status, setStatus] = useState(initial.status ?? "draft");
  const [audience, setAudience] = useState(initial.audience ?? "general");
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [contentType, setContentType] = useState(initial.content_type ?? "article");
  const [imageUrl, setImageUrl] = useState(initial.image_url ?? "");
  const [isInternal, setIsInternal] = useState(initial.is_internal ?? false);

  const autoSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!initial.id) setSlug(autoSlug);
            }}
            placeholder="Getting started with Beautonomi"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Slug *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category ID *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono text-xs"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            placeholder="UUID of learning category"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Audience</label>
          <select className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="general">General</option>
            <option value="customer">Customer</option>
            <option value="provider">Provider</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Content type</label>
          <select className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={contentType} onChange={(e) => setContentType(e.target.value)}>
            <option value="article">Article</option>
            <option value="video_guide">Video guide</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
          <input className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Summary</label>
          <textarea rows={2} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Body (HTML/Markdown)</label>
          <textarea rows={5} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="internal" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="accent-indigo-600" />
          <label htmlFor="internal" className="text-sm text-gray-700">Internal only</label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !title.trim() || !slug.trim() || !categoryId.trim()}
          onClick={() => onSave({
            ...(initial.id ? { id: initial.id } : {}),
            title: title.trim(),
            slug: slug.trim(),
            category_id: categoryId.trim(),
            status,
            audience,
            summary: summary || undefined,
            body,
            content_type: contentType,
            image_url: imageUrl || null,
            is_internal: isInternal,
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

export function LearningArticlesPage() {
  useAdminDocumentTitle("Learning Articles");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const [sp] = useSearchParams();
  const status = sp.get("status") || "";
  const qk = useMemo(() => adminQueryKeys.learningArticles(status || "all"), [status]);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      const qs = p.toString();
      return adminApi.getJson<Article[]>(`/api/admin/content/learning/articles${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: qk });

  const createMut = useMutation({
    mutationFn: (d: Partial<Article>) => adminApi.postJson("/api/admin/content/learning/articles", d),
    onSuccess: () => { invalidate(); setCreating(false); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<Article> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/learning/articles/${id}`, d),
    onSuccess: () => { invalidate(); setEditId(null); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/learning/articles/${id}`),
    onSuccess: () => { invalidate(); setMutError(null); },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = (q.data ?? []) as Article[];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Learning" />
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
      <AdminPageHeader title="Learning articles" description="Manage learning center articles." />

      <AdminPanel>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => { setCreating(true); setEditId(null); setMutError(null); }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New article
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
            <ArticleForm
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
            <ArticleForm
              initial={editRow}
              onSave={(d) => updateMut.mutate(d as Partial<Article> & { id: string })}
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
        <EmptyState title="No articles" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Title</AdminTh>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Audience</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-medium">{r.title}</AdminTd>
                <AdminTd className="font-mono text-xs">{r.slug}</AdminTd>
                <AdminTd>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.status === "published" ? "bg-green-100 text-green-700" :
                    r.status === "draft" ? "bg-gray-100 text-gray-600" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{r.status}</span>
                </AdminTd>
                <AdminTd>{r.audience}</AdminTd>
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
