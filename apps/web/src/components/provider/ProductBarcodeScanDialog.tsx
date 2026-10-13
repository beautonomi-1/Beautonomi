"use client";

import { useTranslation } from "@beautonomi/i18n";
import { useEffect, useId, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
};

export function ProductBarcodeScanDialog({ open, onOpenChange, onScan }: Props) {
  const { t } = useTranslation();
  const reactId = useId();
  const readerId = `product-barcode-${reactId.replace(/:/g, "")}`;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const [hint, setHint] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) {
      setHint(null);
      return;
    }

    let html5QrCode: import("html5-qrcode").Html5Qrcode | null = null;
    let cancelled = false;
    let decodeLocked = false;

    setStarting(true);
    setHint(null);

    import("html5-qrcode")
      .then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
        if (cancelled) return;
        html5QrCode = new Html5Qrcode(readerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
          ],
          verbose: false,
        });
        return html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 240 } },
          (decodedText) => {
            if (decodeLocked) return;
            const code = decodedText.trim();
            if (!code) return;
            decodeLocked = true;
            onScanRef.current(code);
            onOpenChangeRef.current(false);
            decodeLocked = false;
          },
          () => {
            /* no code in frame */
          },
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setHint(e instanceof Error ? e.message : t("web.provider.catalogue.productDialog.barcodeScanFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });

    return () => {
      cancelled = true;
      if (html5QrCode) {
        html5QrCode
          .stop()
          .then(() => html5QrCode?.clear())
          .catch(() => {});
      }
    };
  }, [open, readerId, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("web.provider.catalogue.productDialog.scanBarcodeTitle")}</DialogTitle>
          <DialogDescription>{t("web.provider.catalogue.productDialog.scanBarcodeHint")}</DialogDescription>
        </DialogHeader>
        <div id={readerId} className="w-full overflow-hidden rounded-lg bg-black min-h-[240px]" />
        {starting ? (
          <p className="text-sm text-gray-500 text-center">{t("web.provider.catalogue.productDialog.startingCamera")}</p>
        ) : null}
        {hint ? <p className="text-sm text-red-600 text-center">{hint}</p> : null}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t("web.provider.common.cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
