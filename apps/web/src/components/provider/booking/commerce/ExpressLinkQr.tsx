"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BookingSectionCard } from "../ui";

interface ExpressLinkQrProps {
  url: string;
  size?: number;
  label?: string;
  className?: string;
}

/** QR display for express payment / booking links. */
export function ExpressLinkQr({
  url,
  size = 200,
  label,
  className,
}: ExpressLinkQrProps) {
  const { t } = useTranslation();
  const displayLabel = label ?? t("web.expressLinkQr.scanToOpen");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(false);

    (async () => {
      try {
        const next = await QRCode.toDataURL(url, {
          errorCorrectionLevel: "M",
          type: "image/png",
          width: size,
          margin: 2,
          color: { dark: "#111827", light: "#FFFFFF" },
        });
        if (!cancelled) setDataUrl(next);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, size]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("web.expressLinkQr.copied"));
    } catch {
      toast.error(t("web.explore.postDetail.copyFailed"));
    }
  };

  if (error) {
    return (
      <BookingSectionCard className={className}>
        <p className="text-sm text-gray-500">{t("web.expressLinkQr.generateFailed")}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-2 text-sm font-semibold text-blue-600 underline"
        >
          {t("web.expressLinkQr.copyInstead")}
        </button>
      </BookingSectionCard>
    );
  }

  return (
    <BookingSectionCard className={cn("flex flex-col items-center gap-3", className)}>
      <div className="rounded-xl border bg-white p-3">
        {dataUrl ? (
          <img src={dataUrl} alt={t("web.expressLinkQr.qrAlt")} width={size} height={size} className="block" />
        ) : (
          <div
            className="flex items-center justify-center text-gray-400"
            style={{ width: size, height: size }}
          >
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>
      {displayLabel ? <p className="text-xs text-center text-gray-500 max-w-[220px]">{displayLabel}</p> : null}
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 touch-manipulation min-h-[44px]"
      >
        <Copy className="h-4 w-4" />
        {t("web.explore.postDetail.copyLink")}
      </button>
    </BookingSectionCard>
  );
}
