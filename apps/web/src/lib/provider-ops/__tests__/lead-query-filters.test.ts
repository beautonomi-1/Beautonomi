import { describe, expect, it } from "vitest";
import {
  applyActiveLeadFilter,
  applyContactFilter,
  parseContactFilter,
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

describe("parseContactFilter", () => {
  it("defaults to all", () => {
    expect(parseContactFilter(new URLSearchParams(""))).toBe("all");
  });

  it("parses incomplete", () => {
    expect(parseContactFilter(new URLSearchParams("contact=incomplete"))).toBe("incomplete");
  });

  it("ignores invalid values", () => {
    expect(parseContactFilter(new URLSearchParams("contact=foo"))).toBe("all");
  });
});

describe("applyContactFilter", () => {
  function mockQuery() {
    const calls: string[] = [];
    const q = {
      is: (col: string, _val: null) => {
        calls.push(`is:${col}`);
        return q;
      },
      not: (col: string, op: string, _val: null) => {
        calls.push(`not:${col}:${op}`);
        return q;
      },
      neq: (col: string, val: string) => {
        calls.push(`neq:${col}:${val}`);
        return q;
      },
      or: (filters: string) => {
        calls.push(`or:${filters}`);
        return q;
      },
      calls,
    };
    return q;
  }

  it("passes through when contact is all", () => {
    const q = mockQuery();
    applyContactFilter(q, "all");
    expect(q.calls).toEqual([]);
  });

  it("filters incomplete contacts", () => {
    const q = mockQuery();
    applyContactFilter(q, "incomplete");
    expect(q.calls).toEqual(["or:phone_e164.is.null,phone_e164.eq.,email.is.null,email.eq."]);
  });

  it("filters complete contacts", () => {
    const q = mockQuery();
    applyContactFilter(q, "complete");
    expect(q.calls).toEqual([
      "not:phone_e164:is",
      "neq:phone_e164:",
      "not:email:is",
      "neq:email:",
    ]);
  });

  it("filters missing phone", () => {
    const q = mockQuery();
    applyContactFilter(q, "missing_phone");
    expect(q.calls).toEqual(["or:phone_e164.is.null,phone_e164.eq."]);
  });
});
