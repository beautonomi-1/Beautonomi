import {
  getLocationOpenState,
  minutesToTimeString,
  type WeeklyHoursRow,
  getWeeklyHoursRows,
} from "@beautonomi/utils";

export type LocationHoursInput = {
  working_hours?: unknown;
  timezone?: string | null;
};

export function formatLocationOpenLabel(
  loc: LocationHoursInput,
  t: (key: string, opts?: Record<string, string | number>) => string,
  prefix = "customer.mobile.shop.locationHours",
): string {
  const state = getLocationOpenState(loc.working_hours, new Date(), loc.timezone ?? "Africa/Johannesburg");
  if (state.status === "unknown") {
    return t(`${prefix}.notListed`);
  }
  if (state.status === "open" && state.closeMin != null) {
    return t(`${prefix}.openUntil`, { time: minutesToTimeString(state.closeMin) });
  }
  if (state.status === "closed" && state.nextOpenDay && state.nextOpenMin != null) {
    return t(`${prefix}.closedOpens`, {
      day: t(`${prefix}.days.${state.nextOpenDay}`),
      time: minutesToTimeString(state.nextOpenMin),
    });
  }
  return t(`${prefix}.closed`);
}

export function getWeeklyHoursRowsForLocation(loc: LocationHoursInput): WeeklyHoursRow[] {
  return getWeeklyHoursRows(loc.working_hours);
}
