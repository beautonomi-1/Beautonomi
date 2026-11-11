import { describe, expect, it } from "vitest";
import {
  idempotencyBelongsToCaller,
  idempotencyConflictCachedResponse,
} from "../idempotency";

describe("idempotencyBelongsToCaller (F2-70)", () => {
  it("allows replay when the stored user matches the caller", () => {
    expect(idempotencyBelongsToCaller("user-a", "user-a")).toBe(true);
  });

  it("rejects replay when the stored user is a different principal", () => {
    expect(idempotencyBelongsToCaller("user-a", "user-b")).toBe(false);
  });

  it("rejects a signed-in row for an anonymous caller", () => {
    expect(idempotencyBelongsToCaller("user-a", null)).toBe(false);
    expect(idempotencyBelongsToCaller("user-a", undefined)).toBe(false);
  });

  it("allows anonymous rows for any caller (unguessable UUID key)", () => {
    expect(idempotencyBelongsToCaller(null, "user-a")).toBe(true);
    expect(idempotencyBelongsToCaller(null, null)).toBe(true);
    expect(idempotencyBelongsToCaller(undefined, undefined)).toBe(true);
  });
});

describe("idempotencyConflictCachedResponse (F2-70)", () => {
  it("returns 409 instead of a cached success body", async () => {
    const cached = idempotencyConflictCachedResponse();
    expect(cached.status).toBe(409);
    expect(cached.body).toEqual({
      success: false,
      error: {
        code: "IDEMPOTENCY_KEY_CONFLICT",
        message: "Idempotency key already used",
      },
    });
    const res = cached.toResponse();
    expect(res.status).toBe(409);
    expect(res.headers.get("Idempotent-Replay")).toBe("conflict");
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_CONFLICT" },
    });
  });
});
