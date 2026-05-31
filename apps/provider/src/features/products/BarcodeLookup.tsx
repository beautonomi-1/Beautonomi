import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { BarcodeScannerModal } from "./BarcodeScannerModal";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function BarcodeLookupModal({ visible, onClose }: Props) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const lookupBarcode = useCallback(
    async (barcode: string) => {
      setScanning(true);
      setLookupError(null);
      try {
        const res = await api.fetch<{ product?: { id: string } }>(
          `/api/provider/products/by-barcode?barcode=${encodeURIComponent(barcode)}`,
        );
        if (res.error) {
          setLookupError(res.error.message ?? "Lookup failed");
          return;
        }
        const productId = res.data?.product?.id;
        if (!productId) {
          setLookupError(`No product found for barcode ${barcode}`);
          return;
        }
        onClose();
        router.push(`/(app)/(tabs)/more/product-form?id=${productId}` as never);
      } finally {
        setScanning(false);
      }
    },
    [onClose, router],
  );

  return (
    <BarcodeScannerModal
      visible={visible}
      onClose={onClose}
      title="Find product by barcode"
      busy={scanning}
      errorMessage={lookupError}
      onScanned={(code) => {
        void lookupBarcode(code);
      }}
    />
  );
}
