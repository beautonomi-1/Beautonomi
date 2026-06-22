import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import * as Haptics from "expo-haptics";
import {
  buildDateOptions,
  DEFAULT_BOOKING_DATE_RANGE_DAYS,
  formatRelativeDateLabel,
  findNextAvailableSlot,
  groupSlotsByPeriod,
  type BookingSlotPeriod,
  type BookingSlotRow,
} from "@/lib/booking-date-time-helpers";
import { twStyle } from "@/lib/twStyle";

/* ──────────────────────────────────────────────────────────
   DATE STRIP
   ────────────────────────────────────────────────────────── */

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
        twStyle(
          `items-center rounded-2xl px-3 py-2.5 ${
            isActive
              ? "bg-gray-900"
              : isToday
                ? "border border-emerald-200 bg-emerald-50"
                : "border border-gray-200 bg-white"
          }`,
        ),
        { minWidth, marginRight: 8 },
      ]}
      onPress={() => onSelectDate(d)}
      accessibilityRole="radio"
      accessibilityState={{ checked: isActive }}
      accessibilityLabel={format(d, "EEEE, MMMM d")}
    >
      <Text
        style={twStyle(
          `text-[10px] font-semibold ${
            isActive ? "text-gray-300" : isToday ? "text-emerald-700" : "text-gray-500"
          }`,
        )}
      >
        {relative}
      </Text>
      <Text style={twStyle(`text-base font-bold ${isActive ? "text-white" : "text-gray-900"}`)}>
        {format(d, "d")}
      </Text>
      <Text
        style={twStyle(
          `text-[10px] ${
            isActive ? "text-gray-300" : isToday ? "text-emerald-700" : "text-gray-500"
          }`,
        )}
      >
        {format(d, "MMM")}
      </Text>
    </TouchableOpacity>
  );
});

type BookingDateStripProps = {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  rangeDays?: number;
  isTablet?: boolean;
};

