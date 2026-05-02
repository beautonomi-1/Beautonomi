import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import type { TFunction } from "@beautonomi/i18n";
import { formatCurrency, formatTimeInZone } from "@/lib/format";
import { Colors } from "@/constants/colors";
import type { CalendarBooking, CalendarBookingDropContext } from "@/components/calendar/calendar-booking-types";

export type CalendarViewMode = "day" | "3day" | "week";

export interface CalendarBookingBlockProps {
  booking: CalendarBooking;
  colWidth: number;
  dropContext: CalendarBookingDropContext | null | undefined;
  viewMode: CalendarViewMode;
  top: number;
  blockHeight: number;
  colors: { bg: string; border: string; text: string };
  providerTimezone: string | null;
  walkInLabel: string;
  pendingBookingActionIds: Set<string>;
  pendingRescheduleBookingIds: Set<string>;
  draggingBooking: CalendarBooking | null;
  preferences: {
    highContrast: boolean;
    compactMode: boolean;
    showAppointmentIcons: boolean;
    showPrices: boolean;
    showClientPhone: boolean;
  };
  paymentLabel: string | null;
  paymentNeedsAction: boolean;
  isNew: boolean;
  isHighlighted?: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onDrop: (absoluteX: number, absoluteY: number) => void;
  draggingRef: React.MutableRefObject<boolean>;
  draggingBookingIdRef: React.MutableRefObject<string | null>;
  setDraggingBooking: (b: CalendarBooking | null) => void;
  setDragPosition: (p: { x: number; y: number } | null) => void;
  t: TFunction;
  translateBookingStatusLabel: (t: TFunction, status: string) => string;
}

/**
 * Single appointment cell on the calendar grid (with optional drag-to-reschedule on day view).
 */
