"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, X, ArrowRight, CheckCircle2 } from "lucide-react";
import { fetcher, FetchTimeoutError } from "@/lib/http/fetcher";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";

interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  steps: {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    required: boolean;
    link: string;
  }[];
}

export function QuickStartBanner() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if banner was dismissed in this session
    const dismissed = sessionStorage.getItem("quickStartBannerDismissed");
    if (dismissed === "true") {
      setIsDismissed(true);
      setIsLoading(false);
      return;
    }

    // Check if we have cached setup status (avoid unnecessary API calls)
    const cachedStatus = sessionStorage.getItem("quickStartBannerStatus");
    if (cachedStatus) {
      try {
        const parsed = JSON.parse(cachedStatus);
        const cacheAge = Date.now() - (parsed.timestamp || 0);
        // Use cache for 5 minutes
        if (cacheAge < 5 * 60 * 1000 && parsed.data) {
          setSetupStatus(parsed.data);
          setIsLoading(false);
          if (parsed.data.isComplete) {
            setIsDismissed(true);
            sessionStorage.setItem("quickStartBannerDismissed", "true");
          }
          return;
        }
      } catch {
        // Ignore cache errors
      }
    }

    loadSetupStatus();
    // Removed visibility change and focus listeners - they cause excessive API calls
    // User can refresh the page if they want fresh status
  }, []);

  const loadSetupStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: SetupStatus }>(
        "/api/provider/setup-status",
        { timeoutMs: 10000 } // Increase timeout to 10 seconds
      );
      setSetupStatus(response.data);
      // Cache the response
      sessionStorage.setItem("quickStartBannerStatus", JSON.stringify({
        data: response.data,
        timestamp: Date.now()
      }));
      // If setup is complete, automatically dismiss banner
      if (response.data?.isComplete) {
        setIsDismissed(true);
        sessionStorage.setItem("quickStartBannerDismissed", "true");
      }
    } catch (err) {
      // Suppress cancelled request errors
      if (err instanceof FetchTimeoutError && err.message.includes('cancelled')) {
        return;
      }
      console.error("Error loading setup status:", err);
      // Don't show error, just hide banner if API fails
      setIsDismissed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem("quickStartBannerDismissed", "true");
  };

  if (isLoading || isDismissed || !setupStatus) {
    return null;
  }

  // Only show banner if setup is not complete
  if (setupStatus.isComplete) {
    return null;
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
  const remainingRequiredSteps = requiredSteps.length - completedRequiredSteps;
  const incompleteRequiredSteps = requiredSteps.filter((step) => !step.completed);

  return (
    <Alert className="mb-6 border-[#FF0077]/30 bg-gradient-to-r from-[#FF0077]/5 to-[#D60565]/5">
      <div className="flex items-start justify-between w-full">
        <div className="flex items-start gap-4 flex-1">
          <Sparkles className="w-5 h-5 text-[#FF0077] mt-0.5" />
          <div className="flex-1">
            <AlertTitle className="text-lg font-semibold text-gray-900 mb-2">
              Complete Your Setup to Start Accepting Bookings
            </AlertTitle>
            <AlertDescription className="text-gray-700 mb-3">
              {remainingRequiredSteps > 0
                ? `You have ${remainingRequiredSteps} required step${remainingRequiredSteps > 1 ? "s" : ""} remaining. Complete them to start making money!`
                : "You're almost there! Complete your setup to start accepting bookings."}
            </AlertDescription>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1 max-w-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">
                    {setupStatus.completionPercentage}% Complete
                  </span>
                </div>
                <Progress
                  value={setupStatus.completionPercentage}
                  className="h-2"
                />
              </div>
              <Link href="/provider/get-started">
                <Button className="bg-[#FF0077] hover:bg-[#D60565] text-white">
                  Complete Setup
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {incompleteRequiredSteps
                .slice(0, 3)
                .map((step) => (
                  <Link
                    key={step.id}
                    href={step.link}
                    className="text-xs text-[#FF0077] hover:text-[#D60565] underline flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {step.title}
                  </Link>
                ))}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Alert>
  );
}
