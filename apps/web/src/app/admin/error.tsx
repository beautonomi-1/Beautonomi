"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <div className="text-4xl font-bold text-gray-300">Error</div>
      <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
      <p className="text-sm text-gray-500 max-w-md">
        An unexpected error occurred in the admin panel. Please try again or return to the admin home.
      </p>
      <div className="flex gap-3 mt-2">
        <Button variant="outline" onClick={() => (window.location.href = "/admin")}>
          Back to Admin
        </Button>
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  );
}
