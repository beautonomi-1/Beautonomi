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
import { AdminModal } from "@/components/admin/AdminModal";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Plus, Search } from "lucide-react";

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

const EMPTY_PAGE_CONTENT_INITIAL: Partial<PageContent> = {
  content_type: "html",
  metadata: { title: "", subtitle: "" },
};

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
    <div className="space-y-5 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-700">Page slug *</label>
          <input
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={pageSlug}
            onChange={(e) => setPageSlug(e.target.value)}
            placeholder="privacy-policy"
            disabled={Boolean(initial.id)}
            readOnly={Boolean(initial.id)}
          />
          {initial.id ? (
            <p className="mt-1 text-xs text-gray-500">Slug cannot be changed after creation.</p>
          ) : null}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Section key *</label>
          <input
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={sectionKey}
            onChange={(e) => setSectionKey(e.target.value)}
            placeholder="hero_body"
            disabled={Boolean(initial.id)}
            readOnly={Boolean(initial.id)}
          />
          {initial.id ? (
            <p className="mt-1 text-xs text-gray-500">Section key cannot be changed after creation.</p>
          ) : null}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Content type</label>
          <select
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
          <label className="block text-xs font-medium text-gray-700">Display order</label>
          <input
            type="number"
            min="0"
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">
            Content {contentType === "html" ? "(WYSIWYG)" : ""}
          </label>
          <div className="mt-1.5">
            {contentType === "html" ? (
              <RichTextEditor value={content} onChange={setContent} />
            ) : (
              <textarea
                rows={8}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            )}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">Metadata (JSON)</label>
          <textarea
            rows={6}
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            value={metadataText}
            onChange={(e) => setMetadataText(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">Preview title: {displayTitle}</p>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <input
            id="page-content-active"
            type="checkbox"
            className="h-4 w-4 accent-gray-900"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label htmlFor="page-content-active" className="text-sm text-gray-800">
            Active
          </label>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" className={adminToolbarButtonClass(false)} onClick={onCancel}>
          Cancel
        </button>
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
          className="min-h-11 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : initial.id ? "Save changes" : "Create section"}
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

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mutError, setMutError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: adminQueryKeys.contentPages() });

  const createMut = useMutation({
    mutationFn: (d: Partial<PageContent>) => adminApi.postJson("/api/admin/content/pages", d),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<PageContent> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/pages/${id}`, d),
    onSuccess: () => {
      invalidate();
      setModal(null);
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

  const filteredRows = useMemo(() => {
    const qv = search.trim().toLowerCase();
    if (!qv) return rows;
    return rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | undefined;
      const title = String(meta?.title ?? "");
      const hay = [
        r.page_slug,
        r.section_key,
        title,
        r.content_type,
        typeof r.content === "string" ? r.content.slice(0, 500) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qv);
    });
  }, [rows, search]);

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
        description="Manage public page sections: each row is a block keyed by page slug and section (like the legacy Next admin content hub). Use HTML + metadata for titles and layout hints."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <strong>Note:</strong> Slug and section identify a block in the app; create a new row for each distinct pair. Editing does not change slug or section—create a new section if you need a different key.
      </div>

      <AdminPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search slug, section, title, or body…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => {
                setEditId(null);
                setMutError(null);
                setModal("create");
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              New page section
            </button>
          </div>
        </div>
      </AdminPanel>

      {mutError && !modal ? <p className="text-sm text-red-600">{mutError}</p> : null}

      <AdminModal
        open={modal !== null}
        onClose={() => {
          setModal(null);
          setEditId(null);
          setMutError(null);
        }}
        title={modal === "edit" ? "Edit page section" : "New page section"}
        description="HTML sections power marketing and legal pages. Metadata JSON often includes title and subtitle for the UI."
        size="xl"
        footer={null}
      >
        {modal === "create" ? (
          <PageContentForm
            key="cms-page-create"
            initial={EMPTY_PAGE_CONTENT_INITIAL}
            onSave={(d) => createMut.mutate(d)}
            onCancel={() => {
              setModal(null);
              setMutError(null);
            }}
            isSaving={createMut.isPending}
            error={mutError}
          />
        ) : modal === "edit" && editRow ? (
          <PageContentForm
            key={editRow.id}
            initial={editRow}
            onSave={(d) => updateMut.mutate(d as Partial<PageContent> & { id: string })}
            onCancel={() => {
              setModal(null);
              setEditId(null);
              setMutError(null);
            }}
            isSaving={updateMut.isPending}
            error={mutError}
          />
        ) : null}
      </AdminModal>

      {rows.length === 0 ? (
        <EmptyState title="No page content sections" description="Create a section to add copy for a page slug." />
      ) : filteredRows.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search term." />
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
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {filteredRows.map((r) => {
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
                  <AdminTd className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(r.id);
                          setMutError(null);
                          setModal("edit");
                        }}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
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

