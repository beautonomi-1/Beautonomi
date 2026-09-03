import { useApi } from "@/hooks/useApi";

type TeamAccessCalendar = {
  calendar_scope?: string | null;
  staff_id?: string | null;
};

/**
 * When team-access says `calendar_scope=own`, staff pickers must lock to the
 * signed-in staff row (parity with web CalendarClient).
 */
export function useCalendarScopeLock() {
  const { data } = useApi<TeamAccessCalendar>("/api/provider/team-access", {
    staleTimeMs: 60_000,
  });
  const selfStaffId = data?.staff_id ?? null;
  const calendarScopeOwn = data?.calendar_scope === "own" && Boolean(selfStaffId);
  return { calendarScopeOwn, selfStaffId };
}
