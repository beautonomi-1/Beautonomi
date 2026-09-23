import { useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, ChevronDown, ChevronUp, Lock, BookOpen, Play, CheckCircle2 } from "lucide-react";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { audienceLabel, type KbTrainingPath } from "@/lib/learning";
import {
  countPublishedSteps,
  countSignedPublished,
  firstContinueSlug,
  stepIsCompletable,
  stepStatusLabel,
} from "@/lib/knowledgeBaseTraining";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

type Props = {
  paths: KbTrainingPath[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
};

const ROLE_COLORS: Record<string, string> = {
  support: "bg-blue-100 text-blue-800",
  provider_ops: "bg-violet-100 text-violet-800",
  finance: "bg-green-100 text-green-800",
  trust: "bg-red-100 text-red-800",
  content_marketing: "bg-amber-100 text-amber-800",
  superadmin: "bg-gray-900 text-white",
  commercial: "bg-teal-100 text-teal-800",
};

const roleLabel = (role: string) =>
  role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function TrainingPathList({ paths, isLoading, error, onRetry }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (slug: string) =>
    setExpanded((prev) => ({ ...prev, [slug]: !prev[slug] }));

  if (isLoading) {
    return (
      <AdminPanel>
        <AdminPageSkeleton rows={6} />
      </AdminPanel>
    );
  }

  if (error) {
    return <AdminRetryBlock message={error.message} onRetry={onRetry} />;
  }

  if (paths.length === 0) {
    return (
      <AdminPanel>
        <p className="text-sm text-gray-600">No training paths configured.</p>
      </AdminPanel>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {paths.map((path) => {
        const open = expanded[path.slug] ?? false;
        const colorClass = ROLE_COLORS[path.role] ?? "bg-gray-100 text-gray-700";
        const signed = path.progress.signed_off_slugs;
        const pubCount = countPublishedSteps(path.steps);
        const signedCount = countSignedPublished(path.steps, signed);
        const continueSlug = firstContinueSlug(path.steps, signed);
        const firstPublished = path.steps.find((s) => s.status === "published");
        const hasBroken = path.steps.some((s) => !stepIsCompletable(s.status));
        const isComplete = Boolean(path.progress.completed_at);

        const actionSlug = continueSlug ?? firstPublished?.slug;
        const actionLabel = isComplete
          ? "Review"
          : continueSlug
            ? "Continue"
            : signedCount === 0
              ? "Start"
              : "Continue";

        return (
          <AdminPanel key={path.id} className="flex flex-col gap-0 !p-0 overflow-hidden">
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colorClass}`}>
                    {roleLabel(path.role)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {signedCount}/{pubCount} signed off
                    {path.steps.length !== pubCount ? ` · ${path.steps.length} steps` : ""}
                  </span>
                  {isComplete ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      Complete
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-1.5 text-base font-semibold text-gray-900">{path.title}</h3>
                {path.description ? (
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 line-clamp-2">{path.description}</p>
                ) : null}
                {hasBroken ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    Some steps are missing or not published — completion is blocked until fixed.
                  </p>
                ) : null}
              </div>
              {actionSlug ? (
                <Link
                  to={adminSpaTo(`/admin/knowledge-base/${actionSlug}?path=${path.slug}`)}
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                >
                  <Play className="h-3 w-3" aria-hidden />
                  {actionLabel}
                </Link>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => toggle(path.slug)}
              className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50/80"
            >
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-purple-600" aria-hidden />
                {open ? "Hide steps" : "Show all steps"}
              </span>
              {open ? (
                <ChevronUp className="h-4 w-4 text-gray-400" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden />
              )}
            </button>

            {open ? (
              <ol className="divide-y divide-gray-100 border-t border-gray-100">
                {path.steps.map((step) => {
                  const done = signed.includes(step.slug);
                  const rowInner = (
                    <>
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {step.step}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {step.title ?? step.slug}
                        </p>
                        {step.summary ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{step.summary}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {!stepIsCompletable(step.status) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                            {stepStatusLabel(step.status)}
                          </span>
                        ) : done ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                            Signed off
                          </span>
                        ) : null}
                        {step.audience ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                            {audienceLabel(step.audience)}
                          </span>
                        ) : null}
                        {step.is_internal ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            <Lock className="h-2.5 w-2.5" aria-hidden />
                            Internal
                          </span>
                        ) : null}
                      </div>
                    </>
                  );

                  if (!stepIsCompletable(step.status)) {
                    return (
                      <li key={step.slug} className="flex items-start gap-3 px-4 py-2.5 bg-amber-50/40">
                        {rowInner}
                      </li>
                    );
                  }

                  return (
                    <li key={step.slug}>
                      <Link
                        to={adminSpaTo(`/admin/knowledge-base/${step.slug}?path=${path.slug}`)}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/80"
                      >
                        {rowInner}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </AdminPanel>
        );
      })}
    </div>
  );
}
