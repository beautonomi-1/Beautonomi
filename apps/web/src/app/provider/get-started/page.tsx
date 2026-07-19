"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, RefreshCw, ArrowRight } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  link: string;
}

interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  steps: SetupStep[];
  providerStatus?: string | null;
}

export default function GetStartedPage() {
  const router = useRouter();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    loadSetupStatus();
  }, []);

  useEffect(() => {
    const MIN_MS = 2000;
    const handleRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < MIN_MS) return;
      sessionStorage.removeItem("shouldRefreshSetupStatus");
      loadSetupStatus(true);
    };
    document.addEventListener("visibilitychange", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      document.removeEventListener("visibilitychange", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, []);

  const loadSetupStatus = async (isRefresh = false) => {
    try {
      isRefresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);
      const previousCompletion = setupStatus?.completionPercentage ?? null;
      const res = await fetcher.get<{ data: SetupStatus }>(
        `/api/provider/setup-status?_=${Date.now()}`
      );
      const next = res.data ?? {
        isComplete: false,
        completionPercentage: 0,
        steps: [],
      };
      setSetupStatus(next);
      lastFetchRef.current = Date.now();
      if (
        isRefresh &&
        previousCompletion !== null &&
        previousCompletion !== next.completionPercentage
      ) {
        toast.success("Progress updated");
      }
    } catch (err) {
      const msg =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load setup status";
      setError(msg);
      if (isRefresh) toast.error("Could not refresh status");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleStepClick = (step: SetupStep) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("getStartedReturnUrl", "/provider/get-started");
      sessionStorage.setItem("shouldRefreshSetupStatus", "true");
    }
    const sep = step.link.includes("?") ? "&" : "?";
    router.push(
      `${step.link}${sep}returnTo=${encodeURIComponent("/provider/get-started")}`
    );
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Get Started"
        breadcrumbs={[
          { label: "Provider", href: "/provider" },
          { label: "Get Started" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading your setup checklist…" />
      </SettingsDetailLayout>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error || !setupStatus) {
    return (
      <SettingsDetailLayout
        title="Get Started"
        breadcrumbs={[
          { label: "Provider", href: "/provider" },
          { label: "Get Started" },
        ]}
      >
        <div className="rounded-xl border border-red-100 bg-red-50 p-6">
          <p className="text-sm text-red-700 mb-4">
            {error ?? "Something went wrong loading your checklist."}
          </p>
          <Button size="sm" onClick={() => loadSetupStatus()}>
            Try again
          </Button>
        </div>
      </SettingsDetailLayout>
    );
  }

  // ── No provider row yet (pre-wizard) ───────────────────────────────────────
  if (!setupStatus.steps || setupStatus.steps.length === 0) {
    return (
      <SettingsDetailLayout
        title="Get Started"
        breadcrumbs={[
          { label: "Provider", href: "/provider" },
          { label: "Get Started" },
        ]}
      >
        <div className="max-w-lg mx-auto py-8 px-4">
          <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-6 sm:p-8 text-center">
            <h1 className="text-xl font-bold text-gray-900 mb-2">Start your business profile</h1>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Complete the guided setup wizard first. We will walk you through business details,
              services, availability, and payment setup — then your checklist will appear here.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => router.push("/provider/onboarding")}
                className="bg-primary hover:bg-primary-hover text-white"
              >
                Start business setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => loadSetupStatus(true)} disabled={isRefreshing}>
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </SettingsDetailLayout>
    );
  }

  const requiredSteps = setupStatus.steps.filter((s) => s.required);
  const optionalSteps = setupStatus.steps.filter((s) => !s.required);
  const completedRequired = requiredSteps.filter((s) => s.completed).length;
  const remaining = requiredSteps.length - completedRequired;
  const nextIncomplete = requiredSteps.find((s) => !s.completed);

  // ── All done ──────────────────────────────────────────────────────────────
  if (setupStatus.isComplete) {
    const isPendingApproval = setupStatus.providerStatus === "pending_approval";
    const isSuspended = setupStatus.providerStatus === "suspended";

    return (
      <SettingsDetailLayout
        title="Get Started"
        breadcrumbs={[
          { label: "Provider", href: "/provider" },
          { label: "Get Started" },
        ]}
      >
        <div className="max-w-lg mx-auto text-center py-16 px-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-5">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isSuspended ? "Account suspended" : "You're all set!"}
          </h1>
          <p className="text-gray-500 mb-8">
            {isSuspended
              ? "Your provider account is suspended. Contact support to restore access before accepting new bookings."
              : isPendingApproval
                ? "Your setup checklist is complete. Your profile is under review — you can explore the portal while we approve your listing. Public bookings open once you're approved."
                : "Your profile is ready. You can now accept bookings and start earning."}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 w-full sm:w-auto">
            <Button
              onClick={() => router.push("/provider/dashboard")}
              className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-white"
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/provider/catalogue/services")}
              className="w-full sm:w-auto"
            >
              Manage Services
            </Button>
          </div>
        </div>
      </SettingsDetailLayout>
    );
  }

  // ── Main checklist ────────────────────────────────────────────────────────
  return (
    <SettingsDetailLayout
      title="Get Started"
      breadcrumbs={[
        { label: "Provider", href: "/provider" },
        { label: "Get Started" },
      ]}
    >
      <div className="max-w-2xl mx-auto px-1 sm:px-0">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
              {remaining === 0
                ? "Almost there!"
                : `${remaining} step${remaining === 1 ? "" : "s"} to go`}
            </h1>
            <button
              onClick={() => loadSetupStatus(true)}
              disabled={isRefreshing}
              className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <p className="text-gray-500 text-sm mb-5">
            {completedRequired > 0
              ? `${completedRequired} of ${requiredSteps.length} required steps done — finish the rest to start accepting bookings.`
              : "Complete the steps below to start accepting bookings."}
          </p>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${setupStatus.completionPercentage}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-700 tabular-nums">
              {setupStatus.completionPercentage}%
            </span>
          </div>
        </div>

        {nextIncomplete ? (
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Next up: {nextIncomplete.title}
              </p>
              {nextIncomplete.description ? (
                <p className="text-xs text-gray-600 mt-0.5">{nextIncomplete.description}</p>
              ) : null}
            </div>
            <Button
              size="sm"
              className="shrink-0 bg-primary hover:bg-primary-hover text-white"
              onClick={() => handleStepClick(nextIncomplete)}
            >
              Continue setup
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        ) : null}

        {/* Required steps */}
        <section className="mb-6 sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Required to go live
          </p>
          <div className="space-y-2">
            {requiredSteps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                onClick={() => handleStepClick(step)}
              />
            ))}
          </div>
        </section>

        {/* Optional / boost steps */}
        {optionalSteps.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Boost your profile
            </p>
            <div className="space-y-2">
              {optionalSteps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  onClick={() => handleStepClick(step)}
                  isOptional
                />
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={() => router.push("/provider/dashboard")}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Complete later
          </button>
          {remaining === 0 && (
            <Button
              onClick={() => router.push("/provider/dashboard")}
              className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-white"
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </SettingsDetailLayout>
  );
}

// ── Step card component ───────────────────────────────────────────────────────

function StepCard({
  step,
  onClick,
  isOptional = false,
}: {
  step: SetupStep;
  onClick: () => void;
  isOptional?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 sm:px-5 py-3.5 sm:py-4 flex items-center gap-3 sm:gap-4 transition-all group ${
        step.completed
          ? "border-green-100 bg-green-50/40 hover:bg-green-50"
          : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
      }`}
    >
      {/* Status indicator */}
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          step.completed
            ? "bg-green-100"
            : isOptional
            ? "bg-gray-100"
            : "bg-primary/10"
        }`}
      >
        {step.completed ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <span
            className={`h-2 w-2 rounded-full ${
              isOptional ? "bg-gray-300" : "bg-primary"
            }`}
          />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold leading-snug ${
            step.completed ? "text-gray-400 line-through" : "text-gray-900"
          }`}
        >
          {step.title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 sm:line-clamp-1">
          {step.description}
        </p>
      </div>

      {/* Action */}
      <div className="flex-shrink-0 flex items-center gap-0.5 text-xs font-medium text-gray-400 group-hover:text-gray-600 transition-colors whitespace-nowrap">
        <span className="hidden sm:inline">
          {step.completed ? "Update" : "Set up"}
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}
