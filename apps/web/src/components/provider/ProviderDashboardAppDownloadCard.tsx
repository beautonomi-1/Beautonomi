"use client";

import { useCallback, useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import AppDownloadButtons from "@/app/become-a-partner/components/app-download-buttons";
import { useMobile } from "@/hooks/useMobile";
import { useProviderAppLinks } from "@/hooks/useProviderAppLinks";
import { getProviderAppQrTargetUrl } from "@/lib/store/provider-app-links-client";
import { ProviderAppDownloadQr } from "./ProviderAppDownloadQr";

const DISMISS_STORAGE_KEY = "provider_dashboard_app_download_dismissed";

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function ProviderDashboardAppDownloadCard() {
  const { isDesktop } = useMobile();
  const { apps, hasLinks } = useProviderAppLinks();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isDesktop && hasLinks && !isDismissed()) {
      setVisible(true);
    }
  }, [isDesktop, hasLinks]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  const qrUrl = getProviderAppQrTargetUrl(apps);

  return (
    <div className="mb-4 sm:mb-6 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-violet-50/60 p-4 shadow-sm sm:p-5">
      <div className="flex gap-3 sm:gap-4">
        <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
          <Smartphone className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Get the app</h3>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Dismiss app download tip"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Manage bookings, messages, and payments from your phone — scan the QR or pick your
            store below.
          </p>
          <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
            <ProviderAppDownloadQr url={qrUrl} size={140} />
            <div className="min-w-0 flex-1 [&>div]:items-start [&>div]:text-left">
              <AppDownloadButtons />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
