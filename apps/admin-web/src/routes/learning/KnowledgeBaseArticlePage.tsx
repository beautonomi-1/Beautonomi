import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { ExternalLink, Lock } from "lucide-react";
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
import { audienceLabel, LEARNING_ARTICLE_PROSE_CLASS, publicLearnUrl, renderKbHtml, type KbArticleDetail } from "@/lib/learning";

export function KnowledgeBaseArticlePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OVERVIEW, "Admin access is required.");

  const articleQ = useQuery({
    queryKey: adminQueryKeys.knowledgeBase.article(slug),
    queryFn: () =>
      adminApi.getJson<KbArticleDetail>(`/api/admin/learning/articles/${encodeURIComponent(slug)}`, {
        timeoutMs: 30_000,
      }),
    enabled: allowed && !!slug,
    staleTime: 5 * 60_000,
  });

  const article = articleQ.data;
  const html = useMemo(() => (article ? renderKbHtml(article.body) : ""), [article]);

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={article?.title ?? "Article"}
        description={article?.summary ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {article && !article.is_internal ? (
              <a
                href={publicLearnUrl(article.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
              >
                View live <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
            <Link
              to={adminSpaTo("/admin/knowledge-base")}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
            >
              ← Knowledge base
            </Link>
          </div>
        }
      />

      {articleQ.isLoading ? (
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      ) : articleQ.error ? (
        isAdminApiAuthFailure(articleQ.error) ? (
          <PermissionDenied />
        ) : (
          <AdminRetryBlock message={articleQ.error.message} onRetry={() => void articleQ.refetch()} />
        )
      ) : !article ? (
        <AdminPanel>
          <p className="text-sm text-gray-600">Article not found.</p>
        </AdminPanel>
      ) : (
        <AdminPanel>
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4 text-xs">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
              {audienceLabel(article.audience)}
            </span>
            {article.is_internal ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                <Lock className="h-3 w-3" aria-hidden /> Internal — not visible to customers
              </span>
            ) : null}
            {article.learning_categories ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                {article.learning_categories.title}
              </span>
            ) : null}
            <span className="ml-auto text-gray-400">
              Updated {new Date(article.updated_at).toLocaleDateString()}
            </span>
          </div>
          <article className={LEARNING_ARTICLE_PROSE_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
        </AdminPanel>
      )}
    </div>
  );
}
