"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderAppDownloadQrProps {
  url: string;
  size?: number;
  className?: string;
  caption?: string;
}

export function ProviderAppDownloadQr({
  url,
  size = 160,
  className,
  caption = "Scan with your phone to download",
}: ProviderAppDownloadQrProps) {
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

  if (error) return null;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="QR code to download the Beautonomi Provider app"
            width={size}
            height={size}
            className="block"
          />
        ) : (
          <div
            className="flex items-center justify-center text-gray-400"
            style={{ width: size, height: size }}
          >
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        )}
      </div>
      {caption ? <p className="max-w-[200px] text-center text-xs text-gray-500">{caption}</p> : null}
    </div>
  );
}
