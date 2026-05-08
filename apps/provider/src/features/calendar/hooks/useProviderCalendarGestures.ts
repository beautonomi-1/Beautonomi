import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";

interface UseProviderCalendarGesturesOptions {
  viewMode: "day" | "3day" | "week";
  layoutMode: "columns" | "single";
  multiStaff: boolean;
  navigateDate: (dir: number) => void;
}

/**
 * Extracts the day-swipe pan gesture from legacy CalendarScreenBody.
 * Preserves exact activeOffsetX / failOffsetY values from the original.
 */
export function useProviderCalendarGestures({
  viewMode,
  layoutMode,
  multiStaff,
  navigateDate,
}: UseProviderCalendarGesturesOptions) {
  const swipeDayPanGesture = useMemo(() => {
    const disableSwipe = viewMode === "day" && layoutMode === "columns" && multiStaff;
    return Gesture.Pan()
      .enabled(!disableSwipe)
      .activeOffsetX([-52, 52])
      .failOffsetY([-24, 24])
      .runOnJS(true)
      .onEnd((e) => {
        if (e.translationX > 72) navigateDate(-1);
        else if (e.translationX < -72) navigateDate(1);
      });
  }, [viewMode, layoutMode, multiStaff, navigateDate]);

  return { swipeDayPanGesture };
}
