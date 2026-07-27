import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OVERVIEW } from "@beautonomi/admin-access";
import { BookOpen, GraduationCap, Lock, Search } from "lucide-react";
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
import { TrainingPathList } from "@/components/learning/TrainingPathList";
import { KnowledgeBaseFilters, type KbFilterState } from "@/components/learning/KnowledgeBaseFilters";
import { KbCategorySidebar } from "@/components/learning/KbCategorySidebar";
import {
  audienceLabel,
  type KbBrowseResponse,
  type KbTrainingPath,
  type KbAudience,
} from "@/lib/learning";

type Tab = "paths" | "browse";

const DEFAULT_FILTERS: KbFilterState = {
  audience: "all",
  contentType: "all",
  internalOnly: false,
  query: "",
};

export function KnowledgeBasePage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OVERVIEW, "Admin access is required.");
  const [tab, setTab] = useState<Tab>("paths");
  const [filters, setFilters] = useState<KbFilterState>(DEFAULT_FILTERS);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  // ── Data queries ──────────────────────────────────────────────────────────

  const browseQ = useQuery({
    queryKey: adminQueryKeys.knowledgeBase.browse(),
    queryFn: () => adminApi.getJson<KbBrowseResponse>("/api/admin/learning/browse", { timeoutMs: 45_000 }),
    enabled: allowed,
    staleTime: 5 * 60_000,
  });

  const pathsQ = useQuery({
    queryKey: adminQueryKeys.knowledgeBase.trainingPaths(),
    queryFn: () => adminApi.getJson<KbTrainingPath[]>("/api/admin/learning/training-paths", { timeoutMs: 30_000 }),
    enabled: allowed,
    staleTime: 5 * 60_000,
  });

  // ── Filtered sections (Browse tab) ────────────────────────────────────────

  const filteredSections = useMemo(() => {
    const all = browseQ.data?.sections ?? [];
    return all
      .filter((s) => activeCategoryId === null || s.id === activeCategoryId)
      .map((s) => ({
        ...s,
        articles: s.articles.filter((a) => {
          if (filters.internalOnly && !a.is_internal) return false;
          if (filters.audience !== "all" && a.audience !== filters.audience) return false;
          if (
            filters.contentType !== "all" &&
            (a.content_type ?? "article") !== filters.contentType
          )
            return false;
          return true;
        }),
      }))
      .filter((s) => s.articles.length > 0);
  }, [browseQ.data, activeCategoryId, filters]);

  const totalShown = useMemo(
    () => filteredSections.reduce((n, s) => n + s.articles.length, 0),
    [filteredSections],
  );

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Knowledge base"
        description="Train and self-serve from the same articles customers and providers see — plus internal runbooks for support and ops."
      />

      {/* Search panel — always visible */}
      <AdminPanel>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Search className="h-4 w-4 text-purple-600" aria-hidden />
          Search articles
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Includes internal runbooks. Use this to learn the platform or find an answer while helping a user.
        </p>
        <div className="mt-3">
          <LearningArticlePicker
            includeInternal
            limit={10}
            placeholder="Search guides, policies, and runbooks…"
          />
        </div>
      </AdminPanel>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <TabButton active={tab === "paths"} icon={GraduationCap} onClick={() => setTab("paths")}>
          Training paths
        </TabButton>
        <TabButton active={tab === "browse"} icon={BookOpen} onClick={() => setTab("browse")}>
          Browse
          {browseQ.data ? (
            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
              {browseQ.data.total_articles}
            </span>
          ) : null}
        </TabButton>
      </div>

      {/* ── Training paths tab ─────────────────────────────────────────────── */}
      {tab === "paths" ? (
        <TrainingPathList
          paths={pathsQ.data ?? []}
          isLoading={pathsQ.isLoading}
          error={pathsQ.error as Error | null}
          onRetry={() => void pathsQ.refetch()}
        />
      ) : null}

      {/* ── Browse tab ─────────────────────────────────────────────────────── */}
      {tab === "browse" ? (
        <div>
          {/* Filters */}
          {browseQ.data ? (
            <div className="mb-4">
              <KnowledgeBaseFilters
                filters={filters}
                onChange={setFilters}
                totalShown={totalShown}
                totalArticles={browseQ.data.total_articles}
                internalArticles={browseQ.data.internal_articles}
              />
            </div>
          ) : null}

          {browseQ.isLoading ? (
            <AdminPanel>
              <AdminPageSkeleton rows={6} />
            </AdminPanel>
          ) : browseQ.error ? (
            isAdminApiAuthFailure(browseQ.error) ? (
              <PermissionDenied />
            ) : (
              <AdminRetryBlock
                message={(browseQ.error as Error).message}
                onRetry={() => void browseQ.refetch()}
              />
            )
          ) : (
            <div className="flex gap-6">
              {/* Sticky sidebar */}
              <aside className="hidden w-52 shrink-0 lg:block">
                <div className="sticky top-4">
                  <KbCategorySidebar
                    sections={browseQ.data?.sections ?? []}
                    activeId={activeCategoryId}
                    onSelect={setActiveCategoryId}
                  />
                </div>
              </aside>

              {/* Article cards */}
              <div className="min-w-0 flex-1 space-y-4">
                {filteredSections.length === 0 ? (
                  <AdminPanel>
                    <p className="text-sm text-gray-600">No articles match the current filters.</p>
                  </AdminPanel>
                ) : (
                  filteredSections.map((section) => (
                    <AdminPanel key={section.id}>
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
                        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {section.visibility === "internal" ? (
                            <>
                              <Lock className="h-3 w-3" aria-hidden /> Internal
                            </>
                          ) : (
                            audienceLabel(section.audience as KbAudience)
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
                                {a.summary ? (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{a.summary}</p>
                                ) : null}
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
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function TabButton({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-gray-900 text-gray-900"
          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-purple-600" : "text-gray-400"}`} aria-hidden />
      {children}
    </button>
  );
}
