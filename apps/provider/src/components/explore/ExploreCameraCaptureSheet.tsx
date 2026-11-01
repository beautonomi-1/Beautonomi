import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  AppState,
} from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";
import { openAppSettings, PERMISSION_COPY } from "@/lib/native-permissions";

const MIN_RECORD_MS = 450;
const REBIND_GRACE_MS = 500;
const MODAL_HIDE_MS = 280;

export type ExploreCameraCaptureResult = {
  uri: string;
  mimeType: string;
  fileName: string;
  isVideo: boolean;
  source_duration_ms?: number;
};

type Props = {
  visible: boolean;
  maxVideoDurationMs: number;
  onClose: () => void;
  /** Fires after the modal dismiss animation (best-effort). */
  onAfterHide?: () => void;
  onCapture: (result: ExploreCameraCaptureResult) => void;
};

function RecordProgressRing({
  size,
  progress,
  recording,
}: {
  size: number;
  progress: number;
  recording: boolean;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = c * (1 - clamped);
  return (
    <Svg width={size} height={size} style={{ position: "absolute" }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={recording ? "#ef4444" : "#ffffff"}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

export function ExploreCameraCaptureSheet({
  visible,
  maxVideoDurationMs,
  onClose,
  onAfterHide,
  onCapture,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const ep = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.explorePosts.${key}`, opts) as string;

  const cameraRef = useRef<CameraView>(null);
  const recordPromiseRef = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const recordStartedAtRef = useRef(0);
  const finishingRef = useRef(false);
  const rebindGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVisibleRef = useRef(false);

  const [cameraPermission, requestCameraPermission, getCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [facing, setFacing] = useState<"front" | "back">("front");
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [cameraReady, setCameraReady] = useState(false);
  const [hasEverBeenReady, setHasEverBeenReady] = useState(false);
  const [rebindGrace, setRebindGrace] = useState(false);
  const [modalPresented, setModalPresented] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);

  const clearRebindGraceTimer = useCallback(() => {
    if (rebindGraceTimerRef.current) {
      clearTimeout(rebindGraceTimerRef.current);
      rebindGraceTimerRef.current = null;
    }
  }, []);

  const startRebindGrace = useCallback(() => {
    clearRebindGraceTimer();
    setRebindGrace(true);
    rebindGraceTimerRef.current = setTimeout(() => {
      setRebindGrace(false);
      rebindGraceTimerRef.current = null;
    }, REBIND_GRACE_MS);
  }, [clearRebindGraceTimer]);

  useEffect(() => {
    if (!visible) return;
    setMode("photo");
    setFacing("front");
    setRecording(false);
    setRecordMs(0);
    setCameraReady(false);
    setHasEverBeenReady(false);
    setRebindGrace(false);
    setMountError(null);
    setModalPresented(false);
    finishingRef.current = false;
    recordPromiseRef.current = null;
    clearRebindGraceTimer();
  }, [visible, clearRebindGraceTimer]);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      void getCameraPermission();
    }
    wasVisibleRef.current = visible;
  }, [visible, getCameraPermission]);

  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void getCameraPermission();
      }
    });
    return () => sub.remove();
  }, [visible, getCameraPermission]);

  useEffect(() => {
    if (visible || !onAfterHide) return;
    const timer = setTimeout(() => onAfterHide(), MODAL_HIDE_MS);
    return () => clearTimeout(timer);
  }, [visible, onAfterHide]);

  const handleModalShow = useCallback(() => {
    setModalPresented(true);
    void getCameraPermission().then((perm) => {
      if (perm?.granted) return;
      if (perm?.canAskAgain !== false) {
        void requestCameraPermission();
      }
    });
  }, [getCameraPermission, requestCameraPermission]);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current || !recordPromiseRef.current) return;
    finishingRef.current = true;
    setRecording(false);
    const elapsed = Date.now() - recordStartedAtRef.current;
    const pending = recordPromiseRef.current;
    try {
      cameraRef.current?.stopRecording();
      const out = await pending;
      if (elapsed < MIN_RECORD_MS || !out?.uri) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCapture({
        uri: out.uri,
        mimeType: "video/mp4",
        fileName: `explore-record-${Date.now()}.mp4`,
        isVideo: true,
        source_duration_ms: Math.min(elapsed, maxVideoDurationMs),
      });
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      recordPromiseRef.current = null;
      finishingRef.current = false;
    }
  }, [maxVideoDurationMs, onCapture]);

  const finishRecordingRef = useRef(finishRecording);
  useEffect(() => {
    finishRecordingRef.current = finishRecording;
  }, [finishRecording]);

  useEffect(() => {
    if (!recording) {
      setRecordMs(0);
      return;
    }
    const timer = setInterval(() => {
      const elapsed = Date.now() - recordStartedAtRef.current;
      setRecordMs(elapsed);
      if (elapsed >= maxVideoDurationMs) {
        void finishRecordingRef.current();
      }
    }, 50);
    return () => clearInterval(timer);
  }, [recording, maxVideoDurationMs]);

  const controlsLocked = recording || rebindGrace || busy || (!cameraReady && !hasEverBeenReady);
  const sessionInteractive = !controlsLocked && (cameraReady || hasEverBeenReady);

  const startRecording = useCallback(() => {
    if (mode !== "video" || !sessionInteractive || recording || busy) return;
    if (!cameraPermission?.granted) return;
    if (!micPermission?.granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      void requestMicPermission();
      return;
    }
    const cam = cameraRef.current;
    if (!cam) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    recordStartedAtRef.current = Date.now();
    const pending = cam.recordAsync({
      maxDuration: maxVideoDurationMs / 1000,
    });
    if (!pending) return;
    recordPromiseRef.current = pending;
    setRecording(true);
  }, [
    mode,
    sessionInteractive,
    recording,
    busy,
    cameraPermission?.granted,
    micPermission?.granted,
    maxVideoDurationMs,
    requestMicPermission,
  ]);

  const canTakePhoto = cameraPermission?.granted === true;

  const takePhoto = useCallback(async () => {
    if (mode !== "photo" || !sessionInteractive || busy || !canTakePhoto) return;
    setBusy(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCapture({
        uri: photo.uri,
        mimeType: "image/jpeg",
        fileName: `explore-photo-${Date.now()}.jpg`,
        isVideo: false,
      });
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }, [mode, sessionInteractive, busy, canTakePhoto, onCapture]);

  const switchToPhoto = useCallback(() => {
    if (recording || controlsLocked) return;
    if (mode === "photo") return;
    startRebindGrace();
    setMode("photo");
  }, [recording, controlsLocked, mode, startRebindGrace]);

  const switchToVideo = useCallback(() => {
    if (recording || controlsLocked) return;
    if (mode === "video") return;
    void requestMicPermission();
    startRebindGrace();
    setMode("video");
  }, [recording, controlsLocked, mode, requestMicPermission, startRebindGrace]);

  const flipFacing = useCallback(() => {
    if (recording || controlsLocked || !sessionInteractive) return;
    setMountError(null);
    startRebindGrace();
    setFacing((f) => (f === "back" ? "front" : "back"));
  }, [recording, controlsLocked, sessionInteractive, startRebindGrace]);

  const onCameraReady = useCallback(() => {
    clearRebindGraceTimer();
    setRebindGrace(false);
    setMountError(null);
    setCameraReady(true);
    setHasEverBeenReady(true);
  }, [clearRebindGraceTimer]);

  const shutterSize = 84;
  const progress = recordMs / maxVideoDurationMs;

  const showCameraView =
    modalPresented && cameraPermission != null && cameraPermission.granted === true;

  const handlePermissionContinue = useCallback(() => {
    if (cameraPermission?.canAskAgain === false) {
      void openAppSettings();
      return;
    }
    void requestCameraPermission();
  }, [cameraPermission?.canAskAgain, requestCameraPermission]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onShow={handleModalShow}
      onRequestClose={() => {
        if (recording) return;
        onClose();
      }}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]}>
        {cameraPermission == null || !modalPresented ? (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={twStyle("text-white mt-3")}>{ep("openingCamera")}</Text>
          </View>
        ) : cameraPermission.granted && showCameraView ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mirror={facing === "front"}
            mode={mode === "video" ? "video" : "picture"}
            mute={false}
            onCameraReady={onCameraReady}
            onMountError={(event) => {
              const raw = event as { message?: string; nativeEvent?: { message?: string } };
              setCameraReady(false);
              setMountError(raw.message || raw.nativeEvent?.message || ep("cameraOpenFailed"));
            }}
          />
        ) : cameraPermission.granted ? (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={twStyle("text-white mt-3")}>{ep("openingCamera")}</Text>
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: 24 }]}>
            <Text style={twStyle("text-center text-white mb-4")}>{PERMISSION_COPY.cameraPost.message}</Text>
            <TouchableOpacity
              onPress={handlePermissionContinue}
              style={twStyle("rounded-full bg-white px-6 py-3")}
            >
              <Text style={twStyle("font-semibold text-gray-900")}>
                {cameraPermission.canAskAgain === false
                  ? ep("cameraPermissionOpenSettings")
                  : ep("cameraPermissionContinue")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            right: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={() => {
              if (recording) return;
              onClose();
            }}
            style={styles.iconBtn}
            accessibilityLabel={ep("cancel")}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.modePill}>
            <TouchableOpacity
              disabled={controlsLocked}
              onPress={switchToPhoto}
              style={[styles.modeBtn, mode === "photo" && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, mode === "photo" && styles.modeTextActive]}>{ep("capturePhoto")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={controlsLocked}
              onPress={switchToVideo}
              style={[styles.modeBtn, mode === "video" && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, mode === "video" && styles.modeTextActive]}>{ep("captureVideo")}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            disabled={controlsLocked || !canTakePhoto}
            onPress={flipFacing}
            style={styles.iconBtn}
            accessibilityLabel={facing === "front" ? ep("switchToBack") : ep("switchToFront")}
          >
            <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {mode === "video" && recording ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: insets.top + 64, left: 0, right: 0, alignItems: "center" }}
          >
            <View style={styles.recPill}>
              <View style={styles.recDot} />
              <Text style={styles.recPillText}>
                {ep("releaseToFinish")} · {Math.max(0, Math.ceil((maxVideoDurationMs - recordMs) / 1000))}s
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            alignItems: "center",
            paddingTop: 48,
            paddingBottom: insets.bottom + 28,
            paddingHorizontal: 24,
            backgroundColor: "rgba(0,0,0,0.28)",
          }}
          pointerEvents="box-none"
        >
          <View style={styles.lensChip}>
            <Text style={styles.lensChipText}>{facing === "front" ? ep("lensFront") : ep("lensBack")}</Text>
          </View>
          <Text style={styles.hintText}>
            {mountError
              ? mountError
              : !sessionInteractive
                ? ep("openingCamera")
                : mode === "video"
                  ? ep("holdToRecord")
                  : ep("tapForPhoto")}
          </Text>

          {mode === "photo" ? (
            <TouchableOpacity
              disabled={busy || !canTakePhoto || !sessionInteractive}
              onPress={() => void takePhoto()}
              style={[styles.shutterHit, (!sessionInteractive || busy) && styles.shutterDisabled]}
              activeOpacity={0.85}
              accessibilityLabel={ep("tapForPhoto")}
            >
              <View style={styles.photoRing} />
              <View style={styles.shutterInnerPhoto} />
            </TouchableOpacity>
          ) : (
            <Pressable
              disabled={busy || !canTakePhoto || !sessionInteractive}
              onPressIn={startRecording}
              onPressOut={() => void finishRecording()}
              accessibilityLabel={ep("holdToRecord")}
              style={({ pressed }) => [
                styles.shutterHit,
                (!sessionInteractive || busy) && styles.shutterDisabled,
                pressed && { transform: [{ scale: 0.96 }] },
              ]}
            >
              <RecordProgressRing size={shutterSize} progress={progress} recording={recording} />
              <View style={[styles.shutterInnerVideo, recording && styles.shutterInnerRecording]} />
            </Pressable>
          )}

          {mode === "video" && !micPermission?.granted && cameraPermission?.granted ? (
            <Text style={twStyle("text-amber-200/90 text-xs mt-4 text-center px-8")}>
              {ep("micPermissionForVideo")}
            </Text>
          ) : null}
          {busy ? <ActivityIndicator color="#fff" style={{ marginTop: 12 }} /> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modePill: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    padding: 4,
  },
  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modeBtnActive: {
    backgroundColor: "#fff",
  },
  modeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  modeTextActive: {
    color: "#111",
  },
  lensChip: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  lensChipText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  hintText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  recPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(220,38,38,0.95)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  recPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  shutterHit: {
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  photoRing: {
    position: "absolute",
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: "#fff",
  },
  shutterInnerPhoto: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
  shutterInnerVideo: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
  shutterInnerRecording: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#ef4444",
  },
});
