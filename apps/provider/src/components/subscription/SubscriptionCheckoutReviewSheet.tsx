import { View, Text, ScrollView, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { shouldUseAppleIap } from "@/lib/iap/platform";
import { webPrivacyPolicyUrl, webTermsOfServiceUrl } from "@/lib/legal-web";

export type SubscriptionCheckoutReview = {
  /** Accent badge label, e.g. "Upgrade" / "Renewal". */
  heading: string;
  /** Plan name, e.g. "Growth". */
  title: string;
  subtitle?: string;
  /** Price breakdown rows. The last row renders as the bold total. */
  lineItems: { label: string; value: string }[];
  /** What the provider gets — rendered with check icons. */
  benefits: string[];
  /** Formatted amount to charge (e.g. "R299/month"). */
  total: string;
  confirmLabel?: string;
  /** When true, show recurring-billing disclosure + cancel-anytime note. */
  recurring?: boolean;
};

/**
 * Polished review/summary sheet shown before opening Paystack for a paid
 * subscription. Replaces the native Alert.alert confirm so the provider
 * subscription checkout matches the ads / customer product-order gold standard:
 * clear price breakdown, what-you-get, an explicit charged-only-after-confirm
 * note, and a cancel-anytime reassurance for recurring plans.
 */
export function SubscriptionCheckoutReviewSheet({
  visible,
  review,
  submitting,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  review: SubscriptionCheckoutReview | null;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const useAppleIap = shouldUseAppleIap();

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Review your plan"
      subtitle={
        useAppleIap
          ? "Confirm the details below before completing your App Store purchase."
          : "Confirm the details below before paying securely."
      }
      snapHeight="full"
    >
      {review ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
        >
          <View style={twStyle("gap-4")}>
            <View style={twStyle("rounded-3xl border border-pink-100 bg-pink-50 p-4")}>
              <Text style={twStyle("text-[11px] font-semibold uppercase tracking-wider text-pink-700")}>
                {review.heading}
              </Text>
              <Text style={twStyle("mt-1 text-xl font-bold text-gray-950")}>{review.title}</Text>
              {review.subtitle ? (
                <Text style={twStyle("mt-1 text-sm leading-5 text-gray-600")}>{review.subtitle}</Text>
              ) : null}
            </View>

            {review.benefits.length > 0 ? (
              <View style={twStyle("gap-2")}>
                {review.benefits.map((benefit) => (
                  <View key={benefit} style={twStyle("flex-row items-start gap-2")}>
                    <Ionicons name="checkmark-circle" size={18} color="#059669" />
                    <Text style={twStyle("flex-1 text-sm leading-5 text-gray-700")}>{benefit}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-4")}>
              {review.lineItems.map((item, idx) => {
                const isTotal = idx === review.lineItems.length - 1;
                return (
                  <View
                    key={item.label}
                    style={twStyle(
                      `flex-row items-center justify-between ${idx > 0 ? "mt-2" : ""} ${
                        isTotal ? "border-t border-gray-100 pt-3 mt-3" : ""
                      }`,
                    )}
                  >
                    <Text
                      style={twStyle(
                        isTotal ? "text-sm font-semibold text-gray-900" : "text-sm text-gray-600",
                      )}
                    >
                      {item.label}
                    </Text>
                    <Text
                      style={twStyle(
                        isTotal ? "text-base font-bold text-gray-950" : "text-sm font-medium text-gray-800",
                      )}
                    >
                      {item.value}
                    </Text>
                  </View>
                );
              })}
            </View>

            {review.recurring ? (
              <View style={twStyle("flex-row items-start gap-2 rounded-2xl bg-gray-50 p-3")}>
                <Ionicons name="repeat-outline" size={16} color="#6b7280" />
                <Text style={twStyle("flex-1 text-xs leading-5 text-gray-500")}>
                  This plan renews automatically each billing period. You can{" "}
                  <Text style={twStyle("font-semibold text-gray-700")}>cancel anytime</Text> — you keep access until
                  the end of the period you already paid for.
                </Text>
              </View>
            ) : null}

            <View style={twStyle("flex-row items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3")}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#047857" />
              <Text style={twStyle("flex-1 text-xs leading-5 text-emerald-800")}>
                {useAppleIap
                  ? "You are only charged after you confirm with Face ID, Touch ID, or your App Store password. Your plan activates once Apple verifies the purchase — never before."
                  : "You are only charged after you confirm on the secure Paystack page. Your plan activates once payment is verified — never before."}
              </Text>
            </View>

            {useAppleIap ? (
              <View style={twStyle("flex-row flex-wrap gap-x-4 gap-y-1 px-1")}>
                <Text
                  onPress={() => void Linking.openURL(webTermsOfServiceUrl())}
                  style={twStyle("text-xs font-semibold text-gray-600 underline")}
                  accessibilityRole="link"
                >
                  Terms of Use
                </Text>
                <Text
                  onPress={() => void Linking.openURL(webPrivacyPolicyUrl())}
                  style={twStyle("text-xs font-semibold text-gray-600 underline")}
                  accessibilityRole="link"
                >
                  Privacy Policy
                </Text>
              </View>
            ) : null}

            <ActionButton
              label={
                submitting
                  ? useAppleIap
                    ? "Opening App Store purchase…"
                    : "Opening secure checkout…"
                  : (review.confirmLabel ?? (useAppleIap ? `Purchase ${review.total}` : `Pay ${review.total}`))
              }
              onPress={onConfirm}
              loading={submitting}
              disabled={submitting}
              icon="lock-closed"
              fullWidth
            />
          </View>
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}
