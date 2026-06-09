import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

export type AdsCheckoutReview = {
  /** Accent badge label, e.g. "Time boost". */
  heading: string;
  /** Primary line, e.g. "7-day boost". */
  title: string;
  subtitle?: string;
  /** Price breakdown rows. The last row is rendered as the bold total. */
  lineItems: { label: string; value: string }[];
  /** What the provider gets — rendered with check icons. */
  benefits: string[];
  /** Formatted total to charge. */
  total: string;
  confirmLabel?: string;
};

/**
 * Polished review/summary sheet shown before opening Paystack. Replaces the
 * native Alert.alert confirm so the provider ads checkout matches the customer
 * product-order gold standard: clear price breakdown, what-you-get, a
 * "Sponsored" disclosure, and an explicit charged-only-after-confirm note.
 */
export function AdsCheckoutReviewSheet({
  visible,
  review,
  submitting,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  review: AdsCheckoutReview | null;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Review your boost"
      subtitle="Confirm the details below before paying securely."
      snapHeight="full"
    >
      {review ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
        >
          <View style={twStyle("gap-4")}>
            <View style={twStyle("rounded-3xl border border-indigo-100 bg-indigo-50 p-4")}>
              <Text style={twStyle("text-[11px] font-semibold uppercase tracking-wider text-indigo-700")}>
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

            <View style={twStyle("flex-row items-start gap-2 rounded-2xl bg-gray-50 p-3")}>
              <Ionicons name="megaphone-outline" size={16} color="#6b7280" />
              <Text style={twStyle("flex-1 text-xs leading-5 text-gray-500")}>
                Your listing will appear as a <Text style={twStyle("font-semibold text-gray-700")}>Sponsored</Text> result in
                eligible searches while the campaign is funded and active.
              </Text>
            </View>

            <View style={twStyle("flex-row items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3")}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#047857" />
              <Text style={twStyle("flex-1 text-xs leading-5 text-emerald-800")}>
                You are only charged after you confirm on the secure Paystack page. Your campaign goes live once payment is
                verified — never before.
              </Text>
            </View>

            <ActionButton
              label={submitting ? "Opening secure checkout…" : (review.confirmLabel ?? `Pay ${review.total}`)}
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
