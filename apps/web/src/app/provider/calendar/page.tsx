import { CalendarClient } from "./CalendarClient";
import { fetchCalendarInitial } from "./fetch-calendar-initial";

export const dynamic = "force-dynamic";

export default async function ProviderCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const initialCalendar = await fetchCalendarInitial({ date: sp.date });
  return <CalendarClient initialCalendar={initialCalendar} />;
}
