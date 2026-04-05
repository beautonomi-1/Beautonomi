import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";
import { isArrivalQrPayloadString } from "@/lib/arrival-qr-payload";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Raw JSON string from the QR (as stored in the code). */
  onValidScan: (jsonPayload: string) => void | Promise<void>;
};

export function ArrivalQrScannerModal({ visible, onClose, onValidScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [suppressScan, setSuppressScan] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSuppressScan(false);
      setCameraReady(false);
    }
  }, [visible]);

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      const data = (result.data ?? "").trim();
      if (!isArrivalQrPayloadString(data)) return;
      setSuppressScan(true);
      void Promise.resolve(onValidScan(data)).finally(() => {
        setSuppressScan(false);
      });
    },
    [onValidScan]
  );

  if (Platform.OS === "web") {
    return (
      <Modal visible={visible} animationType="fade" transparent>
        <View style={twStyle("flex-1 bg-black/70 justify-center px-6")}>
          <View style={twStyle("bg-white rounded-2xl p-5")}>
            <Text style={twStyle("text-base font-semibold text-gray-900 mb-2")}>QR scan</Text>
            <Text style={twStyle("text-sm text-gray-600 mb-4")}>
              Camera QR scanning runs in the mobile app. On web, use the provider website booking page with your browser camera, or enter the code manually.
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={twStyle("bg-primary py-3 rounded-xl items-center")}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={twStyle("text-white font-semibold")}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={twStyle("flex-1 bg-black")}>
        <View style={twStyle("flex-row items-center justify-between px-4 pt-12 pb-3 bg-black")}>
          <Text style={twStyle("text-white text-lg font-semibold")}>Scan arrival QR</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {!permission?.granted ? (
          <View style={twStyle("flex-1 justify-center px-6")}>
            <Text style={twStyle("text-white text-center mb-4")}>
              Camera access is needed to scan the customer&apos;s arrival QR code.
            </Text>
            <TouchableOpacity
              onPress={() => void requestPermission()}
              style={twStyle("bg-primary py-3 rounded-xl items-center")}
              accessibilityRole="button"
              accessibilityLabel="Allow camera"
            >
              <Text style={twStyle("text-white font-semibold")}>Allow camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={twStyle("flex-1")}>
            <CameraView
              style={twStyle("flex-1")}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onCameraReady={() => setCameraReady(true)}
              onBarcodeScanned={cameraReady && !suppressScan ? handleBarcode : undefined}
            />
            {!cameraReady ? (
              <View
                style={twStyle("absolute inset-0 items-center justify-center bg-black/60")}
                pointerEvents="none"
              >
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : null}
            <View
              style={twStyle("absolute bottom-0 left-0 right-0 pb-10 pt-4 px-4 bg-black/70")}
              pointerEvents="none"
            >
              <Text style={twStyle("text-white text-center text-sm")}>
                Point the camera at the QR on the customer&apos;s booking screen.
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
