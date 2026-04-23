import { getApiErrorMessage, getHttpErrorStatus } from "@/lib/api-error";

describe("getApiErrorMessage", () => {
  it("returns fallback for nullish", () => {
    expect(getApiErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });

  it("returns trimmed string", () => {
    expect(getApiErrorMessage("  x  ")).toBe("x");
  });

  it("uses Error message", () => {
    expect(getApiErrorMessage(new Error("bad"))).toBe("bad");
  });
});

describe("getHttpErrorStatus", () => {
  it("returns undefined for non-objects", () => {
    expect(getHttpErrorStatus(undefined)).toBeUndefined();
  });

  it("reads status", () => {
    expect(getHttpErrorStatus({ status: 401 })).toBe(401);
  });

  it("reads statusCode when status missing", () => {
    expect(getHttpErrorStatus({ statusCode: 403 })).toBe(403);
  });

  it("prefers status when both set", () => {
    expect(getHttpErrorStatus({ status: 401, statusCode: 500 })).toBe(401);
  });
});
