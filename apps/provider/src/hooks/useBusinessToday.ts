import { useCallback, useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  formatBusinessDayYYYYMMDD,
  startOfBusinessDayLocalDate,
} from "@beautonomi/utils";

export function computeBusinessTodayAnchor(providerTimezone?: string | null): {
  businessToday: Date;
  businessTodayKey: string;
} {
  const businessToday = startOfBusinessDayLocalDate(providerTimezone);
  const businessTodayKey = formatBusinessDayYYYYMMDD(businessToday, providerTimezone);
  return { businessToday, businessTodayKey };
}

/**
 * Provider business "today" that self-heals on navigation focus, app foreground,
 * and timezone changes. Uses {@link startOfBusinessDayLocalDate} so display
 * helpers (`format`, `isSameDay`) and API day keys stay aligned.
 */
export function useBusinessToday(providerTimezone?: string | null): {
  businessToday: Date;
  businessTodayKey: string;
} {
  const [anchor, setAnchor] = useState(() => computeBusinessTodayAnchor(providerTimezone));

  const refreshAnchor = useCallback(() => {
    const next = computeBusinessTodayAnchor(providerTimezone);
    setAnchor((prev) => {
      if (prev.businessTodayKey === next.businessTodayKey) return prev;
      return next;
    });
  }, [providerTimezone]);

  useEffect(() => {
    refreshAnchor();
  }, [refreshAnchor]);

  useFocusEffect(
    useCallback(() => {
      refreshAnchor();
    }, [refreshAnchor]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("beautonomi:app:focus", refreshAnchor);
    return () => sub.remove();
  }, [refreshAnchor]);

  return anchor;
}