export function BookingDateStrip({
  selectedDate,
  onSelectDate,
  rangeDays = DEFAULT_BOOKING_DATE_RANGE_DAYS,
  isTablet,
}: BookingDateStripProps) {
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

/* ──────────────────────────────────────────────────────────
   PERIOD FILTER TABS
   Shows which periods have slots and lets the user filter
   down to a single period. Tap the active period to show all.
   ────────────────────────────────────────────────────────── */

const PERIOD_ICONS: Record<BookingSlotPeriod, keyof typeof Ionicons.glyphMap> = {
  morning: "sunny-outline",
  afternoon: "partly-sunny-outline",
  evening: "moon-outline",
};

type PeriodFilterTabsProps = {
  periods: Array<{ period: BookingSlotPeriod; label: string; openCount: number }>;
  activeFilter: BookingSlotPeriod | null;
  onFilterChange: (period: BookingSlotPeriod | null) => void;
};

function PeriodFilterTabs({ periods, activeFilter, onFilterChange }: PeriodFilterTabsProps) {
  if (periods.length <= 1) return null;

  const handlePress = (period: BookingSlotPeriod) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Toggle: tapping the active filter clears it (show all)
    onFilterChange(activeFilter === period ? null : period);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 2 }}
      style={{ marginBottom: 12 }}
    >
      {periods.map((p) => {
        const isActive = activeFilter === p.period;
        return (
          <TouchableOpacity
            key={p.period}
            onPress={() => handlePress(p.period)}
            style={[
              twStyle(
                `mr-2 flex-row items-center rounded-full border px-3 ${
                  isActive
                    ? "border-gray-800 bg-gray-900"
                    : "border-gray-200 bg-gray-50"
                }`,
              ),
              { height: 34 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={isActive ? `Showing ${p.label} only. Tap to show all.` : `Filter to ${p.label}`}
          >
            <Ionicons
              name={PERIOD_ICONS[p.period]}
              size={13}
              color={isActive ? "#e5e7eb" : "#6b7280"}
            />
            <Text
              style={twStyle(
                `ml-1 text-xs font-semibold ${isActive ? "text-gray-200" : "text-gray-600"}`,
              )}
            >
              {p.label}
            </Text>
            {p.openCount > 0 ? (
              <View
                style={[
                  twStyle(
                    `ml-1.5 items-center justify-center rounded-full ${
                      isActive ? "bg-white/20" : "bg-emerald-100"
                    }`,
                  ),
                  { minWidth: 18, height: 18, paddingHorizontal: 4 },
                ]}
              >
                <Text
                  style={twStyle(
                    `text-[10px] font-bold ${isActive ? "text-white" : "text-emerald-700"}`,
                  )}
                >
                  {p.openCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ──────────────────────────────────────────────────────────
   SLOT CHIP
   ────────────────────────────────────────────────────────── */

type TimeSlotChipProps = {
  row: BookingSlotRow;
  isActive: boolean;
  chipWidth: number;
  columnIndex: number;
  onSelect: (time: string) => void;
};

const BookingTimeSlotChip = memo(function BookingTimeSlotChip({
  row,
  isActive,
  chipWidth,
  columnIndex,
  onSelect,
}: TimeSlotChipProps) {
  const unavailable = !row.available;

  const handlePress = useCallback(() => {
    if (unavailable) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(row.time);
  }, [unavailable, onSelect, row.time]);

  const baseChip = unavailable
    ? "border border-red-200 bg-red-50"
    : isActive
      ? "border border-emerald-700 bg-emerald-600"
      : "border border-emerald-200 bg-emerald-50";

  return (
    <TouchableOpacity
      disabled={unavailable}
      style={[
        twStyle(`rounded-xl px-2 ${baseChip}`),
        {
          width: chipWidth,
          minHeight: 44,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 8,
          marginRight: columnIndex % 3 === 2 ? 0 : 8,
        },
      ]}
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityState={{ checked: isActive, disabled: unavailable }}
      accessibilityLabel={
        unavailable
          ? `${row.time}, unavailable${row.reason ? `, ${row.reason}` : ""}`
          : `Time ${row.time}`
      }
    >
      <Text
        style={twStyle(
          `text-center text-sm font-semibold ${
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

/* ──────────────────────────────────────────────────────────
   SKELETON
   ────────────────────────────────────────────────────────── */

function SlotGridSkeleton({ chipWidth }: { chipWidth: number }) {
  return (
    <View>
      <View style={[twStyle("mb-2 h-3 w-20 rounded-full bg-gray-200"), { marginBottom: 10 }]} />
      <View style={twStyle("flex-row flex-wrap")}>
        {Array.from({ length: 9 }).map((_, i) => (
          <View
            key={i}
            style={[
              twStyle("mb-2 rounded-xl bg-gray-100"),
              { width: chipWidth, height: 44, marginRight: i % 3 === 2 ? 0 : 8 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/* ──────────────────────────────────────────────────────────
   PERIOD GROUPS
   ────────────────────────────────────────────────────────── */

type PeriodSlotGroupsProps = {
  grouped: ReturnType<typeof groupSlotsByPeriod>;
  selectedTime: string;
  onSelectTime: (time: string) => void;
  chipWidth: number;
};

function PeriodSlotGroups({
  grouped,
  selectedTime,
  onSelectTime,
  chipWidth,
}: PeriodSlotGroupsProps) {
  return (
    <>
      {grouped.map((group) => {
        const openCount = group.rows.filter((row) => row.available).length;
        return (
          <View key={group.period} style={twStyle("mb-4")}>
            {/* Period header */}
            <View style={twStyle("mb-2.5 flex-row items-center")}>
              <Ionicons
                name={PERIOD_ICONS[group.period]}
                size={13}
                color="#6b7280"
                style={{ marginRight: 5 }}
              />
              <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
                {group.label}
              </Text>
              <View style={twStyle("ml-auto flex-row items-center")}>
                <View
                  style={[
                    twStyle(`rounded-full ${openCount > 0 ? "bg-emerald-100" : "bg-gray-100"}`),
                    { paddingHorizontal: 7, paddingVertical: 2 },
                  ]}
                >
                  <Text
                    style={twStyle(
                      `text-[10px] font-bold ${openCount > 0 ? "text-emerald-700" : "text-gray-400"}`,
                    )}
                  >
                    {openCount} open
                  </Text>
                </View>
              </View>
            </View>

            {/* Slot chips */}
            <View style={twStyle("flex-row flex-wrap")}>
              {group.rows.map((row, index) => (
                <BookingTimeSlotChip
                  key={row.time}
                  row={row}
                  isActive={selectedTime === row.time}
                  chipWidth={chipWidth}
                  columnIndex={index}
                  onSelect={onSelectTime}
                />
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
}

/* ──────────────────────────────────────────────────────────
   MAIN GRID EXPORT
   ────────────────────────────────────────────────────────── */

type BookingTimeSlotGridProps = {
  rows: BookingSlotRow[];
  selectedTime: string;
  onSelectTime: (time: string) => void;
  loading?: boolean;
  providerTimezone?: string | null;
  /** @deprecated No-op. The host sheet handles scrolling. */
  layout?: "grid" | "wrap";
  showLegend?: boolean;
  showNextAvailable?: boolean;
  /**
   * @deprecated Accepted for backward compat but ignored.
   * The host BottomSheet's own ScrollView handles overflow; a nested
   * bounded ScrollView caused same-direction clipping (~3 visible rows).
   */
  maxHeight?: number;
};

export function BookingTimeSlotGrid({
  rows,
  selectedTime,
  onSelectTime,
  loading = false,
  providerTimezone,
  showLegend = true,
  showNextAvailable = true,
}: BookingTimeSlotGridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const timeSlotGridOuterWidth = Math.min(windowWidth - 32, 400);
  const timeSlotChipWidth = Math.max(64, Math.floor((timeSlotGridOuterWidth - 16) / 3));

  const allGrouped = useMemo(() => groupSlotsByPeriod(rows), [rows]);
  const nextSlot = useMemo(() => findNextAvailableSlot(rows, selectedTime), [rows, selectedTime]);

  // Period filter: null = show all, or a specific period
  const [activePeriodFilter, setActivePeriodFilter] = useState<BookingSlotPeriod | null>(null);

  // Reset filter whenever the slot list itself changes (new date selected, service changed, etc.)
  // so a stale "Evening" filter doesn't leave an empty grid if the new date has only morning slots.
  useEffect(() => {
    setActivePeriodFilter(null);
  }, [rows]);

  // If the currently selected slot is in a period that still exists after filter, keep it visible
  const grouped = useMemo(
    () =>
      activePeriodFilter == null
        ? allGrouped
        : allGrouped.filter((g) => g.period === activePeriodFilter),
    [allGrouped, activePeriodFilter],
  );

  const periodFilterMeta = useMemo(
    () =>
      allGrouped.map((g) => ({
        period: g.period,
        label: g.label,
        openCount: g.rows.filter((r) => r.available).length,
      })),
    [allGrouped],
  );

  const handleNextAvailable = useCallback(() => {
    if (nextSlot) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelectTime(nextSlot.time);
    }
  }, [nextSlot, onSelectTime]);

  /* Loading skeleton (no rows yet) */
  if (loading && rows.length === 0) {
    return (
      <View>
        <Text style={twStyle("mb-3 text-center text-sm text-gray-500")}>Loading times…</Text>
        <SlotGridSkeleton chipWidth={timeSlotChipWidth} />
      </View>
    );
  }

  /* Empty state */
  if (!loading && rows.length === 0) {
    return (
      <View style={twStyle("items-center py-8")}>
        <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
        <Text style={twStyle("mt-3 text-sm text-gray-500")}>No times available for this date</Text>
        <Text style={twStyle("mt-1 text-xs text-gray-400")}>
          Try a different day or adjust your services
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Soft "updating" indicator while new results load */}
      {loading ? (
        <Text style={twStyle("mb-2 text-center text-xs font-medium text-gray-400")}>
          Updating times…
        </Text>
      ) : null}

      {/* Timezone label */}
      {providerTimezone ? (
        <View style={twStyle("mb-3 flex-row items-center")}>
          <Ionicons name="time-outline" size={12} color="#9ca3af" style={{ marginRight: 4 }} />
          <Text style={twStyle("text-xs text-gray-400")}>
            Times in {providerTimezone.replace(/_/g, " ")}
          </Text>
        </View>
      ) : null}

      {/* Next available pill */}
      {showNextAvailable && nextSlot && nextSlot.time !== selectedTime ? (
        <TouchableOpacity
          onPress={handleNextAvailable}
          style={twStyle(
            "mb-3 flex-row items-center self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5",
          )}
          accessibilityRole="button"
          accessibilityLabel={`Jump to next available: ${nextSlot.time}`}
        >
          <Ionicons name="flash-outline" size={13} color="#059669" />
          <Text style={twStyle("ml-1.5 text-xs font-semibold text-emerald-800")}>
            Next available: {nextSlot.time}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Legend */}
      {showLegend ? (
        <View style={twStyle("mb-3 flex-row flex-wrap items-center gap-x-4")}>
          <View style={twStyle("flex-row items-center")}>
            <View style={twStyle("mr-1.5 h-2 w-2 rounded-full bg-emerald-400")} />
            <Text style={twStyle("text-xs text-gray-500")}>Open</Text>
          </View>
          <View style={twStyle("flex-row items-center")}>
            <View style={twStyle("mr-1.5 h-2 w-2 rounded-full bg-red-300")} />
            <Text style={twStyle("text-xs text-gray-500")}>Unavailable</Text>
          </View>
        </View>
      ) : null}

      {/* Period filter tabs — tap to filter, tap again to show all */}
      <PeriodFilterTabs
        periods={periodFilterMeta}
        activeFilter={activePeriodFilter}
        onFilterChange={setActivePeriodFilter}
      />

      {/* Active filter banner — informs user they are viewing a subset */}
      {activePeriodFilter != null ? (
        <TouchableOpacity
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActivePeriodFilter(null);
          }}
          style={twStyle(
            "mb-3 flex-row items-center self-start rounded-full border border-gray-200 bg-gray-100 px-3 py-1",
          )}
          accessibilityRole="button"
          accessibilityLabel="Clear filter, show all times"
        >
          <Ionicons name="close-circle" size={13} color="#6b7280" />
          <Text style={twStyle("ml-1 text-xs font-medium text-gray-600")}>Show all times</Text>
        </TouchableOpacity>
      ) : null}

      {/* Slot groups — rendered directly; host BottomSheet ScrollView handles overflow */}
      <PeriodSlotGroups
        grouped={grouped}
        selectedTime={selectedTime}
        onSelectTime={onSelectTime}
        chipWidth={timeSlotChipWidth}
      />
    </View>
  );
}
