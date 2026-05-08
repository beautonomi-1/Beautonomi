import { View, Text, ScrollView, RefreshControl } from "react-native";
import { format } from "date-fns";
import { Colors } from "@/constants/colors";
import { CalendarTypography } from "@/features/calendar/theme/typography";
import { CalendarBookingCard } from "@/features/calendar/components/list/CalendarBookingCard";
import { CalendarBlockCard } from "@/features/calendar/components/list/CalendarBlockCard";
import { CalendarHoldCard } from "@/features/calendar/components/list/CalendarHoldCard";
import { WalkInWidget } from "@/features/calendar/components/list/WalkInWidget";
import { parseApiDateTime } from "@/components/calendar/calendar-layout";
import { formatDateKeyInTimeZone } from "@beautonomi/utils";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";
import type { CalendarOverlayTimeBlockLike } from "@/features/calendar/utils/overlays";
import type { ColorByMode } from "@/hooks/useCalendarPreferences";
import type { TFunction } from "@beautonomi/i18n";

interface Props {
  selectedDate: Date;
  bookings: CalendarBooking[];
  blocks: CalendarOverlayTimeBlockLike[];
  holdBlocks: CalendarOverlayTimeBlockLike[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onTapBooking: (b: CalendarBooking) => void;
  onTapBlock?: (b: CalendarOverlayTimeBlockLike) => void;
  onWalkInWidget?: () => void;
  waitingRoomCount: number;
  pendingIds: Set<string>;
  highlightedBookingId: string | null;
  colorBy: ColorByMode;
  staffList: { id: string; name: string }[];
  providerTimezone: string | null;
  offersMobileServices?: boolean;
  t: TFunction;
}

export function CalendarScheduleList({
  selectedDate,
  bookings,
  blocks,
  holdBlocks,
  loading,
  refreshing,
  onRefresh,
  onTapBooking,
  onTapBlock,
  onWalkInWidget,
  waitingRoomCount,
  pendingIds,
  highlightedBookingId,
  colorBy,
  staffList,
  providerTimezone,
  offersMobileServices,
  t,
}: Props) {
  const dayKey = formatDateKeyInTimeZone(selectedDate, providerTimezone);
  const dayBookings = bookings.filter((b) => {
    const d = parseApiDateTime(b.scheduled_at);
    return d != null && formatDateKeyInTimeZone(d, providerTimezone) === dayKey;
  });
  const dayBlocks = blocks.filter((b) => b.date === dayKey);
  const dayHolds = holdBlocks.filter((h) => h.date === dayKey);

  // Sort all items by start time
  const sortedBookings = [...dayBookings].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );

  const isEmpty = !loading && sortedBookings.length === 0 && dayBlocks.length === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.gray[50] }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 80 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
      }
    >
      {waitingRoomCount > 0 && onWalkInWidget && (
        <WalkInWidget count={waitingRoomCount} onPress={onWalkInWidget} />
      )}

      {dayBlocks.map((b) => (
        <CalendarBlockCard key={b.id} block={b} onPress={onTapBlock ? () => onTapBlock(b) : undefined} />
      ))}

      {dayHolds.map((h) => (
        <CalendarHoldCard key={h.id} block={h} providerTimezone={providerTimezone} />
      ))}

      {sortedBookings.length > 0 && (
        <Text
          style={[CalendarTypography.sectionHead, { marginLeft: 16, marginBottom: 8, marginTop: dayBlocks.length > 0 ? 8 : 0 }]}
        >
          {format(selectedDate, "EEE, MMM d").toUpperCase()} · {sortedBookings.length} APPT
          {sortedBookings.length !== 1 ? "S" : ""}
        </Text>
      )}

      {sortedBookings.map((b) => (
        <CalendarBookingCard
          key={b.calendar_item_id}
          booking={b}
          colorBy={colorBy}
          staffList={staffList}
          providerTimezone={providerTimezone}
          isPending={pendingIds.has(b.id)}
          isHighlighted={b.id === highlightedBookingId}
          offersMobileServices={offersMobileServices}
          onPress={() => onTapBooking(b)}
          t={t}
        />
      ))}

      {isEmpty && (
        <View style={{ flex: 1, alignItems: "center", paddingTop: 48, paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: Colors.gray[400], textAlign: "center" }}>
            No appointments
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400], textAlign: "center" }}>
            {format(selectedDate, "EEE, MMM d")} is free — tap + to add one.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
