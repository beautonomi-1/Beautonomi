"use client";

import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";

interface LoadingTimeoutProps {
  /** Time in milliseconds before showing timeout message (default: 30000) */
  timeoutMs?: number;
  /** Custom message to show during loading */
  loadingMessage?: string;
  /** Custom message to show after timeout */
  timeoutMessage?: string;
  /** Callback when retry is clicked */
  onRetry?: () => void;
  /** Whether to show the loading state */
  isLoading?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * LoadingTimeout Component
 * 
 * Shows a spinner for up to timeoutMs, then displays a timeout message
 * with Retry and Home buttons.
 */
export default function LoadingTimeout({
  timeoutMs = 30000, // Increased from 12s to 30s to give more time before showing timeout
  loadingMessage = "Loading...",
  timeoutMessage = "Taking longer than expected",
  onRetry,
  isLoading = true,
  className = "",
}: LoadingTimeoutProps) {
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const pathname = usePathname();
  
  // Determine the appropriate home path based on current route
  const getHomePath = () => {
    if (pathname?.startsWith("/provider")) {
      return "/provider/dashboard";
    }
    if (pathname?.startsWith("/admin")) {
      return "/admin";
    }
    return "/";
  };
  
  const homePath = getHomePath();

  useEffect(() => {
    if (!isLoading) {
      queueMicrotask(() => setHasTimedOut(false));
      return;
    }

    const timer = setTimeout(() => {
      setHasTimedOut(true);
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [isLoading, timeoutMs]);

  if (!isLoading && !hasTimedOut) {
    return null;
  }

  if (hasTimedOut) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
        <div className="text-center space-y-4 max-w-md">
          <p className="text-lg font-medium text-gray-900">{timeoutMessage}</p>
          <p className="text-sm text-gray-600">
            The request is taking longer than usual. This might be due to network issues or server load.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            {onRetry && (
              <Button
                onClick={() => {
                  setHasTimedOut(false);
                  onRetry();
                }}
                className="flex items-center gap-2"
                variant="default"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            )}
            <Button
              onClick={() => {
                // Use window.location for a hard navigation to ensure page refresh
                window.location.href = homePath;
              }}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Home className="h-4 w-4" />
              {pathname?.startsWith("/provider") ? "Go to Dashboard" : "Go Home"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      {loadingMessage && (
        <p className="mt-4 text-sm text-gray-600">{loadingMessage}</p>
      )}
    </div>
  );
}
