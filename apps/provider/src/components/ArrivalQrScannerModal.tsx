import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
import { openAppSettings } from "@/lib/native-permissions";

/** Pause before accepting another scan after a failed verify (camera keeps seeing the same QR). */
const RESCAN_COOLDOWN_MS = 2500;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Return `true` when verification succeeded (modal usually closes). */
  onValidScan: (jsonPayload: string) => boolean | void | Promise<boolean | void>;
  /** Parent is calling verify-qr — block duplicate barcode events. */
  busy?: boolean;
  errorMessage?: string | null;
};

export function ArrivalQrScannerModal({
  visible,
  onClose,
  onValidScan,
  busy = false,
  errorMessage = null,
}: Props) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const scanGateRef = useRef(false);
  const lastPayloadRef = useRef<string | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCooldown = useCallback(() => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  const releaseScanLock = useCallback(() => {
    scanGateRef.current = false;
    lastPayloadRef.current = null;
    setLocked(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      clearCooldown();
      releaseScanLock();
      setCameraReady(false);
      return;
    }
    void getPermission();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void getPermission();
      }
    });
    return () => sub.remove();
  }, [clearCooldown, getPermission, releaseScanLock, visible]);

  /** After a failed verify, wait before accepting another scan (camera keeps seeing the same QR). */
  useEffect(() => {
    if (visible && !busy && locked) {
      clearCooldown();
      cooldownTimerRef.current = setTimeout(() => {
        releaseScanLock();
      }, RESCAN_COOLDOWN_MS);
      return () => clearCooldown();
    }
    return undefined;
  }, [busy, clearCooldown, locked, releaseScanLock, visible]);

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      if (busy || locked || scanGateRef.current) return;
      const data = (result.data ?? "").trim();
      if (!isArrivalQrPayloadString(data)) return;
      if (lastPayloadRef.current === data) return;

      scanGateRef.current = true;
      lastPayloadRef.current = data;
      setLocked(true);
      clearCooldown();

      void (async () => {
        try {
          const ok = await Promise.resolve(onValidScan(data));
          if (ok === true) {
            return;
          }
        } catch {
          // Parent surfaces errors; cooldown effect re-enables scanning.
        }
      })();
    },
    [busy, clearCooldown, locked, onValidScan]
  );

  const scanningPaused = busy || locked;

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
              You can close this scanner and enter the arrival code manually.
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (permission?.canAskAgain === false) {
                  void openAppSettings();
                  return;
                }
                void requestPermission();
              }}
              style={twStyle("bg-primary py-3 rounded-xl items-center")}
              accessibilityRole="button"
              accessibilityLabel={permission?.canAskAgain === false ? "Open settings for camera access" : "Allow camera"}
            >
              <Text style={twStyle("text-white font-semibold")}>
                {permission?.canAskAgain === false ? "Open Settings" : "Allow camera"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={twStyle("flex-1")}>
            <CameraView
              style={twStyle("flex-1")}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onCameraReady={() => setCameraReady(true)}
              onBarcodeScanned={cameraReady && !scanningPaused ? handleBarcode : undefined}
            />
            {!cameraReady ? (
              <View
                style={twStyle("absolute inset-0 items-center justify-center bg-black/60")}
                pointerEvents="none"
              >
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : null}
            {scanningPaused ? (
              <View style={twStyle("absolute inset-0 items-center justify-center bg-black/50")}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={twStyle("text-white text-sm mt-3 px-6 text-center")}>
                  {busy ? "Verifying arrival…" : "Hold steady…"}
                </Text>
              </View>
            ) : null}
            {errorMessage ? (
              <View style={twStyle("absolute bottom-24 left-4 right-4 rounded-xl bg-red-600/90 p-3")}>
                <Text style={twStyle("text-center text-sm text-white")}>{errorMessage}</Text>
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
