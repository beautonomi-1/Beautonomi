"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const { user, role, isLoading: authLoading } = useAuth();
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Only check impersonation if user is an admin/superadmin
    // Regular users don't need this check at all - skip entirely
    if (authLoading || !user || role !== "superadmin") {
      setIsImpersonating(false);
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;

    // Check if we have an impersonation cookie via API
    const checkImpersonation = async (): Promise<boolean> => {
      try {
        const response = await fetch("/api/admin/impersonation/check");
        if (response.ok) {
          const data = await response.json();
          const wasImpersonating = data.isImpersonating || false;
          setIsImpersonating(wasImpersonating);
          return wasImpersonating;
        }
      } catch (error) {
        console.error("Error checking impersonation status:", error);
        setIsImpersonating(false);
      }
      return false;
    };

    // Initial check
    checkImpersonation().then((shouldPoll) => {
      // Only set up polling if we're actually impersonating
      if (shouldPoll) {
        // Re-check periodically in case cookies expire (every 2 minutes instead of 30 seconds)
        intervalId = setInterval(async () => {
          const stillImpersonating = await checkImpersonation();
          if (!stillImpersonating && intervalId) {
            // Stop polling if impersonation ended
            clearInterval(intervalId);
            intervalId = null;
          }
        }, 120000); // Check every 2 minutes instead of 30 seconds
      }
    });

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [user, role, authLoading]);

  // Early return if not an admin - don't render component at all
  if (authLoading || !user || role !== "superadmin") {
    return null;
  }

  const handleEndImpersonation = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.post<{ success: boolean; url: string }>(
        "/api/admin/impersonation/end"
      );

      if (response.success && response.url) {
        toast.success("Returning to admin account...");
        // Redirect to the callback URL
        window.location.href = response.url;
      } else {
        toast.error("Failed to end impersonation");
      }
    } catch (error: any) {
      console.error("Error ending impersonation:", error);
      toast.error(error.message || "Failed to end impersonation");
    } finally {
      setIsLoading(false);
    }
  };

  // Only show banner if impersonating (has admin cookie but current user is not superadmin)
  if (!isImpersonating || role === "superadmin") {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-white px-4 py-2 shadow-md">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            You are impersonating {user?.full_name || user?.email || "a user"}
          </span>
        </div>
        <Button
          onClick={handleEndImpersonation}
          disabled={isLoading}
          className="bg-white text-amber-600 hover:bg-amber-50 flex-shrink-0 text-sm font-medium px-3 py-1.5 h-auto"
        >
          {isLoading ? "Returning..." : "Return to Admin"}
        </Button>
      </div>
    </div>
  );
}
