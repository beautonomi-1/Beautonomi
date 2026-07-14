"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import AppDownloadButtons from "@/app/become-a-partner/components/app-download-buttons";
import { Button } from "@/components/ui/button";
import { useProviderAppLinks } from "@/hooks/useProviderAppLinks";
import { getProviderAppQrTargetUrl } from "@/lib/store/provider-app-links-client";
import { ProviderAppDownloadQr } from "./ProviderAppDownloadQr";
import { cn } from "@/lib/utils";

export interface ProviderAppDownloadNudgeProps {
  title?: string;
  subtitle?: string;
  successHeadline?: string;
  showQr?: boolean;
  showContinue?: boolean;
  continueLabel?: string;
  onContinue?: () => void;
  className?: string;
}

export function ProviderAppDownloadNudge({
  title = "Get the provider app",
  subtitle = "Run your business from your phone — bookings, clients, and payments on the go.",
  successHeadline,
  showQr = true,
  showContinue = false,
  continueLabel = "Continue",
  onContinue,
  className,
}: ProviderAppDownloadNudgeProps) {
  const { apps, hasLinks } = useProviderAppLinks();
  const qrUrl = getProviderAppQrTargetUrl(apps);

  if (!hasLinks) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8",
        className,
      )}
    >
      {successHeadline ? (
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden />
          </div>
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{successHeadline}</h2>
          {subtitle ? <p className="mt-2 max-w-md text-sm text-gray-600">{subtitle}</p> : null}
        </div>
      ) : (
        <div className="mb-6 text-center">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {subtitle ? <p className="mt-1.5 text-sm text-gray-600">{subtitle}</p> : null}
        </div>
      )}

      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-center lg:gap-12">
        <AppDownloadButtons />
        {showQr ? (
          <div className="hidden lg:flex">
            <ProviderAppDownloadQr url={qrUrl} />
          </div>
        ) : null}
      </div>

      {showContinue && onContinue ? (
        <div className="mt-8 flex justify-center">
          <Button onClick={onContinue} className="min-w-[200px]">
            {continueLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
