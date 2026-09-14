"use client";

import { ArrivalQrScanDialog } from "@/components/provider/ArrivalQrScanDialog";
import { parseQRCodeData, validateQRCodeData, type QRCodeData } from "@/lib/qr/generator";
import { useTranslation } from "@beautonomi/i18n";
import { toast } from "sonner";

interface QRCodeScannerProps {
  onScan: (data: QRCodeData) => void;
  onClose: () => void;
  bookingId: string;
  title?: string;
}

/**
 * Thin wrapper around {@link ArrivalQrScanDialog} (html5-qrcode) for legacy
 * provider-portal imports. Prefer ArrivalQrScanDialog directly for new code.
 */
export function QRCodeScanner({
  onScan,
  onClose,
  bookingId,
}: QRCodeScannerProps) {
  const { t } = useTranslation();

  return (
    <ArrivalQrScanDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onValidScan={(jsonPayload) => {
        const data = parseQRCodeData(jsonPayload);
        if (!data || !validateQRCodeData(data, bookingId)) {
          toast.error(t("web.provider.portal.qrScanner.invalidOrExpired"));
          return false;
        }
        onScan(data);
        return true;
      }}
    />
  );
}
