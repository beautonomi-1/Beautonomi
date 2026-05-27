import { useCallback, useEffect, useState } from "react";
import { Modal, Platform, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { twStyle } from "@/lib/twStyle";
import { api } from "@/lib/api-client";
import { openAppSettings } from "@/lib/native-permissions";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function BarcodeLookupModal({ visible, onClose }: Props) {
  const router = useRouter();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLookupError(null);
      setScanning(false);
      void getPermission();
    }
  }, [getPermission, visible]);

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

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      if (scanning) return;
      const data = (result.data ?? "").trim();
      if (!data) return;
      void lookupBarcode(data);
    },
    [lookupBarcode, scanning],
  );

  if (Platform.OS === "web") {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={twStyle("flex-1 items-center justify-center bg-black/60 px-6")}>
          <View style={twStyle("w-full max-w-sm rounded-2xl bg-white p-5")}>
            <Text style={twStyle("mb-2 text-base font-semibold text-gray-900")}>Barcode scan</Text>
            <Text style={twStyle("mb-4 text-sm text-gray-600")}>Use the mobile app to scan barcodes.</Text>
            <TouchableOpacity onPress={onClose} style={twStyle("rounded-xl bg-indigo-600 py-3")}>
              <Text style={twStyle("text-center font-semibold text-white")}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={twStyle("flex-1 bg-black")}>
        <View style={twStyle("flex-row items-center justify-between px-4 pt-12 pb-3")}>
          <Text style={twStyle("text-lg font-semibold text-white")}>Scan barcode</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button">
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {!permission?.granted ? (
          <View style={twStyle("flex-1 items-center justify-center px-6")}>
            <Text style={twStyle("mb-4 text-center text-white")}>Camera permission is required to scan barcodes.</Text>
            <TouchableOpacity onPress={() => void requestPermission()} style={twStyle("mb-3 rounded-xl bg-white px-6 py-3")}>
              <Text style={twStyle("font-semibold text-gray-900")}>Allow camera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void openAppSettings()}>
              <Text style={twStyle("text-indigo-300")}>Open settings</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={twStyle("flex-1")}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }}
              onBarcodeScanned={scanning ? undefined : handleBarcode}
            />
            {scanning && (
              <View style={twStyle("absolute inset-0 items-center justify-center bg-black/50")}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
            {lookupError ? (
              <View style={twStyle("absolute bottom-8 left-4 right-4 rounded-xl bg-red-600/90 p-3")}>
                <Text style={twStyle("text-center text-sm text-white")}>{lookupError}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}
