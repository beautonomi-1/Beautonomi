import { describe, expect, it } from "vitest";
import {
  applyProviderLeadListFilters,
  parseLeadListFilters,
} from "@/lib/provider-ops/lead-list-filters";

describe("parseLeadListFilters", () => {
  it("parses sla_breached flag", () => {
    const p = parseLeadListFilters(new URLSearchParams("sla_breached=1&stage=new"));
    expect(p.slaBreached).toBe(true);
    expect(p.stage).toBe("new");
  });
});

describe("applyProviderLeadListFilters", () => {
  it("applies sla id filter when provided", () => {
    const calls: string[] = [];
    const q = {
      is: () => q,
      eq: () => q,
      in: (col: string, vals: string[]) => {
        calls.push(`in:${col}:${vals.join(",")}`);
        return q;
      },
      or: () => q,
      not: () => q,
      neq: () => q,
    };
    applyProviderLeadListFilters(
      q,
      parseLeadListFilters(new URLSearchParams()),
      null,
      ["aaa-bbb"],
    );
    expect(calls.some((c) => c.startsWith("in:id:"))).toBe(true);
  });

  it("adds unscoped phone needles for national 0 search", () => {
    const orFilters: string[] = [];
    const q = {
      is: () => q,
      eq: () => q,
      in: () => q,
      or: (filters: string) => {
        orFilters.push(filters);
        return q;
      },
      not: () => q,
      neq: () => q,
    };
    applyProviderLeadListFilters(
      q,
      parseLeadListFilters(new URLSearchParams("search=0821234567")),
      null,
      null,
    );
    expect(orFilters.some((f) => f.includes("phone_e164.ilike.%821234567%"))).toBe(true);
  });

  it("omits stage when omitStage is set", () => {
    const q = {
      is: () => q,
      eq: (col: string, val: string) => {
        if (col === "commercial_stage") throw new Error("stage should be omitted");
        return q;
      },
      in: () => q,
      or: () => q,
      not: () => q,
      neq: () => q,
    };
    applyProviderLeadListFilters(
      q,
      parseLeadListFilters(new URLSearchParams("stage=won")),
      null,
      null,
      { omitStage: true },
    );
  });
});
