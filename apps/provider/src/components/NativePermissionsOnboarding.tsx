/**
 * First-session native setup for the provider app: push, location, and media.
 * Shown once per install after sign-in.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/providers/AuthProvider";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
import { Colors } from "@/constants/colors";

const STEPS = ["welcome", "notifications", "location", "photos"] as const;

async function requestOneSignalPush(): Promise<void> {
  try {
    const { OneSignal } = await import("react-native-onesignal");
    await OneSignal.Notifications.requestPermission(true);
  } catch {
    // Expo Go / missing native module
  }
}

export function NativePermissionsOnboarding() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { gate, markOnboardingFinished } = useNativePermissionsOnboardingGate();
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const visible =
    Platform.OS !== "web" && gate.phase === "needs_onboarding" && !!session?.access_token;

  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      await markOnboardingFinished();
    } finally {
      setBusy(false);
    }
  }, [markOnboardingFinished]);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, []);

  const onEnableNotifications = useCallback(async () => {
    setBusy(true);
    try {
      await requestOneSignalPush();
    } finally {
      setBusy(false);
      goNext();
    }
  }, [goNext]);

  const onEnableLocation = useCallback(async () => {
    setBusy(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } finally {
      setBusy(false);
      goNext();
    }
  }, [goNext]);

  const onEnablePhotos = useCallback(async () => {
    setBusy(true);
    try {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      await ImagePicker.requestCameraPermissionsAsync();
    } finally {
      setBusy(false);
      await finish();
    }
  }, [finish]);

  if (!visible) return null;

  const step = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.white,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 24,
        }}
      >
        <View style={{ height: 4, backgroundColor: Colors.gray[100], borderRadius: 2, marginBottom: 28 }}>
          <View
            style={{
              width: `${progress}%` as `${number}%`,
              height: "100%",
              backgroundColor: Colors.primary,
              borderRadius: 2,
            }}
          />
        </View>

        {step === "welcome" && (
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>
              Set up Beautonomi Provider
            </Text>
            <Text style={{ fontSize: 16, lineHeight: 24, color: Colors.gray[600], marginBottom: 24 }}>
              Turn on a few permissions so you never miss bookings, can navigate to clients, and add photos to your
              work. You can skip any step and change these later in device settings.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
              <Text style={{ flex: 1, fontSize: 15, color: Colors.gray[700] }}>
                New bookings, on-demand requests, and messages
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
              <Text style={{ flex: 1, fontSize: 15, color: Colors.gray[700] }}>
                Location while using the app for arrival and route features
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
              <Text style={{ flex: 1, fontSize: 15, color: Colors.gray[700] }}>Camera and library for catalogue &amp; proof</Text>
            </View>
          </View>
        )}

        {step === "notifications" && (
          <View style={{ flex: 1 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: Colors.primaryLight,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <Ionicons name="notifications-outline" size={28} color={Colors.primary} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>
              Don’t miss a booking
            </Text>
            <Text style={{ fontSize: 16, lineHeight: 24, color: Colors.gray[600] }}>
              Notifications alert you to new bookings, on-demand requests, client messages, payouts, and time-sensitive
              updates.
            </Text>
          </View>
        )}

        {step === "location" && (
          <View style={{ flex: 1 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: Colors.primaryLight,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <Ionicons name="location-outline" size={28} color={Colors.primary} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>
              Location while using the app
            </Text>
            <Text style={{ fontSize: 16, lineHeight: 24, color: Colors.gray[600] }}>
              Used when you start a journey, mark arrival, or share your position with a client for at-home services.
              We only request access while you are using the app.
            </Text>
          </View>
        )}

        {step === "photos" && (
          <View style={{ flex: 1 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: Colors.primaryLight,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <Ionicons name="images-outline" size={28} color={Colors.primary} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>
              Photos &amp; camera
            </Text>
            <Text style={{ fontSize: 16, lineHeight: 24, color: Colors.gray[600] }}>
              Optional: for catalogue images, profile photos, and documenting work when your workflow requires it.
            </Text>
          </View>
        )}

        <View style={{ gap: 12, marginTop: 8 }}>
          {step === "welcome" && (
            <>
              <TouchableOpacity
                onPress={goNext}
                disabled={busy}
                style={{
                  backgroundColor: Colors.primary,
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue setup"
              >
                <Text style={{ color: Colors.white, fontSize: 17, fontWeight: "600" }}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={finish} disabled={busy} accessibilityRole="button">
                <Text style={{ textAlign: "center", color: Colors.gray[500], fontSize: 15, paddingVertical: 8 }}>
                  Skip for now
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "notifications" && (
            <>
              <TouchableOpacity
                onPress={onEnableNotifications}
                disabled={busy}
                style={{
                  backgroundColor: Colors.primary,
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Enable notifications"
              >
                {busy ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={{ color: Colors.white, fontSize: 17, fontWeight: "600" }}>Turn on notifications</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={goNext} disabled={busy}>
                <Text style={{ textAlign: "center", color: Colors.gray[500], fontSize: 15, paddingVertical: 8 }}>
                  Not now
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "location" && (
            <>
              <TouchableOpacity
                onPress={onEnableLocation}
                disabled={busy}
                style={{
                  backgroundColor: Colors.primary,
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Allow location access"
              >
                {busy ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={{ color: Colors.white, fontSize: 17, fontWeight: "600" }}>Allow location access</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={goNext} disabled={busy}>
                <Text style={{ textAlign: "center", color: Colors.gray[500], fontSize: 15, paddingVertical: 8 }}>
                  Not now
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "photos" && (
            <>
              <TouchableOpacity
                onPress={onEnablePhotos}
                disabled={busy}
                style={{
                  backgroundColor: Colors.primary,
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Allow photos and camera"
              >
                {busy ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={{ color: Colors.white, fontSize: 17, fontWeight: "600" }}>Allow photos &amp; camera</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void finish()}
                disabled={busy}
                style={{
                  marginTop: 4,
                  backgroundColor: Colors.gray[900],
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue without photo access"
              >
                <Text style={{ color: Colors.white, fontSize: 17, fontWeight: "600" }}>Get started</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
