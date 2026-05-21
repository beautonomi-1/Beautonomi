import { useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AnimatedRe, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";
import { Colors, Shadows } from "@/constants/colors";
import { buildProviderBookingActionModel, type ProviderBookingAction } from "@/lib/provider-booking-action-policy";

export interface BookingScheduleCardCustomer {
  full_name: string | null;
}

export interface BookingScheduleCardService {
  name?: string;
  offering_name?: string;
  duration_minutes?: number;
  staff_name?: string | null;
}

export interface BookingScheduleCardBooking {
  id: string;
  booking_number: string | null;
  status: string;
  db_status?: string | null;
  scheduled_at: string | null;
  total_amount: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
  outstanding_balance?: number | null;
  payment_status?: string | null;
  additional_charges?: { amount?: number | string | null; status?: string | null }[] | null;
  location_type?: "at_salon" | "at_home" | null;
  is_group_booking?: boolean;
  is_recurring?: boolean;
  recurring_series_id?: string | null;
  booking_source?: string | null;
  custom_offer?: unknown;
  customers?: BookingScheduleCardCustomer | null;
  services?: BookingScheduleCardService[];
}

interface BookingScheduleCardProps {
  booking: BookingScheduleCardBooking;
  currency: string;
  pendingIds: Set<string>;
  isNextUpcoming: boolean;
  onOpen: (booking: BookingScheduleCardBooking) => void;
  /**
   * Receives the full action so it can route to the right endpoint
   * (post-action route, custom payload, etc.). Journey actions like
   * `start_journey` share `dbTarget: "confirmed"` with `confirm` and would
   * otherwise be indistinguishable.
   */
  onApplyStatus: (id: string, action: ProviderBookingAction, msg: string) => void;
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "#dcfce7", text: "#166534" },
  completed: { bg: "#f3f4f6", text: "#374151" },
  cancelled: { bg: "#fee2e2", text: "#991b1b" },
  no_show: { bg: "#fee2e2", text: "#991b1b" },
  pending: { bg: "#fef3c7", text: "#92400e" },
  pending_payment: { bg: "#fde68a", text: "#78350f" },
  waiting: { bg: "#e0f2fe", text: "#075985" },
  checked_in: { bg: Colors.primarySoft, text: Colors.primary },
  in_progress: { bg: "#dbeafe", text: "#1e40af" },
  booked: { bg: Colors.primarySoft, text: Colors.primary },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  booked: "Booked",
  waiting: "Waiting",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

function normalizeBookingStatus(s: string): string {
  const x = (s || "").trim().toLowerCase();
  if (x === "booked") return "confirmed";
  if (x === "started") return "in_progress";
  return x;
}

function formatBookingStatusLabel(raw: string | null | undefined): string {
  const s = (raw || "").trim().toLowerCase();
  if (STATUS_LABEL[s]) return STATUS_LABEL[s];
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatScheduledDay(value: string | null | undefined): string {
  if (!value) return "Unscheduled";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Unscheduled";
  return parsed.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatBookingTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

function serviceSummary(services: BookingScheduleCardService[] | undefined): string {
  if (!services || services.length === 0) return "Booking";
  const first = services[0]?.name ?? services[0]?.offering_name ?? "Service";
  const extra = Math.max(0, services.length - 1);
  return extra > 0 ? `${first} +${extra} more` : first;
}

function getPaymentLabel(
  b: BookingScheduleCardBooking,
): { label: string; tone: "paid" | "partial" | "due" } | null {
  const status = (b.payment_status || "").toLowerCase();
  const total = Number(b.total_amount ?? 0);
  const paidAfterRefunds = Math.max(0, Number(b.total_paid ?? 0) - Number(b.total_refunded ?? 0));
  const walletGiftCoverage = Math.max(0, Number(b.wallet_amount ?? 0) + Number(b.gift_card_amount ?? 0));
  const unpaidAdditionalCharges = Array.isArray(b.additional_charges)
    ? b.additional_charges
        .filter((charge) => charge?.status !== "paid" && charge?.status !== "rejected")
        .reduce((sum, charge) => sum + Number(charge?.amount ?? 0), 0)
    : 0;
  const outstanding = b.outstanding_balance == null
    ? Math.max(0, total - Math.max(paidAfterRefunds, walletGiftCoverage) + unpaidAdditionalCharges)
    : Math.max(0, Number(b.outstanding_balance));
  if (status === "paid" || (total > 0 && outstanding <= 0)) return { label: "Paid", tone: "paid" };
  if (paidAfterRefunds > 0 || walletGiftCoverage > 0) return { label: "Part paid", tone: "partial" };
  if (total > 0 || outstanding > 0) return { label: "Payment due", tone: "due" };
  return null;
}

function pillColors(tone: "paid" | "partial" | "due") {
  if (tone === "paid") return { bg: "#dcfce7", text: "#166534" };
  if (tone === "partial") return { bg: "#ffedd5", text: "#9a3412" };
  return { bg: "#fef3c7", text: "#92400e" };
}

export function BookingScheduleCard({
  booking,
  currency,
  pendingIds,
  isNextUpcoming,
  onOpen,
  onApplyStatus,
}: BookingScheduleCardProps) {
  const scale = useSharedValue(1);
  const statusOpacity = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const statusAnimStyle = useAnimatedStyle(() => ({ opacity: statusOpacity.value }));
  const customerName = booking.customers?.full_name || "Customer";
  const serviceName = serviceSummary(booking.services);
  // §Booking-lifecycle-coherence (audit 2026-05): when a booking is stuck at
  // `pending_payment` but payment has actually settled (paid/partially_paid
  // OR outstanding=0), display it as `pending` (awaiting provider). The
  // provider list API normalises this server-side, but this defensive guard
  // keeps the card correct even if a non-normalised caller reaches it.
  const _scheduleRawDb = booking.db_status || booking.status;
  const _schedulePaymentStatus = (booking.payment_status || "").toLowerCase();
  const _scheduleOutstanding = booking.outstanding_balance;
  const displayStatus =
    _scheduleRawDb === "pending_payment" &&
    (_schedulePaymentStatus === "paid" ||
      _schedulePaymentStatus === "partially_paid" ||
      (typeof _scheduleOutstanding === "number" && _scheduleOutstanding <= 0.005))
      ? "pending"
      : _scheduleRawDb;
  const ns = normalizeBookingStatus(displayStatus);
  const st = STATUS_STYLE[ns] ?? { bg: Colors.gray[100], text: Colors.gray[700] };
  const payment = getPaymentLabel(booking);
  const paymentStyle = payment ? pillColors(payment.tone) : null;
  const scheduledDay = formatScheduledDay(booking.scheduled_at);
  const scheduledTime = formatBookingTime(booking.scheduled_at);
  const staffName = booking.services?.find((s) => s.staff_name)?.staff_name ?? null;
  const totalDuration = booking.services?.reduce((n, s) => n + (s.duration_minutes ?? 0), 0) ?? 0;
  const actionModel = buildProviderBookingActionModel(booking, { listContext: true });
  const cta = actionModel.primaryListAction;
  const traits = [
    booking.location_type === "at_home" ? { label: "House call", icon: "home-outline" as const } : null,
    booking.is_recurring || booking.recurring_series_id ? { label: "Repeats", icon: "repeat-outline" as const } : null,
    booking.is_group_booking ? { label: "Group", icon: "people-outline" as const } : null,
    booking.booking_source === "walk_in" ? { label: "Walk-in", icon: "walk-outline" as const } : null,
    booking.booking_source === "provider" ? { label: "Provider", icon: "person-outline" as const } : null,
    booking.booking_source === "online" ? { label: "Online", icon: "globe-outline" as const } : null,
    booking.custom_offer ? { label: "Custom", icon: "pricetag-outline" as const } : null,
  ].filter(Boolean) as { label: string; icon: keyof typeof Ionicons.glyphMap }[];
  const visibleTraits = traits.slice(0, 2);
  const overflowCount = Math.max(0, traits.length - visibleTraits.length);

  useEffect(() => {
    statusOpacity.value = 0.35;
    statusOpacity.value = withTiming(1, { duration: 250 });
  }, [ns, statusOpacity]);

  return (
    <AnimatedRe.View style={animStyle}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onOpen(booking);
        }}
        onPressIn={() => {
          scale.value = withSpring(0.975, { damping: 20 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20 });
        }}
        style={[
          twStyle("mb-3 overflow-hidden bg-white p-4"),
          Shadows.cardSmall,
          {
            borderRadius: 24,
            borderWidth: isNextUpcoming ? 1.5 : 1,
            borderColor: isNextUpcoming ? Colors.primaryRing : "#f1f5f9",
          },
          isNextUpcoming ? Shadows.card : null,
        ]}
        accessibilityLabel={`Booking for ${customerName}`}
        accessibilityRole="button"
      >
        <View style={[twStyle("absolute bottom-4 left-0 top-4 w-1 rounded-r-full"), { backgroundColor: isNextUpcoming ? Colors.primary : st.text }]} />
        <View style={twStyle("flex-row")}>
          <View style={twStyle("mr-4 w-[58px] items-start pl-2")}>
            <Text style={twStyle("text-base font-extrabold text-gray-950")}>{scheduledTime}</Text>
            <Text style={twStyle("mt-0.5 text-[11px] font-semibold text-gray-400")} numberOfLines={1}>
              {scheduledDay}
            </Text>
            {totalDuration > 0 ? (
              <Text style={twStyle("mt-2 text-[11px] font-semibold text-gray-500")}>{totalDuration} min</Text>
            ) : null}
          </View>

          <View style={twStyle("min-w-0 flex-1")}>
            <View style={twStyle("flex-row items-start justify-between gap-2")}>
              <View style={twStyle("min-w-0 flex-1")}>
                <Text style={twStyle("text-base font-extrabold text-gray-950")} numberOfLines={1}>
                  {customerName}
                </Text>
                <Text style={twStyle("mt-1 text-sm font-medium text-gray-600")} numberOfLines={1}>
                  {serviceName}
                  {staffName ? ` · with ${staffName}` : ""}
                </Text>
              </View>
              <AnimatedRe.View
                style={[
                  twStyle("flex-row items-center rounded-full px-2.5 py-1"),
                  { backgroundColor: st.bg },
                  statusAnimStyle,
                ]}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.text, marginRight: 6 }} />
                <Text style={[twStyle("text-[11px] font-bold"), { color: st.text }]} numberOfLines={1}>
                  {formatBookingStatusLabel(displayStatus)}
                </Text>
              </AnimatedRe.View>
            </View>

            <View style={twStyle("my-3 h-px bg-gray-100")} />

            <View style={twStyle("gap-2")}>
              <View style={twStyle("flex-row flex-wrap items-center gap-2")}>
                {booking.total_amount != null && booking.total_amount > 0 ? (
                  <Text style={twStyle("text-sm font-extrabold text-gray-950")}>
                    {formatCurrency(booking.total_amount, currency)}
                  </Text>
                ) : null}
                {payment && paymentStyle ? (
                  <View style={[twStyle("rounded-full px-2 py-1"), { backgroundColor: paymentStyle.bg }]}>
                    <Text style={[twStyle("text-[11px] font-bold"), { color: paymentStyle.text }]}>{payment.label}</Text>
                  </View>
                ) : null}
                {visibleTraits.map((trait) => (
                  <View key={trait.label} style={twStyle("flex-row items-center gap-1 rounded-full bg-gray-100 px-2 py-1")}>
                    <Ionicons name={trait.icon} size={11} color="#6b7280" />
                    <Text style={twStyle("text-[11px] font-semibold text-gray-500")}>{trait.label}</Text>
                  </View>
                ))}
                {overflowCount > 0 ? (
                  <View style={twStyle("rounded-full bg-gray-100 px-2 py-1")}>
                    <Text style={twStyle("text-[11px] font-bold text-gray-500")}>+{overflowCount}</Text>
                  </View>
                ) : null}
              </View>

              <View style={twStyle("flex-row justify-end")}>
                {cta ? (
                  <TouchableOpacity
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      void onApplyStatus(booking.id, cta, `${cta.label} saved`);
                    }}
                    disabled={pendingIds.has(booking.id)}
                    style={[
                      twStyle("min-h-[36px] flex-row items-center justify-center rounded-full px-3.5"),
                      { backgroundColor: Colors.primary, minWidth: 96, maxWidth: "100%", flexShrink: 1 },
                      pendingIds.has(booking.id) ? { opacity: 0.7 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={cta.label}
                  >
                    {pendingIds.has(booking.id) ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text
                          style={twStyle("text-xs font-extrabold text-white")}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                        >
                          {cta.label}
                        </Text>
                        <Ionicons name="arrow-forward" size={13} color="#fff" style={{ marginLeft: 4 }} />
                      </>
                    )}
                  </TouchableOpacity>
                ) : booking.booking_number ? (
                  <Text style={twStyle("text-xs font-semibold text-gray-400")}>#{booking.booking_number}</Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </AnimatedRe.View>
  );
}
