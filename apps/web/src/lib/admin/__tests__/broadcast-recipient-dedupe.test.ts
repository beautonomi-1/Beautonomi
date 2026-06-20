import { describe, expect, it } from "vitest";
import { dedupeBroadcastUserIds } from "@/lib/admin/broadcast-recipient-resolution";

describe("dedupeBroadcastUserIds", () => {
  it("removes duplicate and empty ids", () => {
    const id = "11ccc539-9160-47be-b7b3-5fef986f1033";
    expect(dedupeBroadcastUserIds([id, id, id, id, "", "  "])).toEqual([id]);
  });
});
