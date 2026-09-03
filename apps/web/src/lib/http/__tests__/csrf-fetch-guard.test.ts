import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldAttachCsrfHeader } from "@/lib/http/csrf-fetch-guard";

const ORIGIN = "http://localhost:3000";

describe("shouldAttachCsrfHeader", () => {
  it("attaches on same-origin customer API mutations", () => {
    expect(shouldAttachCsrfHeader("/api/me/profile", { method: "PATCH" }, ORIGIN)).toBe(true);
    expect(shouldAttachCsrfHeader("/api/me/support-tickets", { method: "POST" }, ORIGIN)).toBe(true);
    expect(shouldAttachCsrfHeader("/api/public/waitlist", { method: "POST" }, ORIGIN)).toBe(true);
    expect(shouldAttachCsrfHeader("/api/public/gift-cards/claim", { method: "POST" }, ORIGIN)).toBe(true);
    expect(shouldAttachCsrfHeader("/api/me/support-tickets/1/upload", { method: "POST" }, ORIGIN)).toBe(true);
  });

  it("skips GET and Bearer (customer mobile) requests", () => {
    expect(shouldAttachCsrfHeader("/api/me/profile", { method: "GET" }, ORIGIN)).toBe(false);
    expect(
      shouldAttachCsrfHeader(
        "/api/me/profile",
        { method: "PATCH", headers: { Authorization: "Bearer mobile-token" } },
        ORIGIN,
      ),
    ).toBe(false);
  });

  it("skips auth, webhooks, csrf prime, and cross-origin calls", () => {
    expect(shouldAttachCsrfHeader("/api/auth/sign-in", { method: "POST" }, ORIGIN)).toBe(false);
    expect(shouldAttachCsrfHeader("/api/webhooks/paystack", { method: "POST" }, ORIGIN)).toBe(false);
    expect(shouldAttachCsrfHeader("/api/csrf", { method: "POST" }, ORIGIN)).toBe(false);
    expect(shouldAttachCsrfHeader("https://evil.example/api/me/profile", { method: "POST" }, ORIGIN)).toBe(
      false,
    );
  });

  it("skips when the caller already set x-csrf-token", () => {
    expect(
      shouldAttachCsrfHeader(
        "/api/me/profile",
        { method: "PATCH", headers: { "x-csrf-token": "already" } },
        ORIGIN,
      ),
    ).toBe(false);
  });
});

describe("installCsrfFetchGuard", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    window.__bnCsrfFetchInstalled = undefined;
    window.__bnNativeFetch = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.fetch = originalFetch;
    window.__bnCsrfFetchInstalled = undefined;
    window.__bnNativeFetch = undefined;
    vi.resetModules();
  });

  it("injects x-csrf-token on raw customer fetch mutations", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    window.fetch = fetchMock as unknown as typeof fetch;

    const { installCsrfFetchGuard, setInMemoryCsrfToken } = await import("@/lib/http/csrf-fetch-guard");
    setInMemoryCsrfToken("test-csrf-token");
    installCsrfFetchGuard();

    await window.fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-csrf-token")).toBe("test-csrf-token");
  });

  it("injects x-csrf-token on FormData customer uploads", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    window.fetch = fetchMock as unknown as typeof fetch;

    const { installCsrfFetchGuard, setInMemoryCsrfToken } = await import("@/lib/http/csrf-fetch-guard");
    setInMemoryCsrfToken("test-csrf-token");
    installCsrfFetchGuard();

    const body = new FormData();
    body.append("files", new Blob(["x"]), "note.png");
    await window.fetch("/api/me/support-tickets/ticket-1/upload", { method: "POST", body });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("test-csrf-token");
  });
});
