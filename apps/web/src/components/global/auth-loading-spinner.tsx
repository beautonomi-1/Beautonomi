"use client";

import { useAuth } from "@/providers/AuthProvider";
import { Loader2 } from "lucide-react";

/**
 * AuthLoadingSpinner Component
 *
 * Shows a loading spinner overlay when authentication is being checked.
 * Uses CSS/Tailwind only to avoid framer-motion (and its process polyfill) in the
 * root layout, which triggers Turbopack HMR "module factory is not available" errors.
 */
export default function AuthLoadingSpinner() {
  const { isLoading } = useAuth();

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm bg-white/80 animate-in fade-in duration-200"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="backdrop-blur-2xl bg-white/90 border border-white/40 shadow-2xl rounded-2xl p-8 flex flex-col items-center gap-4 animate-in zoom-in-95 fade-in duration-200">
        <div className="animate-spin">
          <Loader2 className="h-12 w-12 text-[#FF0077]" strokeWidth={2.5} />
        </div>
        <p className="text-sm font-medium text-gray-700 tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-200 delay-75">
          Checking authentication...
        </p>
      </div>
    </div>
  );
}
