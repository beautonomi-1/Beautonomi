import { memo, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  type ListRenderItemInfo,
  useWindowDimensions,
} from "react-native";
import { format, isSameDay } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import {
  buildDateOptions,
  DEFAULT_BOOKING_DATE_RANGE_DAYS,
  formatRelativeDateLabel,
  findNextAvailableSlot,
  groupSlotsByPeriod,
  type BookingSlotRow,
} from "@/lib/booking-date-time-helpers";
import { twStyle } from "@/lib/twStyle";

type DateChipProps = {
  date: Date;
  selectedDate: Date;
  today: Date;
  minWidth: number;
  onSelectDate: (d: Date) => void;
};

const BookingDateChip = memo(function BookingDateChip({
  date: d,
  selectedDate,
  today,
  minWidth,
  onSelectDate,
}: DateChipProps) {
  const isActive = isSameDay(d, selectedDate);
  const isToday = isSameDay(d, today);
  const relative = formatRelativeDateLabel(d, today);
  return (
    <TouchableOpacity
      style={[
        twStyle(`items-center rounded-2xl px-3 py-2.5 ${
          isActive ? "bg-gray-900" : isToday ? "border border-emerald-200 bg-emerald-50" : "border border-gray-200 bg-white"
        }`),
        { minWidth, marginRight: 8 },
      ]}
      onPress={() => onSelectDate(d)}
      accessibilityRole="radio"
      accessibilityState={{ checked: isActive }}
      accessibilityLabel={format(d, "EEEE, MMMM d")}
    >
      <Text
        style={twStyle(`text-[10px] font-semibold ${isActive ? "text-gray-300" : isToday ? "text-emerald-700" : "text-gray-500"}`)}
      >
        {relative}
      </Text>
      <Text style={twStyle(`text-base font-bold ${isActive ? "text-white" : "text-gray-900"}`)}>{format(d, "d")}</Text>
      <Text style={twStyle(`text-[10px] ${isActive ? "text-gray-300" : isToday ? "text-emerald-700" : "text-gray-500"}`)}>
        {format(d, "MMM")}
      </Text>
    </TouchableOpacity>
  );
});

type TimeSlotChipProps = {
  row: BookingSlotRow;
  isActive: boolean;
  chipWidth: number;
  columnIndex: number;
  onSelect: (time: string) => void;
  variant?: "grid" | "wrap";
};

