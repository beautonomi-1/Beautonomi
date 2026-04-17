import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
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
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { publicEnv } from "@/config/publicEnv";
import { ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff } from "lucide-react";

const LIMIT = 50;
const BUCKET = "explore-posts";

const SORT_OPTIONS = [
  { value: "published_at_desc", label: "Newest published" },
  { value: "published_at_asc", label: "Oldest published" },
  { value: "like_count_desc", label: "Most likes" },
  { value: "comment_count_desc", label: "Most comments" },
  { value: "save_count_desc", label: "Most saves" },
  { value: "created_at_desc", label: "Recently created" },
] as const;

function mediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = publicEnv.supabaseUrl ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

type ExplorePayload = {
  posts: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};

type ProviderJoin = { business_name?: string; slug?: string; id?: string };

export function ExplorePostsPage() {
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_CONTENT_CATALOG,
    "Content and catalog access is required for Explore moderation."
  );
  const [sp, setSp] = useSearchParams();

  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const statusFilter = sp.get("status") ?? "";
  const hiddenFilter = sp.get("hidden") ?? "";
  const sortFilter = sp.get("sort") ?? "published_at_desc";
  const dateFrom = sp.get("date_from") ?? "";
  const dateTo = sp.get("date_to") ?? "";
  const providerIdFilter = sp.get("provider_id") ?? "";
  const searchFromUrl = sp.get("search") ?? "";

  const [providerDraft, setProviderDraft] = useState(providerIdFilter);
  useEffect(() => {
    setProviderDraft(providerIdFilter);
  }, [providerIdFilter]);

  const [searchDraft, setSearchDraft] = useState(searchFromUrl);
  useEffect(() => {
    setSearchDraft(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft.trim() === searchFromUrl.trim()) return;
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          const v = searchDraft.trim();
          if (v) n.set("search", v);
          else n.delete("search");
          n.set("offset", "0");
          return n;
        },
        { replace: true }
      );
    }, 400);
    return () => clearTimeout(t);
  }, [searchDraft, searchFromUrl, setSp]);

  const setFilter = useCallback(
    (key: string, value: string) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (!value) n.delete(key);
          else n.set(key, value);
          n.set("offset", "0");
          return n;
        },
        { replace: true }
      );
    },
    [setSp]
  );

  const queryString = useMemo(() => sp.toString(), [sp]);
  const qk = useMemo(() => adminQueryKeys.explorePosts(queryString), [queryString]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [bulkHideOpen, setBulkHideOpen] = useState(false);
  const [singleHidePostId, setSingleHidePostId] = useState<string | null>(null);
  const [singleHideNotes, setSingleHideNotes] = useState("");

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams(sp);
      p.set("limit", String(LIMIT));
      p.set("offset", String(offset));
      if (!p.get("sort")) p.set("sort", "published_at_desc");
      return adminApi.getJson<ExplorePayload>(`/api/admin/explore/posts?${p.toString()}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.posts ?? [];
  const total = q.data?.total ?? 0;

  const modMut = useMutation({
    mutationFn: (action: "hide" | "unhide") =>
      adminApi.postJson<{ updated?: number }>("/api/admin/explore/posts", {
        action,
        post_ids: Array.from(selected),
        moderation_notes: action === "hide" && notes.trim() ? notes.trim() : undefined,
      }),
    onSuccess: async (res) => {
      setSelected(new Set());
      setBulkHideOpen(false);
      const n = res?.updated ?? 0;
      setMsg(`Updated ${n} post(s).`);
      adminToast.success(n ? `Updated ${n} post(s)` : "No posts were updated");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.explorePostsAll() });
      await qc.invalidateQueries({ queryKey: qk });
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "Moderation failed";
      setMsg(m);
      adminToast.error(m);
    },
  });

  type SinglePostModerationVars = {
    id: string;
    is_hidden: boolean;
    moderation_notes?: string | null;
  };

  const singlePostMut = useMutation({
    mutationFn: (vars: SinglePostModerationVars) =>
      adminApi.patchJson<Record<string, unknown>>(`/api/admin/explore/posts/${vars.id}`, {
        is_hidden: vars.is_hidden,
        ...(vars.moderation_notes !== undefined ? { moderation_notes: vars.moderation_notes } : {}),
      }),
    onSuccess: async (_data, vars) => {
      setSingleHidePostId(null);
      setSingleHideNotes("");
      adminToast.success(vars.is_hidden ? "Post hidden" : "Post unhidden");
      await qc.invalidateQueries({ queryKey: adminQueryKeys.explorePostsAll() });
      await qc.invalidateQueries({ queryKey: qk });
      await qc.invalidateQueries({ queryKey: adminQueryKeys.explorePostDetail(vars.id) });
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "Update failed";
      setMsg(m);
      adminToast.error(m);
    },
  });

  const rowBusyId = singlePostMut.isPending ? singlePostMut.variables?.id : undefined;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allIds = rows.map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const helpHref = publicEnv.siteUrl ? `${publicEnv.siteUrl.replace(/\/$/, "")}/help` : "/help";

  const hasFilters =
    searchFromUrl ||
    statusFilter ||
    hiddenFilter ||
    (sortFilter && sortFilter !== "published_at_desc") ||
    dateFrom ||
    dateTo ||
    providerIdFilter;

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Explore" />
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
        title="Explore"
        description="Moderate provider posts for the public Explore feed: search, filter, hide or unhide, and open a post to review media, metrics, and comments."
      />

      <AdminPanel className="border-amber-200 bg-amber-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-950">
            Hidden posts are removed from the public feed. Align actions with your community guidelines.
          </p>
          <a
            href={helpHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-amber-900 underline"
          >
            Help and policies
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </AdminPanel>

      {msg ? (
        <AdminPanel>
          <p className="text-sm text-gray-700">{msg}</p>
        </AdminPanel>
      ) : null}

      <AdminPanel>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="flex min-w-[200px] flex-1 flex-col text-xs font-medium text-gray-600">
            Search caption or provider name
            <input
              type="search"
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Keywords…"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setFilter("status", e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm lg:w-44"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <select
            value={hiddenFilter}
            onChange={(e) => setFilter("hidden", e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm lg:w-44"
          >
            <option value="">All visibility</option>
            <option value="true">Hidden only</option>
            <option value="false">Visible only</option>
          </select>
          <select
            value={sortFilter}
            onChange={(e) => setFilter("sort", e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm lg:min-w-[12rem]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="text-xs font-medium text-gray-600">
            From
            <input
              type="date"
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(e) => setFilter("date_from", e.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-gray-600">
            To
            <input
              type="date"
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={dateTo}
              onChange={(e) => setFilter("date_to", e.target.value)}
            />
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col text-xs font-medium text-gray-600">
            Provider ID (optional)
            <input
              type="text"
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
              value={providerDraft}
              onChange={(e) => setProviderDraft(e.target.value)}
              onBlur={() => {
                const v = providerDraft.trim();
                if (v !== providerIdFilter) setFilter("provider_id", v);
              }}
              placeholder="UUID to narrow to one provider"
            />
          </label>
          {hasFilters ? (
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800"
              onClick={() => {
                setSp(new URLSearchParams(), { replace: true });
                setSearchDraft("");
                setProviderDraft("");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Showing {rows.length} of {total} (offset {offset})
        </p>

        {rows.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[200px] flex-1 flex-col text-xs font-medium text-gray-600">
              Moderation note (optional, hide only)
              <textarea
                className="mt-1 min-h-[60px] rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
                disabled={selected.size === 0 || modMut.isPending}
                onClick={() => setBulkHideOpen(true)}
              >
                Hide selected…
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
                disabled={selected.size === 0 || modMut.isPending}
                onClick={() => modMut.mutate("unhide")}
              >
                Unhide selected
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>

      {rows.length === 0 ? (
        <EmptyState title="No posts" description={hasFilters ? "Try adjusting filters or search." : "No explore posts yet."} />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    if (allSelected) setSelected(new Set());
                    else setSelected(new Set(allIds));
                  }}
                  aria-label="Select all on page"
                />
              </AdminTh>
              <AdminTh className="w-24">Preview</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Caption</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Engagement</AdminTh>
              <AdminTh>Visibility</AdminTh>
              <AdminTh className="text-right">Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const id = String(row.id ?? "");
              const provRaw = row.providers as ProviderJoin | ProviderJoin[] | undefined;
              const prov = Array.isArray(provRaw) ? provRaw[0] : provRaw;
              const media = Array.isArray(row.media_urls) ? (row.media_urls as string[])[0] : undefined;
              const hidden = Boolean(row.is_hidden);
              return (
                <tr key={id} className={hidden ? "bg-gray-50/90" : undefined}>
                  <AdminTd>
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggle(id)}
                      aria-label={`Select post ${id}`}
                    />
                  </AdminTd>
                  <AdminTd>
                    {media ? (
                      <img
                        src={mediaUrl(media)}
                        alt=""
                        className="h-14 w-14 rounded-md border border-gray-200 object-cover"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </AdminTd>
                  <AdminTd className="max-w-[10rem]">
                    {prov?.id ? (
                      <Link className="text-sm font-medium text-primary underline" to={adminSpaTo(`/admin/providers/${prov.id}`)}>
                        {prov.business_name || prov.slug || prov.id}
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </AdminTd>
                  <AdminTd className="max-w-md">
                    <p className="line-clamp-2 text-xs text-gray-800">{String(row.caption ?? "")}</p>
                  </AdminTd>
                  <AdminTd>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{String(row.status ?? "")}</span>
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-xs tabular-nums text-gray-700">
                    Likes {String(row.like_count ?? 0)} · Cmt {String(row.comment_count ?? 0)} · Saves {String(row.save_count ?? 0)}
                  </AdminTd>
                  <AdminTd>
                    {hidden ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900">Hidden</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">Live</span>
                    )}
                  </AdminTd>
                  <AdminTd className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link className="text-sm font-medium text-primary underline" to={adminSpaTo(`/admin/explore/${id}`)}>
                        Open
                      </Link>
                      {hidden ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 disabled:opacity-50"
                          disabled={rowBusyId === id}
                          title="Show in public feed again"
                          onClick={() => {
                            if (!window.confirm("Unhide this post and show it in the public Explore feed again?")) return;
                            singlePostMut.mutate({ id, is_hidden: false, moderation_notes: null });
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Unhide
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 disabled:opacity-50"
                          disabled={rowBusyId === id}
                          title="Remove from public feed"
                          onClick={() => {
                            setSingleHideNotes("");
                            setSingleHidePostId(id);
                          }}
                        >
                          <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Hide
                        </button>
                      )}
                    </div>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      <div className="flex flex-col items-center justify-between gap-3 text-sm text-gray-600 sm:flex-row">
        <p>
          Page {Math.floor(offset / LIMIT) + 1} · {total} total
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:opacity-40"
            disabled={offset <= 0}
            onClick={() => {
              setSp(
                (prev) => {
                  const n = new URLSearchParams(prev);
                  n.set("offset", String(Math.max(0, offset - LIMIT)));
                  return n;
                },
                { replace: true }
              );
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:opacity-40"
            disabled={offset + rows.length >= total}
            onClick={() => {
              setSp(
                (prev) => {
                  const n = new URLSearchParams(prev);
                  n.set("offset", String(offset + LIMIT));
                  return n;
                },
                { replace: true }
              );
            }}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {bulkHideOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Hide {selected.size} post(s)?</h3>
            <p className="mt-2 text-sm text-gray-600">Optional note is saved on each hidden post.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" onClick={() => setBulkHideOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white"
                onClick={() => {
                  modMut.mutate("hide");
                }}
              >
                Hide
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {singleHidePostId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Hide this post?</h3>
            <p className="mt-2 text-sm text-gray-600">It will be removed from the public Explore feed. Optional note is saved on the post.</p>
            <label className="mt-4 flex flex-col text-xs font-medium text-gray-600">
              Moderation note (optional)
              <textarea
                className="mt-1 min-h-[72px] rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                value={singleHideNotes}
                onChange={(e) => setSingleHideNotes(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                onClick={() => {
                  setSingleHidePostId(null);
                  setSingleHideNotes("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={singlePostMut.isPending}
                onClick={() => {
                  const note = singleHideNotes.trim();
                  singlePostMut.mutate({
                    id: singleHidePostId,
                    is_hidden: true,
                    ...(note ? { moderation_notes: note } : {}),
                  });
                }}
              >
                Hide
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
