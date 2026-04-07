import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { publicEnv } from "@/config/publicEnv";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";

const BUCKET = "explore-posts";

function mediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = publicEnv.supabaseUrl ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

type ExploreDetailPayload = {
  post: Record<string, unknown>;
  comments: Array<Record<string, unknown>>;
  view_count: number;
};

export function ExplorePostDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content access required.");
  const [hideReason, setHideReason] = useState("");
  const [showHideModal, setShowHideModal] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.explorePostDetail(id),
    queryFn: () =>
      adminApi.getJson<ExploreDetailPayload>(`/api/admin/explore/posts/${encodeURIComponent(id)}`, {
        timeoutMs: 60_000,
      }),
    enabled: allowed && !!id,
  });

  const patchMutation = useMutation({
    mutationFn: (body: { is_hidden: boolean; moderation_notes?: string | null }) =>
      adminApi.patchJson(`/api/admin/explore/posts/${encodeURIComponent(id)}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.explorePostDetail(id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.explorePosts("") });
      setShowHideModal(false);
      setHideReason("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      adminApi.deleteJson(`/api/admin/explore/comments/${encodeURIComponent(commentId)}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.explorePostDetail(id) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.explorePosts("") });
    },
  });

  if (denied) return denied;
  if (!id) return <AdminRetryBlock message="Missing post id" onRetry={() => {}} />;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Explore post" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const bundle = q.data;
  const post = bundle?.post;
  if (!post) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Explore post" />
        <AdminPanel>
          <p className="text-sm text-gray-600">Post not found.</p>
        </AdminPanel>
      </div>
    );
  }

  const comments = bundle?.comments ?? [];
  const viewCount = bundle?.view_count ?? 0;
  const mediaUrls = (post.media_urls as string[]) ?? [];
  const providers = post.providers as { id?: string; business_name?: string; slug?: string } | undefined;
  const isHidden = Boolean(post.is_hidden);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Explore post"
        description={String(post.caption ?? "").slice(0, 120) || "Post detail"}
        actions={
          <Link
            to={adminSpaTo("/admin/explore")}
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
          >
            ← Queue
          </Link>
        }
      />

      <AdminMutationAlert
        errors={[
          patchMutation.error instanceof Error ? patchMutation.error : null,
          deleteCommentMutation.error instanceof Error ? deleteCommentMutation.error : null,
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <AdminPanel className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Media</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {mediaUrls.length === 0 ? (
              <p className="text-sm text-gray-500">No media</p>
            ) : (
              mediaUrls.map((u) => (
                <img
                  key={u}
                  src={mediaUrl(u)}
                  alt=""
                  className="max-h-80 max-w-full rounded-lg border border-gray-200 object-contain"
                />
              ))
            )}
          </div>
          <h3 className="mt-6 text-sm font-semibold text-gray-900">Caption</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{String(post.caption ?? "")}</p>
        </AdminPanel>

        <div className="space-y-6">
          <AdminPanel>
            <h2 className="text-lg font-semibold text-gray-900">Moderation</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Visibility</dt>
                <dd>
                  {isHidden ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900">Hidden from feed</span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">Visible</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Moderation notes</dt>
                <dd className="text-gray-800">{String(post.moderation_notes ?? "—")}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={adminToolbarButtonClass(patchMutation.isPending)}
                disabled={patchMutation.isPending}
                onClick={() => {
                  if (isHidden) {
                    void patchMutation.mutateAsync({ is_hidden: false, moderation_notes: null });
                  } else {
                    setShowHideModal(true);
                  }
                }}
              >
                {isHidden ? "Unhide" : "Hide"}
              </button>
            </div>
          </AdminPanel>

          <AdminPanel>
            <h2 className="text-lg font-semibold text-gray-900">Provider and metrics</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Provider</dt>
                <dd>
                  {providers?.id ? (
                    <Link className="font-medium text-primary underline" to={adminSpaTo(`/admin/providers/${providers.id}`)}>
                      {providers.business_name || providers.slug}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd>{String(post.status)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Published</dt>
                <dd>{post.published_at ? new Date(String(post.published_at)).toLocaleString() : "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Likes / comments / saves</dt>
                <dd className="tabular-nums">
                  {String(post.like_count)} / {String(post.comment_count)} / {String(post.save_count ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Views (approx.)</dt>
                <dd className="tabular-nums">{viewCount}</dd>
              </div>
            </dl>
          </AdminPanel>
        </div>
      </div>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Comments</h2>
        <ul className="mt-3 divide-y divide-gray-100">
          {comments.length === 0 ? (
            <li className="py-2 text-sm text-gray-500">No comments.</li>
          ) : (
            comments.map((c) => {
              const cid = String(c.id ?? "");
              const u = c.users as { email?: string; full_name?: string | null } | null;
              return (
                <li key={cid} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs text-gray-500">{u?.full_name || u?.email || "User"}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{String(c.body)}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {c.created_at ? new Date(String(c.created_at)).toLocaleString() : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded border border-red-200 px-2 py-1 text-xs text-red-800 hover:bg-red-50 disabled:opacity-50"
                    disabled={deleteCommentMutation.isPending}
                    onClick={() => {
                      if (confirm("Remove this comment?")) void deleteCommentMutation.mutateAsync(cid);
                    }}
                  >
                    Remove
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </AdminPanel>

      {showHideModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Hide post</h3>
            <p className="mt-2 text-sm text-gray-600">Add an internal reason (optional).</p>
            <textarea
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={hideReason}
              onChange={(e) => setHideReason(e.target.value)}
              placeholder="Reason for moderation…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                onClick={() => setShowHideModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white"
                onClick={() =>
                  void patchMutation.mutateAsync({
                    is_hidden: true,
                    moderation_notes: hideReason.trim() || null,
                  })
                }
              >
                Hide post
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
