import { getApiErrorMessage, getHttpErrorStatus } from "@/lib/api-error";

describe("getApiErrorMessage", () => {
  it("returns fallback for nullish", () => {
    expect(getApiErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(getApiErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("returns trimmed string", () => {
    expect(getApiErrorMessage("  Network error  ")).toBe("Network error");
  });

  it("uses Error message", () => {
    expect(getApiErrorMessage(new Error("Bad request"))).toBe("Bad request");
  });

  it("uses custom fallback", () => {
    expect(getApiErrorMessage(null, "Try again")).toBe("Try again");
  });

  it("reads message from plain object", () => {
    expect(getApiErrorMessage({ message: "  x  " })).toBe("x");
  });
});

describe("getHttpErrorStatus", () => {
  it("returns undefined for non-objects", () => {
    expect(getHttpErrorStatus(null)).toBeUndefined();
    expect(getHttpErrorStatus("401")).toBeUndefined();
  });

  it("prefers status over statusCode when both present", () => {
    expect(getHttpErrorStatus({ status: 401, statusCode: 500 })).toBe(401);
  });

  it("reads statusCode when status missing", () => {
    expect(getHttpErrorStatus({ statusCode: 403 })).toBe(403);
  });

  it("ignores non-finite numbers", () => {
    expect(getHttpErrorStatus({ status: NaN })).toBeUndefined();
  });
});
