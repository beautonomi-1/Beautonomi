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
import { RichTextEditor } from "@/components/admin/RichTextEditor";

type PageContent = {
  id: string;
  page_slug: string;
  section_key: string;
  content_type: "text" | "html" | "json" | "image" | "video";
  content: string;
  metadata?: Record<string, unknown>;
  order?: number;
  is_active?: boolean;
  updated_at?: string;
  created_at?: string;
};

type PagePayload = { data?: PageContent[] };

function tryParseJson(input: string): Record<string, unknown> {
  if (!input.trim()) return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function PageContentForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  initial: Partial<PageContent>;
  onSave: (d: Partial<PageContent>) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [pageSlug, setPageSlug] = useState(initial.page_slug ?? "");
  const [sectionKey, setSectionKey] = useState(initial.section_key ?? "");
  const [contentType, setContentType] = useState<PageContent["content_type"]>(
    initial.content_type ?? "html"
  );
  const [content, setContent] = useState(initial.content ?? "");
  const [order, setOrder] = useState(String(initial.order ?? 0));
  const [isActive, setIsActive] = useState(initial.is_active !== false);
  const [metadataText, setMetadataText] = useState(
    JSON.stringify(initial.metadata ?? { title: "", subtitle: "" }, null, 2)
  );

  const metadataPreview = useMemo(() => tryParseJson(metadataText), [metadataText]);
  const displayTitle = String(metadataPreview.title ?? `${pageSlug || "page"} / ${sectionKey || "section"}`);

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Page slug *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={pageSlug}
            onChange={(e) => setPageSlug(e.target.value)}
            placeholder="privacy-policy"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Section key *</label>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={sectionKey}
            onChange={(e) => setSectionKey(e.target.value)}
            placeholder="hero_body"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Content type</label>
          <select
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={contentType}
            onChange={(e) => setContentType(e.target.value as PageContent["content_type"])}
          >
            <option value="html">HTML (WYSIWYG)</option>
            <option value="text">Plain text</option>
            <option value="json">JSON</option>
            <option value="image">Image URL</option>
            <option value="video">Video URL</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Display order</label>
          <input
            type="number"
            min="0"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Content {contentType === "html" ? "(WYSIWYG)" : ""}
          </label>
          {contentType === "html" ? (
            <RichTextEditor value={content} onChange={setContent} />
          ) : (
            <textarea
              rows={8}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Metadata (JSON)</label>
          <textarea
            rows={6}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            value={metadataText}
            onChange={(e) => setMetadataText(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">Preview title: {displayTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="page-content-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="accent-indigo-600"
          />
          <label htmlFor="page-content-active" className="text-sm text-gray-700">
            Active
          </label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSaving || !pageSlug.trim() || !sectionKey.trim()}
          onClick={() =>
            onSave({
              ...(initial.id ? { id: initial.id } : {}),
              page_slug: pageSlug.trim(),
              section_key: sectionKey.trim(),
              content_type: contentType,
              content,
              metadata: tryParseJson(metadataText),
              order: parseInt(order || "0", 10) || 0,
              is_active: isActive,
            })
          }
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : initial.id ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ContentPagesPage() {
  useAdminDocumentTitle("CMS Pages");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_CONTENT_CATALOG,
    "Content & catalog access is required."
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.contentPages(),
    queryFn: () => adminApi.getRawJson<PagePayload>("/api/admin/content/pages", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.contentPages() });

  const createMut = useMutation({
    mutationFn: (d: Partial<PageContent>) => adminApi.postJson("/api/admin/content/pages", d),
    onSuccess: () => {
      invalidate();
      setCreating(false);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<PageContent> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/pages/${id}`, d),
    onSuccess: () => {
      invalidate();
      setEditId(null);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/pages/${id}`),
    onSuccess: () => {
      invalidate();
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = (q.data?.data ?? []) as PageContent[];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="CMS Pages" />
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
      <AdminPageHeader
        title="CMS Pages"
        description="Manage seeded public page sections with page slug, section key, and rich HTML content."
      />

      <AdminPanel>
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditId(null);
              setMutError(null);
            }}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + New page section
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
            <PageContentForm
              initial={{ content_type: "html", metadata: { title: "", subtitle: "" } }}
              onSave={(d) => createMut.mutate(d)}
              onCancel={() => setCreating(false)}
              isSaving={createMut.isPending}
              error={mutError}
            />
          </div>
        )}

        {editId && editRow && (
          <div className="mb-4">
            <PageContentForm
              initial={editRow}
              onSave={(d) => updateMut.mutate(d as Partial<PageContent> & { id: string })}
              onCancel={() => setEditId(null)}
              isSaving={updateMut.isPending}
              error={mutError}
            />
          </div>
        )}
      </AdminPanel>

      {mutError && !creating && !editId && <p className="px-1 text-sm text-red-600">{mutError}</p>}

      {rows.length === 0 ? (
        <EmptyState title="No page content sections" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Title / Section</AdminTh>
              <AdminTh>Page slug</AdminTh>
              <AdminTh>Section key</AdminTh>
              <AdminTh>Type</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Updated</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const title = String((r.metadata as Record<string, unknown> | undefined)?.title ?? "");
              const displayTitle = title || `${r.page_slug} / ${r.section_key}`;
              return (
                <tr key={r.id}>
                  <AdminTd className="font-medium">{displayTitle}</AdminTd>
                  <AdminTd className="text-xs font-mono text-gray-500">{r.page_slug}</AdminTd>
                  <AdminTd className="text-xs font-mono text-gray-500">{r.section_key}</AdminTd>
                  <AdminTd>{r.content_type}</AdminTd>
                  <AdminTd>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.is_active !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {r.is_active !== false ? "Active" : "Inactive"}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {(r.updated_at ?? r.created_at ?? "").slice(0, 10)}
                  </AdminTd>
                  <AdminTd>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(r.id);
                          setCreating(false);
                          setMutError(null);
                        }}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (confirm(`Disable "${displayTitle}"?`)) deleteMut.mutate(r.id);
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Disable
                      </button>
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}

