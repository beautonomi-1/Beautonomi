import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";

describe("nextRealtimeTopic", () => {
  it("returns monotonic suffixes per prefix across calls", () => {
    const prefix = "provider-nav-counts:test-provider";
    expect(nextRealtimeTopic(prefix)).toBe(`${prefix}:1`);
    expect(nextRealtimeTopic(prefix)).toBe(`${prefix}:2`);
    expect(nextRealtimeTopic("other")).toBe("other:1");
    expect(nextRealtimeTopic(prefix)).toBe(`${prefix}:3`);
  });
});
