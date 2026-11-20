import { getLocationOpenState, minutesToTimeString } from "@beautonomi/utils";

const DAY_PP_KEY: Record<string, string> = {
  monday: "dayMonday",
  tuesday: "dayTuesday",
  wednesday: "dayWednesday",
  thursday: "dayThursday",
  friday: "dayFriday",
  saturday: "daySaturday",
  sunday: "daySunday",
};

type PpFn = (key: string, options?: Record<string, string | number>) => string;

/**
 * One-line open/closed label for the partner profile hero (signed-in only).
 * Returns null when hours/timezone are missing or state is unknown.
 */
function asHoursObject(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function formatPartnerProfileOpenLabel(
  workingHours: unknown,
  timezone: string | null | undefined,
  pp: PpFn,
  now: Date = new Date(),
): string | null {
  const tz = typeof timezone === "string" ? timezone.trim() : "";
  const hours = asHoursObject(workingHours);
  if (!tz || !isValidTimeZone(tz) || !hours || typeof hours !== "object") return null;

  const state = getLocationOpenState(hours, now, tz);
  if (state.status === "unknown") return null;

  if (state.status === "open" && state.closeMin != null) {
    return pp("openUntil", { time: minutesToTimeString(state.closeMin) });
  }

  if (state.status === "closed" && state.nextOpenDay && state.nextOpenMin != null) {
    const dayKey = DAY_PP_KEY[state.nextOpenDay.toLowerCase()];
    const day = dayKey ? pp(dayKey) : state.nextOpenDay;
    return pp("closedOpens", {
      day,
      time: minutesToTimeString(state.nextOpenMin),
    });
  }

  if (state.status === "closed") {
    return pp("closed");
  }

  return null;
}