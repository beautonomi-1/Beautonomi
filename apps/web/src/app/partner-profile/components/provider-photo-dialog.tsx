"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePartnerProfileT } from "@/lib/i18n/use-partner-profile-t";

export type ProviderPhotoDialogMode = "viewer" | "grid";

export type ProviderPhotoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: { src: string; alt: string }[];
  mode: ProviderPhotoDialogMode;
  initialIndex: number;
  businessName?: string;
};

export default function ProviderPhotoDialog({
  open,
  onOpenChange,
  images,
  mode: initialMode,
  initialIndex,
  businessName,
}: ProviderPhotoDialogProps) {
  const { t, pp } = usePartnerProfileT();
  const [mode, setMode] = useState<ProviderPhotoDialogMode>(initialMode);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setIndex(
      images.length === 0 ? 0 : Math.min(Math.max(0, initialIndex), images.length - 1),
    );
  }, [open, initialMode, initialIndex, images.length]);

  const clampedIndex = images.length === 0 ? 0 : Math.min(index, images.length - 1);
  const current = images[clampedIndex];

  const goPrev = useCallback(() => {
    if (images.length <= 1) return;
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const goNext = useCallback(() => {
    if (images.length <= 1) return;
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (!open || mode !== "viewer") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, mode, goPrev, goNext]);

  const title = useMemo(
    () => businessName ? `${businessName} — ${pp("tabPhotos")}` : pp("tabPhotos"),
    [businessName, pp],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        suppressFallbackTitle
        className="w-full max-w-[min(96vw,1200px)] sm:max-w-[min(96vw,1200px)] gap-0 border-0 bg-black/95 sm:bg-black/95 p-0 sm:p-0 text-white overflow-hidden"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {mode === "grid" ? (
          <div className="max-h-[85vh] overflow-y-auto p-4 md:p-6">
            <p className="text-lg font-semibold text-white mb-4">{pp("tabPhotos")}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {images.map((img, i) => (
                <button
                  key={`${img.src}-${i}`}
                  type="button"
                  className="relative aspect-[4/5] overflow-hidden rounded-lg bg-gray-800 hover:opacity-90 transition-opacity"
                  onClick={() => {
                    setIndex(i);
                    setMode("viewer");
                  }}
                  aria-label={pp("viewPhotoA11y", { index: i + 1, total: images.length })}
                >
                  <Image src={img.src} alt={img.alt} fill className="object-cover" sizes="33vw" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col items-center justify-center min-h-[50vh] max-h-[90vh] w-full">
            {current ? (
              <div className="relative w-full h-[min(80vh,720px)] flex items-center justify-center px-12 md:px-16">
                <Image
                  src={current.src}
                  alt={current.alt}
                  fill
                  className="object-contain"
                  sizes="96vw"
                  priority
                />
              </div>
            ) : null}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 backdrop-blur-sm"
                  aria-label={t("web.a11y.previousImage")}
                >
                  <ChevronLeft className="h-6 w-6 text-white" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 backdrop-blur-sm"
                  aria-label={t("web.a11y.nextImage")}
                >
                  <ChevronRight className="h-6 w-6 text-white" />
                </button>
                <p
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/90 tabular-nums"
                  aria-live="polite"
                >
                  {`${clampedIndex + 1} / ${images.length}`}
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}