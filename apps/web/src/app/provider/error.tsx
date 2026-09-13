"use client";

import { useTranslation } from "@beautonomi/i18n";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function ProviderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
<div className="text-4xl font-bold text-gray-300">{t("web.provider.pages.error.oops")}</div>
<h2 className="text-lg font-semibold text-gray-900">{t("web.provider.pages.error.title")}</h2>
      <p className="text-sm text-gray-500 max-w-md">
{t("web.provider.pages.error.body")}
      </p>
      <div className="flex gap-3 mt-2">
        <Button variant="outline" onClick={() => (window.location.href = "/provider/dashboard")}>
{t("web.provider.pages.error.backToDashboard")}
        </Button>
<Button onClick={reset}>{t("web.provider.common.tryAgain")}</Button>
      </div>
    </div>
  );
}
