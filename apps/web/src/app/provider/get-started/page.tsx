"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, ArrowRight, Sparkles, RefreshCw } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Progress } from "@/components/ui/progress";
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
}

export default function GetStartedPage() {
  const router = useRouter();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = React.useRef<number>(0);
  const MIN_REFRESH_INTERVAL_MS = 2000;

  useEffect(() => {
    loadSetupStatus();
  }, []);

  // Refresh when user returns to this page (visibility/focus) - always refetch to show latest progress
  useEffect(() => {
    const handleRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastFetchRef.current < MIN_REFRESH_INTERVAL_MS) return;
      lastFetchRef.current = now;
      sessionStorage.removeItem("shouldRefreshSetupStatus");
      loadSetupStatus(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !isLoading) handleRefresh();
    };

    const handleFocus = () => {
      if (!isLoading) handleRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isLoading]);

  const loadSetupStatus = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const response = await fetcher.get<{ data: SetupStatus }>(
        `/api/provider/setup-status?_=${Date.now()}`
      );
      setSetupStatus(response.data ?? { isComplete: false, completionPercentage: 0, steps: [] });
      lastFetchRef.current = Date.now();
      if (isRefresh) {
        toast.success("Status updated");
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load setup status";
      setError(errorMessage);
      console.error("Error loading setup status:", err);
      if (isRefresh) {
        toast.error("Failed to refresh status");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleStepClick = (step: SetupStep) => {
    // Navigate to the step's link with return parameter
    const returnUrl = encodeURIComponent("/provider/get-started");
    const separator = step.link.includes("?") ? "&" : "?";
    // Store return URL in sessionStorage for easy access
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('getStartedReturnUrl', '/provider/get-started');
      // Also store a flag to trigger refresh when returning
      sessionStorage.setItem('shouldRefreshSetupStatus', 'true');
    }
    router.push(`${step.link}${separator}returnTo=${returnUrl}`);
  };

  const handleCompleteLater = () => {
    router.push("/provider/dashboard");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Get Started"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Get Started" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading setup status..." />
      </SettingsDetailLayout>
    );
  }

  if (error || !setupStatus) {
    return (
      <SettingsDetailLayout
        title="Get Started"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Get Started" },
        ]}
      >
        <div className="bg-white rounded-lg border p-6">
          <p className="text-red-600">{error || "Failed to load setup status"}</p>
          <Button onClick={() => loadSetupStatus()} className="mt-4">
            Retry
          </Button>
        </div>
      </SettingsDetailLayout>
    );
  }

  // No steps = no provider record yet (complete onboarding first)
  if (!setupStatus.steps || setupStatus.steps.length === 0) {
    return (
      <SettingsDetailLayout
        title="Get Started"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Get Started" },
        ]}
      >
        <div className="bg-white rounded-lg border p-6">
          <p className="text-gray-700 mb-4">
            Complete onboarding first to set up your provider account and see your setup steps.
          </p>
          <Button onClick={() => router.push("/provider/onboarding")} className="bg-[#FF0077] hover:bg-[#D60565] text-white">
            Go to Onboarding
          </Button>
        </div>
      </SettingsDetailLayout>
    );
  }

  // If setup is complete, show success message and redirect option
  if (setupStatus.isComplete) {
    return (
      <SettingsDetailLayout
        title="Get Started"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Get Started" },
        ]}
      >
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-8 mb-6 text-center border-2 border-green-200">
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-4 animate-pulse">
                <Check className="w-12 h-12 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-green-800 mb-2">🎉 Setup Complete!</h1>
              <p className="text-lg text-green-700 mb-6">
                You're all set to start accepting bookings and making money!
              </p>
              <div className="flex gap-4">
                <Button
                  onClick={() => router.push("/provider/dashboard")}
                  className="bg-[#FF0077] hover:bg-[#D60565] text-white"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push("/provider/catalogue/services")}
                  className="border-green-300 text-green-700 hover:bg-green-50"
                >
                  Manage Services
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SettingsDetailLayout>
    );
  }

  // Sort steps: required first, then by completion status (incomplete first)
  const sortedSteps = [...setupStatus.steps].sort((a, b) => {
    // Required steps come first
    if (a.required && !b.required) return -1;
    if (!a.required && b.required) return 1;
    // Within same required status, incomplete come first
    if (!a.completed && b.completed) return -1;
    if (a.completed && !b.completed) return 1;
    return 0;
  });

  const requiredSteps = sortedSteps.filter((step) => step.required);
  const completedRequiredSteps = requiredSteps.filter((step) => step.completed).length;
  const allRequiredComplete = completedRequiredSteps === requiredSteps.length;
  const _totalSteps = sortedSteps.length;

  return (
    <SettingsDetailLayout
      title="Get Started"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Get Started" },
      ]}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF0077] to-[#D60565] rounded-xl p-8 mb-6 text-white">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-8 h-8" />
                  <h1 className="text-3xl font-bold">Get Started</h1>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadSetupStatus(true)}
                  disabled={isRefreshing}
                  className="text-white hover:text-white/90 hover:bg-white/10 disabled:opacity-50"
                  title="Refresh status"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-lg text-white/90 mb-4">
                {completedRequiredSteps === requiredSteps.length
                  ? "🎉 All required steps completed! You're ready to start accepting bookings."
                  : completedRequiredSteps > 0
                  ? `You have ${requiredSteps.length - completedRequiredSteps} required step${requiredSteps.length - completedRequiredSteps === 1 ? '' : 's'} remaining. Complete them to start making money!`
                  : `Complete these steps to start accepting bookings and making money!`}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {setupStatus.completionPercentage}% Complete
                    </span>
                    <span className="text-sm">
                      {completedRequiredSteps} of {requiredSteps.length} required steps
                    </span>
                  </div>
                  <Progress
                    value={setupStatus.completionPercentage}
                    className="h-3 bg-white/20"
                  />
                </div>
              </div>
            </div>
            {allRequiredComplete && (
              <div className="ml-6 bg-white/20 rounded-lg p-4 animate-pulse">
                <Check className="w-12 h-12" />
              </div>
            )}
          </div>
        </div>

        {/* Steps List */}
        <div className="space-y-4 mb-6">
          {sortedSteps.map((step, index) => {
            // Determine step number (only count required steps for numbering, but show all)
            const stepNumber = index + 1;
            return (
            <div
              key={step.id}
              className={`bg-white rounded-lg border-2 p-6 transition-all cursor-pointer hover:shadow-lg hover:scale-[1.01] ${
                step.completed
                  ? "border-green-200 bg-green-50/30 hover:border-green-300"
                  : step.required
                  ? "border-[#FF0077]/30 hover:border-[#FF0077]/50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => handleStepClick(step)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                      step.completed
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {step.completed ? (
                      <Check className="w-6 h-6" />
                    ) : (
                      <span>{stepNumber}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {step.title}
                      </h3>
                      {step.required && (
                        <span className="text-xs bg-[#FF0077] text-white px-2 py-0.5 rounded-full">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 mb-3">{step.description}</p>
                    <Button
                      onClick={() => handleStepClick(step)}
                      variant={step.completed ? "outline" : "default"}
                      className={`transition-all ${
                        step.completed
                          ? "border-green-500 text-green-700 hover:bg-green-50 hover:border-green-600"
                          : "bg-[#FF0077] hover:bg-[#D60565] text-white shadow-sm hover:shadow-md"
                      }`}
                    >
                      {step.completed ? "Update" : "Set Up"}
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-6 transition-all ${
          allRequiredComplete 
            ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200" 
            : "bg-white border-gray-200"
        }`}>
          <div className="flex-1">
            <p className={`text-sm ${allRequiredComplete ? "text-green-800 font-medium" : "text-gray-600"}`}>
              {allRequiredComplete
                ? "🎉 Great! You're all set to start accepting bookings and making money!"
                : completedRequiredSteps > 0
                ? `You have ${requiredSteps.length - completedRequiredSteps} required step${requiredSteps.length - completedRequiredSteps === 1 ? '' : 's'} remaining. Complete them to start accepting bookings and making money!`
                : `Complete the required steps above to start accepting bookings.`}
            </p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleCompleteLater}
              className="border-gray-300 flex-1 sm:flex-none"
            >
              Complete Later
            </Button>
            {allRequiredComplete && (
              <Button
                onClick={() => router.push("/provider/dashboard")}
                className="bg-[#FF0077] hover:bg-[#D60565] text-white flex-1 sm:flex-none"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>

        {/* Tips Section */}
        {!allRequiredComplete && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-2">💡 Quick Tips</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li>• Complete required steps first to start accepting bookings</li>
              <li>• You can always come back to update optional settings later</li>
              <li>• Adding photos helps customers discover your services</li>
              <li>• Set up payment processing to receive payments automatically</li>
            </ul>
          </div>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
