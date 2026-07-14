import { describe, expect, it } from "vitest";
import {
  applyActiveLeadFilter,
  parseDeletedFilter,
} from "@/lib/provider-ops/lead-query-filters";

describe("applyActiveLeadFilter", () => {
  function mockQuery() {
    const calls: string[] = [];
    const q = {
      is: (col: string, val: null) => {
        calls.push(`is:${col}`);
        return q;
      },
      not: (col: string, op: string, val: null) => {
        calls.push(`not:${col}:${op}`);
        return q;
      },
      calls,
    };
    return q;
  }

  it("filters active leads by default", () => {
    const q = mockQuery();
    applyActiveLeadFilter(q, "active");
    expect(q.calls).toEqual(["is:deleted_at"]);
  });

  it("filters deleted-only view", () => {
    const q = mockQuery();
    applyActiveLeadFilter(q, "deleted");
    expect(q.calls).toEqual(["not:deleted_at:is"]);
  });

  it("passes through all leads when mode is all", () => {
    const q = mockQuery();
    applyActiveLeadFilter(q, "all");
    expect(q.calls).toEqual([]);
  });
});

describe("parseDeletedFilter", () => {
  it("parses deleted=only", () => {
    const sp = new URLSearchParams("deleted=only");
    expect(parseDeletedFilter(sp)).toBe("deleted");
  });

  it("parses deleted=true", () => {
    const sp = new URLSearchParams("deleted=true");
    expect(parseDeletedFilter(sp)).toBe("deleted");
  });

  it("defaults to active", () => {
    const sp = new URLSearchParams("");
    expect(parseDeletedFilter(sp)).toBe("active");
  });
});
