import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { BookOpen, Lock } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { LearningArticlePicker } from "@/components/learning/LearningArticlePicker";
import { audienceLabel, type KbBrowseResponse } from "@/lib/learning";

export function KnowledgeBasePage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OVERVIEW, "Admin access is required.");
  const [showInternalOnly, setShowInternalOnly] = useState(false);

  const browseQ = useQuery({
    queryKey: adminQueryKeys.knowledgeBase.browse(),
    queryFn: () => adminApi.getJson<KbBrowseResponse>("/api/admin/learning/browse", { timeoutMs: 45_000 }),
    enabled: allowed,
    staleTime: 5 * 60_000,
  });

  const sections = useMemo(() => {
    const all = browseQ.data?.sections ?? [];
    if (!showInternalOnly) return all;
    return all
      .map((s) => ({ ...s, articles: s.articles.filter((a) => a.is_internal) }))
      .filter((s) => s.articles.length > 0);
  }, [browseQ.data, showInternalOnly]);

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Knowledge base"
        description="Train and self-serve from the same articles customers and providers see — plus internal runbooks for support and ops."
      />

      <AdminPanel>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <BookOpen className="h-4 w-4 text-purple-600" aria-hidden />
          Search articles
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Includes internal runbooks. Use this to learn the platform or find an answer while helping a user.
        </p>
        <div className="mt-3">
          <LearningArticlePicker includeInternal limit={10} placeholder="Search guides, policies, and runbooks…" />
        </div>
      </AdminPanel>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {browseQ.data ? (
            <>
              <span className="font-medium text-gray-900">{browseQ.data.total_articles}</span> published articles
              {" · "}
              <span className="font-medium text-amber-700">{browseQ.data.internal_articles}</span> internal
            </>
          ) : (
            "Browse by category"
          )}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={showInternalOnly}
            onChange={(e) => setShowInternalOnly(e.target.checked)}
          />
          Internal runbooks only
        </label>
      </div>

      {browseQ.isLoading ? (
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      ) : browseQ.error ? (
        isAdminApiAuthFailure(browseQ.error) ? (
          <PermissionDenied />
        ) : (
          <AdminRetryBlock message={browseQ.error.message} onRetry={() => void browseQ.refetch()} />
        )
      ) : sections.length === 0 ? (
        <AdminPanel>
          <p className="text-sm text-gray-600">No articles to show.</p>
        </AdminPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <AdminPanel key={section.id}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
                <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {section.visibility === "internal" ? (
                    <>
                      <Lock className="h-3 w-3" aria-hidden /> Internal
                    </>
                  ) : (
                    audienceLabel(section.audience)
                  )}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-gray-100">
                {section.articles.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={adminSpaTo(`/admin/knowledge-base/${a.slug}`)}
                      className="flex items-start justify-between gap-3 py-2.5 hover:bg-gray-50/80"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{a.title}</p>
                        {a.summary ? <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{a.summary}</p> : null}
                      </div>
                      {a.is_internal ? (
                        <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          Internal
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </AdminPanel>
          ))}
        </div>
      )}
    </div>
  );
}