const BookingTimeSlotChip = memo(function BookingTimeSlotChip({
  row,
  isActive,
  chipWidth,
  columnIndex,
  onSelect,
  variant = "grid",
}: TimeSlotChipProps) {
  const unavailable = !row.available;
  const baseChip = unavailable
    ? "border border-red-200 bg-red-50"
    : isActive
      ? "border border-emerald-700 bg-emerald-600"
      : "border border-emerald-200 bg-emerald-50";

  if (variant === "wrap") {
    return (
      <TouchableOpacity
        disabled={unavailable}
        onPress={() => {
          if (!unavailable) onSelect(row.time);
        }}
        style={[twStyle(`rounded-lg px-3 py-2 mr-2 mb-2 ${unavailable ? "border border-red-200 bg-red-50" : isActive ? "bg-gray-900" : "border border-gray-200 bg-white"}`)]}
        accessibilityState={{ disabled: unavailable, selected: isActive }}
      >
        <Text
          style={twStyle(
            `text-sm font-medium ${unavailable ? "text-red-300 line-through" : isActive ? "text-white" : "text-gray-700"}`,
          )}
        >
          {row.time}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      disabled={unavailable}
      style={[
        twStyle(`rounded-lg px-2 py-2 ${baseChip}`),
        { width: chipWidth, marginBottom: 8, marginRight: columnIndex % 3 === 2 ? 0 : 8 },
      ]}
      onPress={() => {
        if (!unavailable) onSelect(row.time);
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: isActive, disabled: unavailable }}
      accessibilityLabel={
        unavailable ? `${row.time}, unavailable${row.reason ? `, ${row.reason}` : ""}` : `Time ${row.time}`
      }
    >
      <Text
        style={twStyle(
          `text-center text-sm font-medium ${
            unavailable ? "text-red-300 line-through" : isActive ? "text-white" : "text-emerald-800"
          }`,
        )}
      >
        {row.time}
      </Text>
      {unavailable && row.reason ? (
        <Text style={twStyle("mt-0.5 text-center text-[10px] text-red-400")} numberOfLines={2}>
          {row.reason}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

function SlotGridSkeleton({ chipWidth }: { chipWidth: number }) {
  return (
    <View style={twStyle("flex-row flex-wrap")}>
      {Array.from({ length: 9 }).map((_, i) => (
        <View
          key={i}
          style={[
            twStyle("mb-2 rounded-lg bg-gray-100"),
            { width: chipWidth, height: 40, marginRight: i % 3 === 2 ? 0 : 8 },
          ]}
        />
      ))}
    </View>
  );
}

type BookingDateStripProps = {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  rangeDays?: number;
  isTablet?: boolean;
};

export function BookingDateStrip({ selectedDate, onSelectDate, rangeDays = DEFAULT_BOOKING_DATE_RANGE_DAYS, isTablet }: BookingDateStripProps) {
  const today = useMemo(() => new Date(), []);
  const dateOptions = useMemo(() => buildDateOptions(rangeDays, today), [rangeDays, today]);
  const dateChipMinWidth = isTablet ? 76 : 64;
  const dateChipStride = dateChipMinWidth + 8;
  const dateOptionsFlatListRef = useRef<FlatList<Date>>(null);

  const dateInitialScrollIndex = useMemo(() => {
    const i = dateOptions.findIndex((d) => isSameDay(d, selectedDate));
    const idx = i >= 0 ? i : 0;
    return Math.min(idx, Math.max(0, dateOptions.length - 1));
  }, [dateOptions, selectedDate]);

  return (
    <FlatList<Date>
      ref={dateOptionsFlatListRef}
      horizontal
      data={dateOptions}
      keyExtractor={(d: Date) => d.toISOString()}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 4 }}
      initialScrollIndex={dateInitialScrollIndex}
      getItemLayout={(_data: ArrayLike<Date> | null | undefined, index: number) => ({
        length: dateChipStride,
        offset: dateChipStride * index,
        index,
      })}
      onScrollToIndexFailed={(info: { index: number }) => {
        requestAnimationFrame(() => {
          dateOptionsFlatListRef.current?.scrollToOffset({
            offset: Math.max(0, info.index) * dateChipStride,
            animated: false,
          });
        });
      }}
      renderItem={({ item: d }: ListRenderItemInfo<Date>) => (
        <BookingDateChip
          date={d}
          selectedDate={selectedDate}
          today={today}
          minWidth={dateChipMinWidth}
          onSelectDate={onSelectDate}
        />
      )}
    />
  );
}

type BookingTimeSlotGridProps = {
  rows: BookingSlotRow[];
  selectedTime: string;
  onSelectTime: (time: string) => void;
  loading?: boolean;
  providerTimezone?: string | null;
  /** @deprecated Both values render the same flex-wrap layout. */
  layout?: "grid" | "wrap";
  showLegend?: boolean;
  showNextAvailable?: boolean;
  /** When set, slots scroll inside this height. Omit to let the parent sheet scroll. */
  maxHeight?: number;
};

function PeriodSlotGroups({
  grouped,
  selectedTime,
  onSelectTime,
  chipWidth,
}: {
  grouped: ReturnType<typeof groupSlotsByPeriod>;
  selectedTime: string;
  onSelectTime: (time: string) => void;
  chipWidth: number;
}) {
  return (
    <>
      {grouped.map((group) => {
        const openCount = group.rows.filter((row) => row.available).length;
        return (
          <View key={group.period} style={twStyle("mb-3")}>
            <View style={twStyle("mb-2 flex-row items-center justify-between")}>
              <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{group.label}</Text>
              <Text style={twStyle("text-xs text-gray-400")}>
                {openCount} open
              </Text>
            </View>
            <View style={twStyle("flex-row flex-wrap")}>
              {group.rows.map((row, index) => (
                <BookingTimeSlotChip
                  key={row.time}
                  row={row}
                  isActive={selectedTime === row.time}
                  chipWidth={chipWidth}
                  columnIndex={index}
                  onSelect={onSelectTime}
                  variant="grid"
                />
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
}

export function BookingTimeSlotGrid({
  rows,
  selectedTime,
  onSelectTime,
  loading = false,
  providerTimezone,
  layout: _layout = "grid",
  showLegend = true,
  showNextAvailable = true,
  maxHeight,
}: BookingTimeSlotGridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const timeSlotGridOuterWidth = Math.min(windowWidth - 32, 400);
  const timeSlotChipWidth = Math.max(64, Math.floor((timeSlotGridOuterWidth - 16) / 3));
  const grouped = useMemo(() => groupSlotsByPeriod(rows), [rows]);
  const nextSlot = useMemo(() => findNextAvailableSlot(rows, selectedTime), [rows, selectedTime]);

  const handleNextAvailable = useCallback(() => {
    if (nextSlot) onSelectTime(nextSlot.time);
  }, [nextSlot, onSelectTime]);

  if (loading && rows.length === 0) {
    return (
      <View>
        <Text style={twStyle("mb-2 text-center text-sm text-gray-500")}>Updating times…</Text>
        <SlotGridSkeleton chipWidth={timeSlotChipWidth} />
      </View>
    );
  }

  if (!loading && rows.length === 0) {
    return <Text style={twStyle("py-4 text-center text-sm text-gray-500")}>No times for this date</Text>;
  }

  return (
    <View>
      {loading ? (
        <Text style={twStyle("mb-2 text-center text-xs font-medium text-gray-500")}>Updating times…</Text>
      ) : null}
      {providerTimezone ? (
        <Text style={twStyle("mb-2 text-xs text-gray-500")}>Times shown in {providerTimezone.replace(/_/g, " ")}</Text>
      ) : null}
      {showNextAvailable && nextSlot && nextSlot.time !== selectedTime ? (
        <TouchableOpacity
          onPress={handleNextAvailable}
          style={twStyle("mb-3 flex-row items-center self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5")}
        >
          <Ionicons name="flash-outline" size={14} color="#059669" />
          <Text style={twStyle("ml-1.5 text-xs font-semibold text-emerald-800")}>
            Next available: {nextSlot.time}
          </Text>
        </TouchableOpacity>
      ) : null}
      {showLegend ? (
        <View style={twStyle("mb-3 flex-row flex-wrap items-center")}>
          <View style={twStyle("mr-4 flex-row items-center")}>
            <View style={twStyle("mr-1.5 h-2 w-2 rounded-full bg-emerald-400")} />
            <Text style={twStyle("text-xs text-gray-600")}>Open</Text>
          </View>
          <View style={twStyle("flex-row items-center")}>
            <View style={twStyle("mr-1.5 h-2 w-2 rounded-full bg-red-300")} />
            <Text style={twStyle("text-xs text-gray-600")}>Unavailable</Text>
          </View>
        </View>
      ) : null}

      {maxHeight != null ? (
        <ScrollView style={{ maxHeight }} nestedScrollEnabled>
          <PeriodSlotGroups
            grouped={grouped}
            selectedTime={selectedTime}
            onSelectTime={onSelectTime}
            chipWidth={timeSlotChipWidth}
          />
        </ScrollView>
      ) : (
        <PeriodSlotGroups
          grouped={grouped}
          selectedTime={selectedTime}
          onSelectTime={onSelectTime}
          chipWidth={timeSlotChipWidth}
        />
      )}
    </View>
  );
}
