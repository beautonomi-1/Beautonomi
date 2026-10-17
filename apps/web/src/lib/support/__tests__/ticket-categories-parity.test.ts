import { describe, expect, it } from "vitest";
import {
  SUPPORT_TICKET_CATEGORY_GROUPS,
  SUPPORT_TICKET_CATEGORY_VALUES,
} from "@/lib/support/ticket-categories";
import {
  SUPPORT_TICKET_CATEGORY_GROUPS as UTILS_GROUPS,
  SUPPORT_TICKET_CATEGORY_VALUES as UTILS_VALUES,
} from "@beautonomi/utils";

describe("web ticket-categories re-export parity", () => {
  it("matches @beautonomi/utils group count and values", () => {
    expect(SUPPORT_TICKET_CATEGORY_GROUPS.length).toBe(UTILS_GROUPS.length);
    expect([...SUPPORT_TICKET_CATEGORY_VALUES].sort()).toEqual([...UTILS_VALUES].sort());
  });
});
