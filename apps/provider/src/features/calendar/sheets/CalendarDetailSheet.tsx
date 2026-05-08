import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { CalendarTypography } from "@/features/calendar/theme/typography";
import { StatusPill } from "@/features/calendar/components/pills/StatusPill";
import { ModePillFromBooking as ModePill } from "@/features/calendar/components/pills/ModePill";
import { DepositPill } from "@/features/calendar/components/pills/DepositPill";
import { contextualActionsFromBooking } from "@/features/calendar/policies/actionAvailability.policy";
import { labelForDbStatus } from "@/lib/provider-booking-status-transitions";
import { formatTimeInZone, formatCurrency } from "@/lib/format";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";
import type { TFunction } from "@beautonomi/i18n";

interface Props {
  visible: boolean;
  booking: CalendarBooking | null;
  providerTimezone: string | null;
  offersMobileServices?: boolean;
  isPending?: boolean;
  onClose: () => void;
  onApplyStatus: (bookingId: string, dbTarget: string, reason?: string) => Promise<{ error: string | null }>;
  onReschedule?: () => void;
  onRequestPayment?: () => void;
  t: TFunction;
}

export function CalendarDetailSheet({
  visible,
  booking,
  providerTimezone,
  offersMobileServices,
  isPending,
  onClose,
  onApplyStatus,
  onReschedule,
  onRequestPayment,
  t,
}: Props) {
  const router = useRouter();
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [applying, setApplying] = useState(false);

  const handleClose = useCallback(() => {
    setCancelMode(false);
    setCancelReason("");
    onClose();
  }, [onClose]);

  const handleAction = useCallback(
    async (dbTarget: string) => {
      if (!booking) return;
      if (dbTarget === "cancelled") {
        setCancelMode(true);
        return;
      }
      setApplying(true);
      try {
        const res = await onApplyStatus(booking.id, dbTarget);
        if (res.error) Alert.alert("Error", res.error);
        else handleClose();
      } finally {
        setApplying(false);
      }
    },
    [booking, onApplyStatus, handleClose],
  );

  const handleCancel = useCallback(async () => {
    if (!booking) return;
    setApplying(true);
    try {
      const res = await onApplyStatus(booking.id, "cancelled", cancelReason);
      if (res.error) Alert.alert("Error", res.error);
      else handleClose();
    } finally {
      setApplying(false);
    }
  }, [booking, cancelReason, onApplyStatus, handleClose]);

  if (!booking) return null;

  const actions = contextualActionsFromBooking(booking);
  const timeLabel = formatTimeInZone(booking.scheduled_at, providerTimezone);
  const customerName = booking.customers?.full_name?.trim() || "Walk-in";
  const totalAmount = Number(booking.total_amount ?? 0);
  const totalPaid = Number(booking.total_paid ?? 0);
  const totalDue = Math.max(0, totalAmount - totalPaid);
  const currency = booking.currency || "USD";

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={customerName} snapHeight="auto" showHandle>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Time + service summary */}
        <Text style={[CalendarTypography.heroMeta, { marginBottom: 10 }]}>
          {timeLabel}
          {booking.calendar_service_name ? ` · ${booking.calendar_service_name}` : ""}
        </Text>

        {/* Pills */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          <StatusPill booking={booking} />
          <ModePill booking={booking} offersMobileServices={offersMobileServices} />
          <DepositPill booking={booking} t={t} />
        </View>

        {/* Services & Products */}
        {(booking.services?.length > 0 || booking.booking_products?.length) ? (
          <Section title="Items">
            {booking.services?.map((s, i) => (
              <View key={`svc-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>{s.name}</Text>
                  {s.staff_name ? (
                    <Text style={{ fontSize: 13, color: Colors.gray[500] }}>Staff: {s.staff_name}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>
                    {s.duration_minutes}m
                  </Text>
                  {s.price != null ? (
                    <Text style={{ fontSize: 13, color: Colors.gray[500] }}>
                      {formatCurrency(s.price, currency)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}

            {booking.booking_products?.map((p, i) => (
              <View key={`prod-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6, marginTop: booking.services?.length > 0 && i === 0 ? 8 : 0 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>
                    {p.products?.name || "Product"} <Text style={{ color: Colors.gray[500], fontWeight: "400" }}>x{p.quantity}</Text>
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 13, color: Colors.gray[500] }}>
                    {formatCurrency(p.total_price, currency)}
                  </Text>
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        {/* Context */}
        <Section title="Details">
          <ContextRow icon="location-outline" label={booking.locations?.name || "Location"} />
          {booking.notes ? <ContextRow icon="document-text-outline" label={booking.notes} /> : null}
          {booking.is_group_booking ? (
            <ContextRow icon="people-outline" label="Group booking" />
          ) : null}
          {booking.recurring_series_id ? (
            <ContextRow icon="repeat-outline" label="Recurring series" />
          ) : null}
          {booking.package_id ? (
            <ContextRow icon="gift-outline" label={booking.service_packages?.name || "Package"} />
          ) : null}
        </Section>

        {/* Payment */}
        {totalAmount > 0 && (
          <Section title="Payment">
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Total</Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>
                {formatCurrency(totalAmount, currency)}
              </Text>
            </View>
            {totalPaid > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Paid</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.success }}>
                  {formatCurrency(totalPaid, currency)}
                </Text>
              </View>
            )}
            {totalDue > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Due</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.warning }}>
                  {formatCurrency(totalDue, currency)}
                </Text>
              </View>
            )}
          </Section>
        )}

        {/* Cancel sub-flow */}
        {cancelMode ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.error, marginBottom: 8 }}>
              Cancel booking
            </Text>
            <Text style={{ fontSize: 13, color: Colors.gray[600], marginBottom: 12 }}>
              This cannot be undone. Reason (optional):
            </Text>
            <View
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 12,
                minHeight: 80,
                backgroundColor: Colors.gray[50],
              }}
            >
              <Text style={{ color: Colors.gray[500] }}>
                {cancelReason || "e.g. Client request"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, borderRadius: 10, paddingVertical: 12, backgroundColor: Colors.gray[100], alignItems: "center" }}
                onPress={() => setCancelMode(false)}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[700] }}>Go back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, borderRadius: 10, paddingVertical: 12, backgroundColor: Colors.error, alignItems: "center" }}
                onPress={handleCancel}
                disabled={applying}
              >
                {applying ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.white }}>Confirm Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Primary + secondary actions */}
            {actions.length > 0 && (
              <View style={{ marginTop: 16 }}>
                {actions.slice(0, 1).map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={{
                      borderRadius: 12,
                      paddingVertical: 14,
                      marginBottom: 10,
                      alignItems: "center",
                      backgroundColor: a.destructive ? Colors.error : Colors.primary,
                    }}
                    onPress={() => handleAction(a.dbTarget)}
                    disabled={applying || isPending}
                  >
                    {applying ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.white }}>
                        {labelForDbStatus(a.dbTarget)}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
                {actions.slice(1).map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={{
                      borderRadius: 10,
                      paddingVertical: 12,
                      marginBottom: 8,
                      alignItems: "center",
                      backgroundColor: a.destructive ? "#FEF2F2" : Colors.gray[100],
                      borderWidth: a.destructive ? 1 : 0,
                      borderColor: a.destructive ? "#FECACA" : "transparent",
                    }}
                    onPress={() => handleAction(a.dbTarget)}
                    disabled={applying || isPending}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: a.destructive ? Colors.error : Colors.gray[800],
                      }}
                    >
                      {labelForDbStatus(a.dbTarget)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Secondary quick actions: Reschedule, Payment, Phone, Message */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {onReschedule && (
                <SecondaryActionButton
                  icon="calendar-outline"
                  label="Reschedule"
                  onPress={() => { onReschedule(); }}
                />
              )}
              {onRequestPayment && totalDue > 0 && (
                <SecondaryActionButton
                  icon="card-outline"
                  label="Payment"
                  onPress={() => { onRequestPayment(); }}
                />
              )}
              {booking.customers?.phone && (
                <SecondaryActionButton
                  icon="call-outline"
                  label="Call"
                  onPress={() => {
                    Linking.openURL(`tel:${booking.customers!.phone}`);
                  }}
                />
              )}
            </View>

            <TouchableOpacity
              style={{
                marginTop: 12,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                backgroundColor: Colors.gray[50],
                borderWidth: 1,
                borderColor: Colors.gray[200],
              }}
              onPress={() => {
                if (booking.is_group_booking && booking.group_booking_id) {
                  router.push(`/(app)/(tabs)/more/group-bookings?open_group_id=${booking.group_booking_id}` as never);
                } else {
                  router.push(`/(app)/(tabs)/more/bookings/${booking.id}` as never);
                }
                handleClose();
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[700] }}>Open Full Record</Text>
              <Ionicons name="open-outline" size={15} color={Colors.gray[500]} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function SecondaryActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: Colors.gray[100],
        minHeight: 44,
      }}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={15} color={Colors.gray[700]} style={{ marginRight: 6 }} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[CalendarTypography.sectionHead, { marginBottom: 8 }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function ContextRow({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
      <Ionicons name={icon} size={15} color={Colors.gray[500]} style={{ marginRight: 8, marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 14, color: Colors.gray[700] }}>{label}</Text>
    </View>
  );
}
