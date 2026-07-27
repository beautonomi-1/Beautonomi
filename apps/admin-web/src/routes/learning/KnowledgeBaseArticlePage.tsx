import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { ExternalLink, Lock, ChevronLeft, ChevronRight, GraduationCap, Clock } from "lucide-react";
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
import {
  audienceLabel,
  LEARNING_ARTICLE_PROSE_CLASS,
  publicLearnUrl,
  renderKbHtml,
  buildToc,
  injectHeadingIds,
  estimateReadMinutes,
  type KbArticleDetail,
  type KbTrainingPath,
} from "@/lib/learning";

export function KnowledgeBaseArticlePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const pathSlug = searchParams.get("path");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OVERVIEW, "Admin access is required.");

  // ── Main article ────────────────────────────────────────────────────────

  const articleQ = useQuery({
    queryKey: adminQueryKeys.knowledgeBase.article(slug),
    queryFn: () =>
      adminApi.getJson<KbArticleDetail>(`/api/admin/learning/articles/${encodeURIComponent(slug)}`, {
        timeoutMs: 30_000,
      }),
    enabled: allowed && !!slug,
    staleTime: 5 * 60_000,
  });

  // ── Training path (for breadcrumb + prev/next) ──────────────────────────

  const pathQ = useQuery({
    queryKey: adminQueryKeys.knowledgeBase.trainingPaths(),
    queryFn: () =>
      adminApi.getJson<KbTrainingPath[]>("/api/admin/learning/training-paths", { timeoutMs: 30_000 }),
    enabled: allowed && !!pathSlug,
    staleTime: 5 * 60_000,
  });

  const currentPath = useMemo(
    () => (pathSlug ? (pathQ.data ?? []).find((p) => p.slug === pathSlug) ?? null : null),
    [pathQ.data, pathSlug],
  );

  const currentStepIndex = useMemo(
    () => (currentPath ? currentPath.steps.findIndex((s) => s.slug === slug) : -1),
    [currentPath, slug],
  );

  const prevStep = currentPath && currentStepIndex > 0 ? currentPath.steps[currentStepIndex - 1] : null;
  const nextStep =
    currentPath && currentStepIndex >= 0 && currentStepIndex < currentPath.steps.length - 1
      ? currentPath.steps[currentStepIndex + 1]
      : null;

  // ── Rendered content ────────────────────────────────────────────────────

  const article = articleQ.data;

  const html = useMemo(() => {
    if (!article?.body) return "";
    return injectHeadingIds(renderKbHtml(article.body));
  }, [article?.body]);

  const toc = useMemo(() => buildToc(html), [html]);
  const readMinutes = useMemo(() => (article?.body ? estimateReadMinutes(article.body) : 0), [article?.body]);

  if (denied) return denied;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500" aria-label="Breadcrumb">
        <Link to={adminSpaTo("/admin/knowledge-base")} className="hover:text-gray-800">
          Knowledge base
        </Link>
        {currentPath ? (
          <>
            <span>/</span>
            <Link
              to={adminSpaTo(`/admin/knowledge-base?tab=paths`)}
              className="inline-flex items-center gap-1 hover:text-gray-800"
            >
              <GraduationCap className="h-3 w-3" aria-hidden />
              {currentPath.title}
            </Link>
          </>
        ) : null}
        {article?.learning_categories ? (
          <>
            <span>/</span>
            <span className="text-gray-700">{article.learning_categories.title}</span>
          </>
        ) : null}
        <span>/</span>
        <span className="font-medium text-gray-900">{article?.title ?? slug}</span>
      </nav>

      {/* Training path banner + prev/next */}
      {currentPath ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <GraduationCap className="h-4 w-4 text-purple-600" aria-hidden />
            <span className="font-medium text-purple-900">
              {currentPath.title}
            </span>
            {currentStepIndex >= 0 ? (
              <span className="text-purple-600">
                — Step {currentStepIndex + 1} of {currentPath.steps.length}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {prevStep ? (
              <Link
                to={adminSpaTo(`/admin/knowledge-base/${prevStep.slug}?path=${pathSlug}`)}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                {prevStep.title}
              </Link>
            ) : null}
            {nextStep ? (
              <Link
                to={adminSpaTo(`/admin/knowledge-base/${nextStep.slug}?path=${pathSlug}`)}
                className="inline-flex items-center gap-1 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-800"
              >
                {nextStep.title}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : (
              currentStepIndex >= 0 && currentStepIndex === (currentPath?.steps.length ?? 0) - 1 ? (
                <span className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-800">
                  Path complete
                </span>
              ) : null
            )}
          </div>
        </div>
      ) : null}

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
          <AdminRetryBlock
            message={(articleQ.error as Error).message}
            onRetry={() => void articleQ.refetch()}
          />
        )
      ) : !article ? (
        <AdminPanel>
          <p className="text-sm text-gray-600">Article not found.</p>
        </AdminPanel>
      ) : (
        <div className="flex gap-6">
          {/* Main article body */}
          <AdminPanel className="min-w-0 flex-1">
            {/* Meta row */}
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
              {readMinutes > 0 ? (
                <span className="inline-flex items-center gap-1 ml-auto text-gray-400">
                  <Clock className="h-3 w-3" aria-hidden />
                  {readMinutes} min read
                </span>
              ) : null}
              {!readMinutes ? (
                <span className="ml-auto text-gray-400">
                  Updated {new Date(article.updated_at).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-gray-400">
                  Updated {new Date(article.updated_at).toLocaleDateString()}
                </span>
              )}
            </div>

            <article className={LEARNING_ARTICLE_PROSE_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
          </AdminPanel>

          {/* Table of contents — sticky sidebar */}
          {toc.length > 1 ? (
            <aside className="hidden w-48 shrink-0 xl:block">
              <div className="sticky top-4 space-y-1">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  On this page
                </p>
                {toc.map((entry) => (
                  <a
                    key={entry.id}
                    href={`#${entry.id}`}
                    className={`block rounded py-1 text-xs text-gray-600 hover:text-gray-900 ${
                      entry.level === 3 ? "pl-3 text-gray-500" : "font-medium"
                    }`}
                  >
                    {entry.text}
                  </a>
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      )}

      {/* Bottom prev/next strip */}
      {currentPath && (prevStep || nextStep) ? (
        <div className="flex justify-between gap-4 border-t border-gray-200 pt-4">
          {prevStep ? (
            <Link
              to={adminSpaTo(`/admin/knowledge-base/${prevStep.slug}?path=${pathSlug}`)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4 text-gray-400" aria-hidden />
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">Previous</div>
                <div className="truncate max-w-[160px]">{prevStep.title}</div>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {nextStep ? (
            <Link
              to={adminSpaTo(`/admin/knowledge-base/${nextStep.slug}?path=${pathSlug}`)}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
            >
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-white/60">Next</div>
                <div className="truncate max-w-[160px]">{nextStep.title}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-white/70" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
