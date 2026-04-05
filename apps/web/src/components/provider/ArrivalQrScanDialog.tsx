"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isArrivalQrPayloadString } from "@/lib/arrival-qr-payload";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Return true when verification succeeded (dialog will stay open on false). */
  onValidScan: (jsonPayload: string) => boolean | Promise<boolean>;
};

export function ArrivalQrScanDialog({ open, onOpenChange, onValidScan }: Props) {
  const reactId = useId();
  const readerId = `arrival-qr-${reactId.replace(/:/g, "")}`;
  const onValidScanRef = useRef(onValidScan);
  onValidScanRef.current = onValidScan;
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
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;
        html5QrCode = new Html5Qrcode(readerId);
        return html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decodedText) => {
            if (decodeLocked) return;
            if (!isArrivalQrPayloadString(decodedText)) return;
            decodeLocked = true;
            void Promise.resolve(onValidScanRef.current(decodedText))
              .then((ok) => {
                if (ok) onOpenChangeRef.current(false);
              })
              .finally(() => {
                decodeLocked = false;
              });
          },
          () => {
            /* no QR in frame */
          }
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setHint(
            e instanceof Error
              ? e.message
              : "Could not start the camera. Use https, allow access, or enter the code manually."
          );
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
  }, [open, readerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan arrival QR</DialogTitle>
          <DialogDescription>
            Allow camera access, then point at the QR on the customer&apos;s phone.
          </DialogDescription>
        </DialogHeader>
        <div className="relative min-h-[280px] rounded-lg overflow-hidden bg-black">
          {starting ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center text-white text-sm bg-black/80">
              Starting camera…
            </div>
          ) : null}
          <div id={readerId} className="w-full min-h-[280px]" />
        </div>
        {hint ? <p className="text-sm text-red-600 mt-2">{hint}</p> : null}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full mt-2 min-h-[44px]">
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