function CalendarBookingBlockImpl({
  booking,
  colWidth,
  dropContext,
  viewMode,
  top,
  blockHeight: height,
  colors,
  providerTimezone,
  walkInLabel,
  pendingBookingActionIds,
  pendingRescheduleBookingIds,
  draggingBooking,
  preferences,
  paymentLabel,
  paymentNeedsAction,
  isNew,
  isHighlighted = false,
  onTap,
  onLongPress,
  onDrop,
  draggingRef,
  draggingBookingIdRef,
  setDraggingBooking,
  setDragPosition,
  t,
  translateBookingStatusLabel,
}: CalendarBookingBlockProps) {
  const isSmall = height < (preferences.compactMode ? 24 : 40);
  const isCancelled = booking.status === "cancelled";
  const hasNotes = !!booking.notes;
  const blockBg = preferences.highContrast ? Colors.gray[800] : colors.bg;
  const blockTextColor = preferences.highContrast ? Colors.white : colors.text;
  const isPendingThis =
    pendingBookingActionIds.has(booking.id) || pendingRescheduleBookingIds.has(booking.id);
  const canOpenActionMenu =
    booking.status !== "completed" && booking.status !== "cancelled" && !isPendingThis;
  const canDrag =
    dropContext &&
    booking.status !== "completed" &&
    booking.status !== "cancelled" &&
    viewMode === "day" &&
    !isPendingThis;

  const subTextColor = preferences.highContrast ? Colors.gray[400] : Colors.gray[500];

  const overflowButton = canOpenActionMenu ? (
    <TouchableOpacity
      onPress={(e) => {
        e?.stopPropagation?.();
        onLongPress();
      }}
      hitSlop={{ top: isSmall ? 12 : 10, bottom: isSmall ? 12 : 10, left: 12, right: 12 }}
      style={{
        position: "absolute",
        top: isSmall ? 0 : 2,
        right: isSmall ? 0 : 2,
        zIndex: 20,
        paddingHorizontal: isSmall ? 3 : 4,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: preferences.highContrast ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)",
      }}
      accessibilityRole="button"
      accessibilityLabel={t("provider.calendarScreen.bookingActionsMessage")}
    >
      <Ionicons
        name="ellipsis-horizontal"
        size={isSmall ? 10 : 12}
        color={preferences.highContrast ? Colors.white : Colors.gray[700]}
      />
    </TouchableOpacity>
  ) : null;

  const blockContent = (
    <>
      {preferences.showAppointmentIcons && isNew && (
        <View
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            borderBottomLeftRadius: 6,
            backgroundColor: "#4f46e6",
            paddingHorizontal: 4,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "700", color: Colors.white }} allowFontScaling={false}>
            {t("provider.calendarScreen.card.newBadge")}
          </Text>
        </View>
      )}
      {overflowButton}
      {isSmall ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: blockTextColor,
            paddingRight: canOpenActionMenu ? 22 : 0,
          }}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {booking.customers?.full_name ?? walkInLabel}
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{ flex: 1, fontSize: 12, fontWeight: "700", color: blockTextColor }}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {booking.customers?.full_name ?? walkInLabel}
            </Text>
            {preferences.showAppointmentIcons && hasNotes && (
              <Ionicons
                name="document-text-outline"
                size={12}
                color={preferences.highContrast ? "#fff" : "#6b7280"}
              />
            )}
          </View>
          {booking.services?.length > 0 && (
            <Text
              style={{ fontSize: 11, color: preferences.highContrast ? Colors.gray[300] : Colors.gray[600] }}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {booking.services.map((s) => {
                const name = booking.calendar_service_name || s.name || s.offering_name || t("provider.calendarScreen.card.serviceFallback");
                return s.guest_name ? `${name} (${s.guest_name})` : name;
              }).join(", ")}
            </Text>
          )}
          {booking.is_group_booking && booking.group_booking_ref && (
            <Text style={{ marginTop: 2, fontSize: 11, color: subTextColor }} numberOfLines={1} allowFontScaling={false}>
              {t("provider.calendarScreen.card.groupPrefix")} {booking.group_booking_ref}
            </Text>
          )}
          {booking.location_type === "at_home" && (
            <Text style={{ marginTop: 2, fontSize: 11, color: subTextColor }} numberOfLines={1} allowFontScaling={false}>
              {t("provider.calendarScreen.card.atHome")}
            </Text>
          )}
          {!preferences.compactMode && height >= 55 && (
            <Text style={{ marginTop: 2, fontSize: 11, color: subTextColor }} allowFontScaling={false}>
              {formatTimeInZone(booking.scheduled_at, providerTimezone)}
              {preferences.showPrices && <> &middot; {formatCurrency(booking.total_amount, booking.currency)}</>}
            </Text>
          )}
          {!preferences.compactMode && height >= 70 && paymentLabel && (
            <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name={paymentNeedsAction ? "card-outline" : "checkmark-circle-outline"}
                size={10}
                color={paymentNeedsAction ? "#b45309" : "#047857"}
                style={{ marginRight: 3 }}
              />
              <Text
                style={{ fontSize: 9, fontWeight: "700", color: paymentNeedsAction ? "#b45309" : "#047857" }}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {paymentLabel}
              </Text>
            </View>
          )}
          {preferences.showClientPhone && !preferences.compactMode && height >= 70 && booking.customers?.phone && (
            <Text style={{ fontSize: 9, color: subTextColor }} numberOfLines={1}>
              {booking.customers.phone}
            </Text>
          )}
        </>
      )}
    </>
  );

  const blockStyle = {
    position: "absolute" as const,
    left: 4,
    right: 4,
    top,
    height: Math.max(height, 20),
    zIndex: 10,
    opacity: draggingBooking?.calendar_item_id === booking.calendar_item_id
      ? 0.4
      : isCancelled
        ? 0.5
        : isPendingThis
          ? 0.55
          : 1,
    overflow: "hidden" as const,
    borderRadius: 8,
    borderWidth: isHighlighted ? 2 : 0,
    borderColor: isHighlighted ? "#f59e0b" : "transparent",
    borderLeftWidth: isHighlighted ? 5 : 3,
    borderLeftColor: colors.border,
    backgroundColor: blockBg,
    paddingHorizontal: 6,
    paddingVertical: 4,
  };

  if (canDrag) {
    const longPress = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(400)
      .onStart((e) => {
        draggingRef.current = true;
        draggingBookingIdRef.current = booking.calendar_item_id;
        setDraggingBooking(booking);
        if (Number.isFinite(e.absoluteX) && Number.isFinite(e.absoluteY)) {
          setDragPosition({ x: e.absoluteX - colWidth / 2, y: e.absoluteY - 24 });
        } else {
          setDragPosition(null);
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      });

    const pan = Gesture.Pan()
      .runOnJS(true)
      .onUpdate((e) => {
        if (draggingRef.current) {
          setDragPosition({ x: e.absoluteX - colWidth / 2, y: e.absoluteY - 24 });
        }
      })
      .onEnd((e) => {
        if (draggingRef.current && draggingBookingIdRef.current === booking.calendar_item_id) {
          onDrop(e.absoluteX, e.absoluteY);
        }
        draggingRef.current = false;
        draggingBookingIdRef.current = null;
        setDraggingBooking(null);
        setDragPosition(null);
      });

    const composed = Gesture.Simultaneous(longPress, pan);

    return (
      <GestureDetector key={booking.calendar_item_id} gesture={composed}>
        <TouchableOpacity
          style={blockStyle}
          activeOpacity={0.7}
          onPress={() => !draggingRef.current && onTap()}
          onLongPress={() => {
            if (!draggingRef.current) onLongPress();
          }}
          delayLongPress={500}
          accessibilityRole="button"
          accessibilityLabel={t("provider.calendarScreen.bookingA11yLongPress", {
            name: booking.customers?.full_name?.trim() || walkInLabel,
            time: formatTimeInZone(booking.scheduled_at, providerTimezone),
          })}
        >
          {blockContent}
          {paymentNeedsAction && !isSmall && (
            <View
              style={{
                position: "absolute",
                right: 4,
                bottom: 4,
                borderRadius: 6,
                backgroundColor: "rgba(255,255,255,0.82)",
                padding: 2,
              }}
            >
              <Ionicons name="card-outline" size={12} color="#6b7280" />
            </View>
          )}
        </TouchableOpacity>
      </GestureDetector>
    );
  }

  return (
    <TouchableOpacity
      key={booking.calendar_item_id}
      style={blockStyle}
      activeOpacity={0.7}
      onPress={onTap}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={t("provider.calendarScreen.bookingA11yShort", {
        name: booking.customers?.full_name?.trim() || walkInLabel,
        time: formatTimeInZone(booking.scheduled_at, providerTimezone),
        status: translateBookingStatusLabel(t, booking.status),
      })}
    >
      {blockContent}
      {paymentNeedsAction && !isSmall && (
        <View
          style={{
            position: "absolute",
            right: 4,
            bottom: 4,
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,0.82)",
            padding: 2,
          }}
        >
          <Ionicons name="card-outline" size={12} color="#6b7280" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export const CalendarBookingBlock = memo(CalendarBookingBlockImpl);
