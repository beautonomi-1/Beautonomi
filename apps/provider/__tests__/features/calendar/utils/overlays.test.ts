import {
  normalizeAvailabilityBlocksToSegments,
  availabilitySegmentToTimeBlock,
} from "@/features/calendar/utils/overlays";

describe("normalizeAvailabilityBlocksToSegments", () => {
  it("splits a single-day block into one segment", () => {
    const raw = [
      {
        id: "blk1",
        block_type: "break" as const,
        start_at: "2026-05-08T08:00:00.000Z",
        end_at: "2026-05-08T09:00:00.000Z",
        staff_id: null,
        location_id: null,
      },
    ];
    const segs = normalizeAvailabilityBlocksToSegments(raw, "UTC");
    expect(segs).toHaveLength(1);
    expect(segs[0]!.date).toBe("2026-05-08");
  });

  it("skips invalid timestamps", () => {
    const raw = [
      {
        id: "blk-bad",
        block_type: "break" as const,
        start_at: "not-a-date",
        end_at: "also-bad",
        staff_id: null,
        location_id: null,
      },
    ];
    expect(normalizeAvailabilityBlocksToSegments(raw, "UTC")).toHaveLength(0);
  });
});

describe("availabilitySegmentToTimeBlock", () => {
  it("maps a staff_unavailability segment to correct kind", () => {
    const seg = {
      id: "s1",
      date: "2026-05-08",
      start_time: "08:00",
      end_time: "09:00",
      team_member_id: "staff1",
      location_id: null,
      block_type: "unavailable" as const,
      _source: "staff_unavailability" as const,
    };
    const block = availabilitySegmentToTimeBlock(seg);
    expect(block.calendar_overlay_kind).toBe("staff_off");
  });
});
