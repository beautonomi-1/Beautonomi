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
import {
  CMS_PAGE_CONTENT_GROUP_LABELS,
  CMS_PAGE_CONTENT_GROUP_ORDER,
  CMS_PAGE_SECTION_PRESETS,
  cmsPageContentGroupForSlug,
  cmsPagePublicApiHint,
  cmsPageSlugTitle,
  cmsSectionPresetLabel,
} from "@/lib/cmsPageSectionPresets";
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
  const sectionPresets = CMS_PAGE_SECTION_PRESETS[pageSlug.trim()] ?? [];

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
          ) : sectionPresets.length > 0 ? (
            <div className="mt-2">
              <label className="text-xs text-gray-600">Quick pick (sets section key)</label>
              <select
                className="mt-1 min-h-9 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setSectionKey(v);
                  e.target.value = "";
                }}
              >
                <option value="">Choose a section for this page…</option>
                {sectionPresets.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} ({p.value})
                  </option>
                ))}
              </select>
            </div>
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
          {contentType === "html" ? (
            <p className="mt-1 text-xs text-gray-500">
              Full toolbar: headings, bold, lists, links, quotes, undo. Output is stored as HTML and sanitized on the public site.
            </p>
          ) : null}
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
              <RichTextEditor value={content} onChange={setContent} placeholder={`Content for ${sectionKey || "section"}…`} />
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
  /** Narrow the list to one `page_slug` (grouped headers still reflect the same taxonomy). */
  const [pageSlugFilter, setPageSlugFilter] = useState("");
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

  const searchedRows = useMemo(() => {
    const qv = search.trim().toLowerCase();
    if (!qv) return rows;
    return rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | undefined;
      const title = String(meta?.title ?? "");
      const preset = cmsSectionPresetLabel(r.page_slug, r.section_key) ?? "";
      const hay = [
        r.page_slug,
        r.section_key,
        title,
        preset,
        r.content_type,
        typeof r.content === "string" ? r.content.slice(0, 500) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qv);
    });
  }, [rows, search]);

  const slugFilteredRows = useMemo(() => {
    if (!pageSlugFilter) return searchedRows;
    return searchedRows.filter((r) => r.page_slug === pageSlugFilter);
  }, [searchedRows, pageSlugFilter]);

  const pageSlugOptions = useMemo(() => {
    const fromData = rows.map((r) => r.page_slug);
    const fromPresets = Object.keys(CMS_PAGE_SECTION_PRESETS);
    return [...new Set([...fromPresets, ...fromData])].sort((a, b) => {
      const ga = cmsPageContentGroupForSlug(a);
      const gb = cmsPageContentGroupForSlug(b);
      const ia = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(ga);
      const ib = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(gb);
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
  }, [rows]);

  const groupedCmsPanels = useMemo(() => {
    const slugMap = new Map<string, PageContent[]>();
    for (const r of slugFilteredRows) {
      if (!slugMap.has(r.page_slug)) slugMap.set(r.page_slug, []);
      slugMap.get(r.page_slug)!.push(r);
    }
    for (const list of slugMap.values()) {
      list.sort((a, b) => {
        const oa = Number(a.order) || 0;
        const ob = Number(b.order) || 0;
        if (oa !== ob) return oa - ob;
        return (a.section_key || "").localeCompare(b.section_key || "");
      });
    }
    const slugs = [...slugMap.keys()].sort((a, b) => {
      const ga = cmsPageContentGroupForSlug(a);
      const gb = cmsPageContentGroupForSlug(b);
      const ia = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(ga);
      const ib = CMS_PAGE_CONTENT_GROUP_ORDER.indexOf(gb);
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
    type GroupId = (typeof CMS_PAGE_CONTENT_GROUP_ORDER)[number];
    const out: { group: GroupId; panels: { slug: string; rows: PageContent[] }[] }[] = [];
    for (const gid of CMS_PAGE_CONTENT_GROUP_ORDER) {
      const panels = slugs
        .filter((s) => cmsPageContentGroupForSlug(s) === gid)
        .map((slug) => ({ slug, rows: slugMap.get(slug)! }));
      if (panels.length) out.push({ group: gid, panels });
    }
    return out;
  }, [slugFilteredRows]);

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
        <strong>Note:</strong> Each row is one <strong>section</strong> for a <strong>page slug</strong>. Slug and section
        keys are fixed after creation—add a new row for a new block. Content below is grouped by site area, then by
        page, with sections sorted by display order.
      </div>

      {pageSlugFilter === "become-a-partner" ? (
        <AdminPanel className="border-sky-200 bg-sky-50/80">
          <p className="text-sm font-semibold text-gray-900">Become a partner — same levers as Next.js admin</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-800">
            <li>
              Use <strong>HTML</strong> for hero and body copy; <strong>text</strong> for URLs and toggles;{" "}
              <strong>JSON</strong> for <code className="rounded bg-white px-1">features_list</code> and{" "}
              <code className="rounded bg-white px-1">hero_feature_tabs</code> (array of tab labels).
            </li>
            <li>
              <code className="rounded bg-white px-1">hero_primary_cta_label</code> overrides the main hero button (default
              &quot;Sign up&quot;). <code className="rounded bg-white px-1">video_tour_url</code> drives the video modal.
            </li>
            <li>
              Top strip: <code className="rounded bg-white px-1">top_banner_enabled</code> (true/1/yes),{" "}
              <code className="rounded bg-white px-1">top_banner_content</code>, <code className="rounded bg-white px-1">top_banner_link</code>,{" "}
              <code className="rounded bg-white px-1">top_banner_learn_more</code> for the link label.
            </li>
            <li>
              Demo booking: <code className="rounded bg-white px-1">demo_booking_type</code> (calendly/zoho) +{" "}
              <code className="rounded bg-white px-1">demo_booking_embed</code>.
            </li>
            <li>Live page loads grouped content from the public API shown on each card header.</li>
          </ul>
        </AdminPanel>
      ) : null}

      {pageSlugFilter === "pricing" ? (
        <AdminPanel className="border-emerald-200 bg-emerald-50/80">
          <p className="text-sm font-semibold text-gray-900">Pricing page — two surfaces</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-800">
            <li>
              <strong>Hero</strong> (title, intro, currency footnote): this CMS, slug <code className="rounded bg-white px-1">pricing</code> — sections{" "}
              <code className="rounded bg-white px-1">hero_title</code>, <code className="rounded bg-white px-1">hero_description</code>,{" "}
              <code className="rounded bg-white px-1">currency_note</code>.
            </li>
            <li>
              <strong>Plan cards &amp; bullets</strong>: Finance → <strong>Plans &amp; subscription products</strong>. Enable
              &quot;Show on pricing page&quot;, set the public price label, period, CTA, and rich-text feature lines (not the
              fallback hero text, which is only used when CMS rows are missing).
            </li>
          </ul>
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search slug, section, preset label, title, or body…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
              <label className="text-xs font-medium text-gray-600">Page slug</label>
              <select
                value={pageSlugFilter}
                onChange={(e) => setPageSlugFilter(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">All page slugs</option>
                {CMS_PAGE_CONTENT_GROUP_ORDER.map((gid) => {
                  const slugs = pageSlugOptions.filter((s) => cmsPageContentGroupForSlug(s) === gid);
                  if (!slugs.length) return null;
                  return (
                    <optgroup key={gid} label={CMS_PAGE_CONTENT_GROUP_LABELS[gid]}>
                      {slugs.map((slug) => (
                        <option key={slug} value={slug}>
                          {cmsPageSlugTitle(slug)} ({slug})
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
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
      ) : slugFilteredRows.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Try another search, clear the page slug filter, or create a missing section."
        />
      ) : (
        <div className="space-y-10">
          {groupedCmsPanels.map(({ group, panels }) => (
            <section key={group} className="space-y-4">
              <h2 className="border-b border-gray-200 pb-2 text-base font-semibold text-gray-900">
                {CMS_PAGE_CONTENT_GROUP_LABELS[group]}
              </h2>
              <div className="space-y-6">
                {panels.map(({ slug, rows: panelRows }) => {
                  const apiHint = cmsPagePublicApiHint(slug);
                  return (
                    <AdminPanel key={slug}>
                      <div className="mb-4 flex flex-col gap-2 border-b border-gray-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">{cmsPageSlugTitle(slug)}</h3>
                          <p className="font-mono text-xs text-gray-500">{slug}</p>
                          {apiHint ? (
                            <p className="mt-1 text-xs text-gray-500">
                              Public: <span className="font-mono">{apiHint}</span>
                            </p>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-500">
                          {panelRows.length} section{panelRows.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <AdminDataTable>
                        <AdminTableHead>
                          <tr>
                            <AdminTh>Title / Section</AdminTh>
                            <AdminTh>Preset</AdminTh>
                            <AdminTh>Section key</AdminTh>
                            <AdminTh>Type</AdminTh>
                            <AdminTh>Order</AdminTh>
                            <AdminTh>Status</AdminTh>
                            <AdminTh>Updated</AdminTh>
                            <AdminTh className="text-right">Actions</AdminTh>
                          </tr>
                        </AdminTableHead>
                        <AdminTableBody>
                          {panelRows.map((r) => {
                            const title = String((r.metadata as Record<string, unknown> | undefined)?.title ?? "");
                            const displayTitle = title || `${r.page_slug} / ${r.section_key}`;
                            const preset = cmsSectionPresetLabel(r.page_slug, r.section_key);
                            return (
                              <tr key={r.id}>
                                <AdminTd className="font-medium">{displayTitle}</AdminTd>
                                <AdminTd className="text-xs text-gray-600">{preset ?? "—"}</AdminTd>
                                <AdminTd className="text-xs font-mono text-gray-500">{r.section_key}</AdminTd>
                                <AdminTd>{r.content_type}</AdminTd>
                                <AdminTd className="text-xs tabular-nums text-gray-600">{r.order ?? 0}</AdminTd>
                                <AdminTd>
                                  <span
                                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                      r.is_active !== false
                                        ? "bg-green-100 text-green-700"
                                        : "bg-gray-100 text-gray-500"
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
                                        if (
                                          confirm(
                                            `Delete section "${displayTitle}" (${r.section_key}) permanently? This removes the CMS row.`,
                                          )
                                        )
                                          deleteMut.mutate(r.id);
                                      }}
                                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </AdminTd>
                              </tr>
                            );
                          })}
                        </AdminTableBody>
                      </AdminDataTable>
                    </AdminPanel>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

