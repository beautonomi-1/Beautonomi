import { useCallback, useState } from "react";
import type { ComponentType } from "react";
import { CalendarV2Chrome } from "@/features/calendar/screens/CalendarV2Chrome";
import type { CalendarV2ChromeContext, CalendarV2Segment } from "@/features/calendar/types/calendar";

export interface ProviderCalendarLegacyBodyProps {
  renderCalendarV2Chrome?: (ctx: CalendarV2ChromeContext) => React.ReactNode;
  calendarV2Segment?: CalendarV2Segment;
}

export function ProviderCalendarScreen({
  LegacyBody,
}: {
  LegacyBody: ComponentType<ProviderCalendarLegacyBodyProps>;
}) {
  const [segment, setSegment] = useState<CalendarV2Segment>("schedule");
  const renderChrome = useCallback(
    (ctx: CalendarV2ChromeContext) => <CalendarV2Chrome ctx={ctx} segment={segment} onSegmentChange={setSegment} />,
    [segment],
  );
  return <LegacyBody renderCalendarV2Chrome={renderChrome} calendarV2Segment={segment} />;
}
