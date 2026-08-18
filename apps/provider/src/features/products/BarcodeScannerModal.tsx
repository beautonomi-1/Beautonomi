import { useCallback, useEffect, useState } from "react";
import { Modal, Platform, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";
import { openAppSettings } from "@/lib/native-permissions";

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  title?: string;
  busy?: boolean;
  errorMessage?: string | null;
  webFallbackMessage?: string;
};

export function BarcodeScannerModal({
  visible,
  onClose,
  onScanned,
  title = "Scan barcode",
  busy = false,
  errorMessage = null,
  webFallbackMessage = "Use the mobile app to scan barcodes.",
}: Props) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (visible) {
      void getPermission();
      if (!permission?.granted && permission?.canAskAgain !== false) {
        void requestPermission();
      }
    }
  }, [getPermission, permission?.canAskAgain, permission?.granted, requestPermission, visible]);

  useEffect(() => {
    if (!busy) {
      setLocked(false);
    }
  }, [busy]);

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      if (busy || locked) return;
      const data = (result.data ?? "").trim();
      if (!data) return;
      setLocked(true);
      onScanned(data);
    },
    [busy, locked, onScanned],
  );

  if (Platform.OS === "web") {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={twStyle("flex-1 items-center justify-center bg-black/60 px-6")}>
          <View style={twStyle("w-full max-w-sm rounded-2xl bg-white p-5")}>
            <Text style={twStyle("mb-2 text-base font-semibold text-gray-900")}>{title}</Text>
            <Text style={twStyle("mb-4 text-sm text-gray-600")}>{webFallbackMessage}</Text>
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
          <Text style={twStyle("text-lg font-semibold text-white")}>{title}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button">
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {!permission?.granted ? (
          <View style={twStyle("flex-1 items-center justify-center px-6")}>
            <Text style={twStyle("mb-4 text-center text-white")}>Camera permission is required to scan barcodes.</Text>
            <TouchableOpacity onPress={() => void requestPermission()} style={twStyle("mb-3 rounded-xl bg-white px-6 py-3")}>
              <Text style={twStyle("font-semibold text-gray-900")}>Continue</Text>
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
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={busy || locked ? undefined : handleBarcode}
            />
            {busy ? (
              <View style={twStyle("absolute inset-0 items-center justify-center bg-black/50")}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : null}
            {errorMessage ? (
              <View style={twStyle("absolute bottom-8 left-4 right-4 rounded-xl bg-red-600/90 p-3")}>
                <Text style={twStyle("text-center text-sm text-white")}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}
