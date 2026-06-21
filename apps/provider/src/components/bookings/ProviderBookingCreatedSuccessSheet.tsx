import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApiMutation } from "@/hooks/useApi";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";
import {
  buildConfirmedAfterInlineConfirmModel,
  buildProviderBookingCreatedSuccessModel,
  type ProviderBookingCreatedSuccessInput,
} from "@/lib/provider-booking-created-success";

export type ProviderBookingCreatedSuccessPayload = ProviderBookingCreatedSuccessInput & {
  bookingId: string;
};

type Props = {
  visible: boolean;
  payload: ProviderBookingCreatedSuccessPayload | null;
  onDismiss: () => void;
};

function bannerStyles(tone: "amber" | "green" | "neutral") {
  if (tone === "amber") {
    return {
      wrap: twStyle("mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"),
      title: twStyle("text-xs font-semibold uppercase tracking-wide text-amber-800"),
      body: twStyle("mt-1 text-sm leading-5 text-amber-900"),
    };
  }
  if (tone === "green") {
    return {
      wrap: twStyle("mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"),
      title: twStyle("text-xs font-semibold uppercase tracking-wide text-emerald-800"),
      body: twStyle("mt-1 text-sm leading-5 text-emerald-900"),
    };
  }
  return {
    wrap: twStyle("mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"),
    title: twStyle("text-xs font-semibold uppercase tracking-wide text-gray-700"),
    body: twStyle("mt-1 text-sm leading-5 text-gray-800"),
  };
}

function iconPresentation(iconName: "checkmark-circle" | "time-outline" | "card-outline") {
  if (iconName === "time-outline" || iconName === "card-outline") {
    return { name: iconName, color: "#d97706", bg: "#fef3c7", border: "#fcd34d" };
  }
  return { name: iconName, color: Colors.primary, bg: `${Colors.primary}12`, border: `${Colors.primary}30` };
}

export function ProviderBookingCreatedSuccessSheet({ visible, payload, onDismiss }: Props) {
  const router = useRouter();
  const navigatedRef = useRef(false);
  const { execute: patchBooking, loading: confirming } = useApiMutation<{ booking?: { status?: string } }>("patch");
  const [confirmedInline, setConfirmedInline] = useState(false);

  useEffect(() => {
    if (visible) {
      navigatedRef.current = false;
      setConfirmedInline(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [visible, payload?.bookingId]);

  const model = useMemo(() => {
    if (!payload) return null;
    if (confirmedInline) {
      return buildConfirmedAfterInlineConfirmModel(payload);
    }
    return buildProviderBookingCreatedSuccessModel(payload);
  }, [payload, confirmedInline]);

  const navigateOnce = useCallback(
    (href: string) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      onDismiss();
      router.replace(href as never);
    },
    [onDismiss, router],
  );

  const goToBookingsList = useCallback(() => {
    navigateOnce("/(app)/(tabs)/bookings");
  }, [navigateOnce]);

  const goToBookingDetail = useCallback(
    (highlightConfirm?: boolean) => {
      if (!payload?.bookingId) {
        goToBookingsList();
        return;
      }
      const suffix = highlightConfirm ? "?highlightConfirm=1" : "";
      navigateOnce(`/(app)/(tabs)/bookings/${payload.bookingId}${suffix}`);
    },
    [goToBookingsList, navigateOnce, payload?.bookingId],
  );

  const handleConfirm = useCallback(async () => {
    if (!payload?.bookingId || confirming) return;
    const res = await patchBooking(`/api/provider/bookings/${payload.bookingId}`, { status: "booked" });
    if (res.error) {
      Alert.alert("Could not confirm", res.error);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConfirmedInline(true);
  }, [confirming, patchBooking, payload?.bookingId]);

  if (!visible || !payload || !model) return null;

  const icon = iconPresentation(model.iconName);
  const banner = bannerStyles(model.bannerTone);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={goToBookingsList}>
      <View style={twStyle("flex-1 items-center justify-center bg-black/55 px-6")}>
        <View style={twStyle("max-h-[90%] w-full max-w-md rounded-3xl bg-white p-6 shadow-lg")}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={twStyle("items-center")}>
              <View
                style={[
                  twStyle("mb-5 items-center justify-center rounded-full border-2"),
                  {
                    width: 88,
                    height: 88,
                    backgroundColor: icon.bg,
                    borderColor: icon.border,
                  },
                ]}
              >
                <Ionicons name={icon.name as keyof typeof Ionicons.glyphMap} size={52} color={icon.color} />
              </View>
              <Text style={twStyle("text-center text-2xl font-bold text-gray-950")}>{model.title}</Text>
              <Text style={twStyle("mt-2 text-center text-sm leading-6 text-gray-600")}>{model.subtitle}</Text>
            </View>

            {model.bannerTitle ? (
              <View style={banner.wrap}>
                <Text style={banner.title}>{model.bannerTitle}</Text>
                <Text style={banner.body}>{model.bannerBody}</Text>
              </View>
            ) : null}

            <View style={twStyle("mt-4 rounded-2xl bg-gray-50 px-4 py-3")}>
              {model.summaryLines.map((line, index) => (
                <Text key={`${index}-${line}`} style={twStyle("text-sm text-gray-800")}>
                  {line}
                </Text>
              ))}
            </View>

            {payload.warnings?.length ? (
              <View style={twStyle("mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3")}>
                {payload.warnings.map((w, index) => (
                  <Text key={`${index}-${w}`} style={twStyle("text-sm leading-5 text-amber-900")}>
                    {w}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={twStyle("mt-5")}>
            {model.showConfirmCta ? (
              <TouchableOpacity
                onPress={() => void handleConfirm()}
                disabled={confirming}
                style={[
                  twStyle("w-full items-center rounded-2xl px-5 py-4"),
                  { backgroundColor: Colors.primary, opacity: confirming ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Confirm booking"
              >
                {confirming ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={twStyle("text-sm font-bold text-white")}>Confirm booking</Text>
                )}
              </TouchableOpacity>
            ) : null}

            {model.showReviewCta ? (
              <TouchableOpacity
                onPress={() => goToBookingDetail(true)}
                style={twStyle("mt-3 w-full items-center rounded-2xl border border-gray-200 px-5 py-3.5")}
                accessibilityRole="button"
                accessibilityLabel="Review booking"
              >
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>Review booking</Text>
              </TouchableOpacity>
            ) : null}

            {model.showViewCta ? (
              <TouchableOpacity
                onPress={() => goToBookingDetail(false)}
                style={[
                  twStyle("mt-3 w-full items-center rounded-2xl px-5 py-4"),
                  { backgroundColor: Colors.primary },
                ]}
                accessibilityRole="button"
                accessibilityLabel="View booking"
              >
                <Text style={twStyle("text-sm font-bold text-white")}>View booking</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={goToBookingsList}
              style={twStyle("mt-3 w-full items-center rounded-2xl px-5 py-3")}
              accessibilityRole="button"
              accessibilityLabel="Back to bookings"
            >
              <Text style={twStyle("text-sm font-semibold text-gray-500")}>Back to bookings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
