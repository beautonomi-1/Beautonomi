import { useState, useMemo, useCallback, useEffect } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { formatDateKeyInTimeZone } from "@beautonomi/utils";
import { parseCalendarDateParam } from "@/lib/calendar-parse";

export type CalendarViewMode = "day" | "3day" | "week";

interface UseProviderCalendarRangeOptions {
  initialDate?: Date | null;
  providerTimezone: string | null;
}

export function useProviderCalendarRange({
  initialDate,
  providerTimezone,
}: UseProviderCalendarRangeOptions) {
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate ?? new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("day");
  const [providerTodayTick, setProviderTodayTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setProviderTodayTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const providerTodayKey = useMemo(() => {
    return formatDateKeyInTimeZone(new Date(), providerTimezone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerTimezone, providerTodayTick]);

  const isProviderToday = useCallback(
    (d: Date) => formatDateKeyInTimeZone(d, providerTimezone) === providerTodayKey,
    [providerTimezone, providerTodayKey],
  );

  const calendarDateKey = useCallback(
    (d: Date) => formatDateKeyInTimeZone(d, providerTimezone),
    [providerTimezone],
  );

  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const dateStr = calendarDateKey(selectedDate);
  const weekEnd = calendarDateKey(addDays(weekStart, 6));
  const weekStartStr = calendarDateKey(weekStart);
  const threeDayEnd = calendarDateKey(addDays(selectedDate, 2));

  const startDate = viewMode === "week" ? weekStartStr : viewMode === "3day" ? dateStr : weekStartStr;
  const endDate = viewMode === "week" ? weekEnd : viewMode === "3day" ? threeDayEnd : weekEnd;

  const navigateDate = useCallback(
    (direction: number) => {
      const amount = viewMode === "week" ? 7 : viewMode === "3day" ? 3 : 1;
      setSelectedDate((prev) => addDays(prev, direction > 0 ? amount : -amount));
    },
    [viewMode],
  );

  const jumpToToday = useCallback(() => {
    const next = parseCalendarDateParam(providerTodayKey, providerTimezone) ?? new Date();
    setSelectedDate(next);
  }, [providerTodayKey, providerTimezone]);

  const dateLabel = useMemo(() => {
    if (viewMode === "week") {
      return `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d")}`;
    }
    if (viewMode === "3day") {
      return `${format(selectedDate, "MMM d")} – ${format(addDays(selectedDate, 2), "MMM d")}`;
    }
    return format(selectedDate, "EEE, MMM d");
  }, [viewMode, weekStart, selectedDate]);

  return {
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    navigateDate,
    jumpToToday,
    weekStart,
    weekDays,
    dateStr,
    weekStartStr,
    weekEnd,
    startDate,
    endDate,
    providerTodayKey,
    isProviderToday,
    calendarDateKey,
    dateLabel,
  };
}
