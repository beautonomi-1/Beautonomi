import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { marked } from "marked";
import { Plus, Search } from "lucide-react";

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

type LearningCategory = { id: string; title: string; slug: string };

const EMPTY_ARTICLE_INITIAL: Partial<Article> = {
  status: "draft",
  audience: "general",
  content_type: "article",
  content_format: "html",
};

function ArticleForm({
  mode,
  initial,
  categories,
  onSave,
  onCancel,
  isSaving,
  error,
}: {
  mode: "create" | "edit";
  initial: Partial<Article>;
  categories: LearningCategory[];
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
  const [contentFormat, setContentFormat] = useState<"html" | "markdown">(
    initial.content_format === "markdown" ? "markdown" : "html",
  );
  const [imageUrl, setImageUrl] = useState(initial.image_url ?? "");
  const [isInternal, setIsInternal] = useState(initial.is_internal ?? false);

  const useVisualBodyEditor = contentFormat === "html";

  return (
    <div className="space-y-5 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">Title *</label>
          <input
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => {
              const t = e.target.value;
              setTitle(t);
              if (mode === "create") {
                setSlug(
                  t
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                );
              }
            }}
            placeholder="Getting started with Beautonomi"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Slug *</label>
          <input
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            disabled={mode === "edit"}
            readOnly={mode === "edit"}
          />
          {mode === "edit" ? <p className="mt-1 text-xs text-gray-500">Slug is fixed after publish paths exist.</p> : null}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Category *</label>
          <select
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.title} ({cat.slug})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Status</label>
          <select
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Audience</label>
          <select
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="general">General</option>
            <option value="customer">Customer</option>
            <option value="provider">Provider</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Content type</label>
          <select
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
          >
            <option value="article">Article</option>
            <option value="video_guide">Video guide</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Image URL</label>
          <input
            className="mt-1.5 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://… or /images/…"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">Summary</label>
          <textarea
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">Body</label>
          <div className="mt-1.5 space-y-2">
            {useVisualBodyEditor ? (
              <>
                <RichTextEditor
                  variant="learning"
                  minHeightClassName="min-h-[280px]"
                  value={body}
                  onChange={setBody}
                  placeholder="Write the article… Use the toolbar for images and YouTube, or paste a YouTube link."
                />
                <p className="text-xs text-gray-500">
                  Stored as <span className="font-medium">HTML</span>. Images and YouTube use the toolbar; other embeds can be pasted as HTML. Hero
                  image above is separate from inline images.
                </p>
              </>
            ) : (
              <>
                <textarea
                  rows={12}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  spellCheck={false}
                />
                <p className="text-xs text-amber-800">
                  This article is stored as <span className="font-medium">Markdown</span>. Switch to HTML in the database or{" "}
                  <button
                    type="button"
                    className="font-medium text-indigo-700 underline hover:text-indigo-900"
                    onClick={() => {
                      try {
                        setBody(marked.parse(body) as string);
                      } catch {
                        /* keep raw body */
                      }
                      setContentFormat("html");
                    }}
                  >
                    convert to HTML (visual editor)
                  </button>{" "}
                  — body is run through the same Markdown renderer as the public site; review in the editor after converting.
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <input
            type="checkbox"
            id="internal"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="h-4 w-4 accent-gray-900"
          />
          <label htmlFor="internal" className="text-sm text-gray-800">
            Internal only
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
          disabled={isSaving || !title.trim() || !slug.trim() || !categoryId.trim()}
          onClick={() => {
            const base: Partial<Article> = {
              title: title.trim(),
              slug: slug.trim(),
              category_id: categoryId.trim(),
              status,
              audience,
              summary: summary || undefined,
              body,
              content_format: contentFormat,
              content_type: contentType,
              image_url: imageUrl || null,
              is_internal: isInternal,
            };
            if (mode === "edit" && initial.id) {
              const { slug: _s, id: _id, ...rest } = base as Article & { slug?: string };
              void _s;
              void _id;
              onSave({ id: initial.id, ...rest });
            } else {
              onSave(base);
            }
          }}
          className="min-h-11 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : mode === "edit" ? "Save changes" : "Create article"}
        </button>
      </div>
    </div>
  );
}

export function LearningArticlesPage() {
  useAdminDocumentTitle("Learning Articles");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  const [sp, setSp] = useSearchParams();
  const statusFilter = sp.get("status") || "";
  const qc = useQueryClient();

  const qk = useMemo(() => adminQueryKeys.learningArticles(`status=${statusFilter || "all"}`), [statusFilter]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      const qs = p.toString();
      return adminApi.getJson<Article[]>(`/api/admin/content/learning/articles${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const categoriesQ = useQuery({
    queryKey: [...adminQueryKeys.learningArticlesAll(), "categories"],
    queryFn: () => adminApi.getJson<LearningCategory[]>("/api/admin/content/learning/categories", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const featuredQ = useQuery({
    queryKey: [...adminQueryKeys.learningArticlesAll(), "featured"],
    queryFn: () => adminApi.getJson<{ article_ids: string[] }>("/api/admin/content/learning/featured"),
    enabled: allowed,
  });

  const homepageQ = useQuery({
    queryKey: [...adminQueryKeys.learningArticlesAll(), "homepage"],
    queryFn: () =>
      adminApi.getJson<Record<string, unknown>>("/api/admin/content/learning/homepage", {
        timeoutMs: 60_000,
      }),
    enabled: allowed,
  });

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [mutError, setMutError] = useState<string | null>(null);
  const [featuredInput, setFeaturedInput] = useState("");

  const setStatusFilter = useCallback(
    (value: string) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (!value) n.delete("status");
          else n.set("status", value);
          return n;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const invalidateArticles = () => {
    void qc.invalidateQueries({ queryKey: adminQueryKeys.learningArticlesAll() });
  };

  const createMut = useMutation({
    mutationFn: (d: Partial<Article>) => adminApi.postJson("/api/admin/content/learning/articles", d),
    onSuccess: () => {
      invalidateArticles();
      setModal(null);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Partial<Article> & { id: string }) =>
      adminApi.patchJson(`/api/admin/content/learning/articles/${id}`, d),
    onSuccess: () => {
      invalidateArticles();
      setModal(null);
      setEditId(null);
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/content/learning/articles/${id}`),
    onSuccess: () => {
      invalidateArticles();
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to delete"),
  });

  const featuredMut = useMutation({
    mutationFn: (ids: string[]) => adminApi.patchJson("/api/admin/content/learning/featured", { article_ids: ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...adminQueryKeys.learningArticlesAll(), "featured"] });
      setMutError(null);
    },
    onError: (e) => setMutError(e instanceof Error ? e.message : "Failed to update featured"),
  });

  const rows = (q.data ?? []) as Article[];
  const categories = categoriesQ.data ?? [];
  const editRow = editId ? rows.find((r) => r.id === editId) : undefined;

  const filteredRows = useMemo(() => {
    const qv = search.trim().toLowerCase();
    if (!qv) return rows;
    return rows.filter((r) => {
      const hay = [r.title, r.slug, r.summary, r.status, r.audience, r.body?.slice(0, 400)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qv);
    });
  }, [rows, search]);

  const hasFilters = Boolean(statusFilter);

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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Learning articles"
        description="Help center and guides for customers and providers. Matches the legacy Next.js content hub: categories come from Learning categories; featured IDs power the learning homepage section."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <strong>Note:</strong> Publishing changes what appears in the app learning center. Use{" "}
        <span className="font-medium">Featured article IDs</span> below to pin rows on the homepage (order preserved).
      </div>

      <AdminPanel className="border-indigo-100 bg-indigo-50/50">
        <h2 className="text-sm font-semibold text-gray-900">Learning homepage</h2>
        <p className="mt-1 text-xs text-gray-600">
          Section keys loaded:{" "}
          <span className="font-mono text-[11px] text-gray-800">
            {homepageQ.data ? Object.keys(homepageQ.data).join(", ") : homepageQ.isLoading ? "…" : "—"}
          </span>
        </p>
        <label className="mt-3 block text-xs font-medium text-gray-700">Featured article IDs (comma-separated UUIDs)</label>
        <textarea
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
          value={featuredInput || (featuredQ.data?.article_ids ?? []).join(", ")}
          onChange={(e) => setFeaturedInput(e.target.value)}
          placeholder="uuid-1, uuid-2"
        />
        <button
          type="button"
          className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
          disabled={featuredMut.isPending}
          onClick={() => {
            const raw = featuredInput.trim() || (featuredQ.data?.article_ids ?? []).join(", ");
            const ids = raw
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean);
            featuredMut.mutate(ids);
          }}
        >
          {featuredMut.isPending ? "Saving…" : "Save featured list"}
        </button>
      </AdminPanel>

      <AdminPanel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search title, slug, summary, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm"
              aria-label="Status"
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
              <option value="archived">Archived</option>
            </select>
            {hasFilters ? (
              <button
                type="button"
                className="min-h-11 rounded-xl border border-gray-300 px-3 text-sm"
                onClick={() => setSp(new URLSearchParams(), { replace: true })}
              >
                Clear filters
              </button>
            ) : null}
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
              New article
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
        title={modal === "edit" ? "Edit article" : "New article"}
        description="Rich HTML body with images and YouTube embeds (learning tools); video guides use the same editor for intro text plus embedded video."
        size="xl"
        footer={null}
      >
        {modal === "create" ? (
          <ArticleForm
            key="article-create"
            mode="create"
            initial={EMPTY_ARTICLE_INITIAL}
            categories={categories}
            onSave={(d) => createMut.mutate(d)}
            onCancel={() => {
              setModal(null);
              setMutError(null);
            }}
            isSaving={createMut.isPending}
            error={mutError}
          />
        ) : modal === "edit" && editRow ? (
          <ArticleForm
            key={editRow.id}
            mode="edit"
            initial={editRow}
            categories={categories}
            onSave={(d) => updateMut.mutate(d as Partial<Article> & { id: string })}
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

      {categories.length === 0 && !categoriesQ.isLoading ? (
        <p className="text-sm text-amber-800">
          No learning categories yet — create categories under Learning categories (or the legacy CMS) before adding articles.
        </p>
      ) : null}

      {filteredRows.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No articles" : "No matches"}
          description={rows.length === 0 ? "Create an article to populate the learning center." : "Try a different search or status filter."}
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Title</AdminTh>
              <AdminTh>Slug</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Audience</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {filteredRows.map((r) => (
              <tr key={r.id}>
                <AdminTd className="font-medium">{r.title}</AdminTd>
                <AdminTd className="font-mono text-xs text-gray-600">{r.slug}</AdminTd>
                <AdminTd>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "published"
                        ? "bg-green-100 text-green-700"
                        : r.status === "draft"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </AdminTd>
                <AdminTd className="text-sm text-gray-700">{r.audience}</AdminTd>
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
                        if (confirm(`Delete "${r.title}"?`)) deleteMut.mutate(r.id);
                      }}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
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

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <strong className="text-gray-800">API</strong>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <code className="rounded bg-gray-100 px-1">GET/POST /api/admin/content/learning/articles</code>,{" "}
            <code className="rounded bg-gray-100 px-1">PATCH /api/admin/content/learning/articles/[id]</code>
          </li>
          <li>
            Categories: <code className="rounded bg-gray-100 px-1">/api/admin/content/learning/categories</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
