import { describe, it, expect } from "vitest";
import {
  QUEUE_PAYLOAD_META_KEY,
  parseQueuePayloadMeta,
} from "@/lib/notifications/enqueue";

describe("parseQueuePayloadMeta", () => {
  it("reads tenant_id and push_app_type from _queue_meta", () => {
    expect(
      parseQueuePayloadMeta({
        title: "x",
        [QUEUE_PAYLOAD_META_KEY]: {
          tenant_id: "tenant-uuid",
          push_app_type: "customer",
        },
      }),
    ).toEqual({
      tenant_id: "tenant-uuid",
      push_app_type: "customer",
    });
  });

  it("returns {} when meta missing", () => {
    expect(parseQueuePayloadMeta({ title: "x" })).toEqual({});
    expect(parseQueuePayloadMeta(null)).toEqual({});
  });

  it("ignores invalid push_app_type", () => {
    expect(
      parseQueuePayloadMeta({
        [QUEUE_PAYLOAD_META_KEY]: { push_app_type: "other" },
      }),
    ).toEqual({});
  });
});
