import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIdentityVerification, type LegalDetails } from "@/hooks/useIdentityVerification";

const VALID_LEGAL: LegalDetails = {
  firstName: "John",
  lastName: "Doe",
  dateOfBirth: "1990-05-15",
  country: "ZA",
};

function statusResponse(status: string) {
  return {
    ok: true,
    json: async () => ({ data: { status }, error: null }),
  } as Response;
}

function sessionResponse(body: {
  url: string;
  session_token: string;
  is_existing?: boolean;
}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: body, error: null }),
  } as Response;
}

describe("useIdentityVerification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unwraps status from { data: { status } } envelope on initial load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(statusResponse("approved")),
    );

    const { result } = renderHook(() =>
      useIdentityVerification({ persona: "provider" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status).toBe("approved");
  });

  it("unwraps session url and token from { data } envelope on startVerification", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse("not_started"))
      .mockResolvedValueOnce(
        sessionResponse({
          url: "https://verify.didit.me/session/abc",
          session_token: "abc",
          is_existing: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useIdentityVerification({ persona: "provider" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setLegalDetails(VALID_LEGAL);
    });

    await act(async () => {
      await result.current.startVerification();
    });

    expect(result.current.sessionUrl).toBe("https://verify.didit.me/session/abc");
    expect(result.current.sessionToken).toBe("abc");
    expect(result.current.isExisting).toBe(false);
    expect(result.current.launchNonce).toBe(1);
  });

  it("refetches status on 409 already approved", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse("not_started"))
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          data: null,
          error: { message: "Already approved", code: "ALREADY_APPROVED" },
        }),
      } as Response)
      .mockResolvedValueOnce(statusResponse("approved"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useIdentityVerification({ persona: "customer" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setLegalDetails(VALID_LEGAL);
    });

    await act(async () => {
      await result.current.startVerification();
    });

    expect(result.current.status).toBe("approved");
    expect(result.current.sessionUrl).toBeNull();
    expect(result.current.launchNonce).toBe(0);
  });

  it("sets error on session create failure with DIDIT_SESSION_CREATE_FAILED", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse("not_started"))
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({
          data: null,
          error: {
            message: "Didit API 502: upstream error",
            code: "DIDIT_SESSION_CREATE_FAILED",
          },
        }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useIdentityVerification({ persona: "provider" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setLegalDetails(VALID_LEGAL);
    });

    await act(async () => {
      await result.current.startVerification();
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.sessionUrl).toBeNull();
    expect(result.current.launchNonce).toBe(0);
  });

  it("falls back to top-level status when envelope data is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "pending_review" }),
      } as Response),
    );

    const { result } = renderHook(() =>
      useIdentityVerification({ persona: "customer" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.status).toBe("pending_review");
  });

  it("falls back to top-level session fields when envelope data is absent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse("not_started"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          session_token: "legacy-tok",
          url: "https://verify.didit.me/session/legacy",
          is_existing: true,
        }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useIdentityVerification({ persona: "provider" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setLegalDetails(VALID_LEGAL);
    });

    await act(async () => {
      await result.current.startVerification();
    });

    expect(result.current.sessionUrl).toBe("https://verify.didit.me/session/legacy");
    expect(result.current.sessionToken).toBe("legacy-tok");
    expect(result.current.isExisting).toBe(true);
    expect(result.current.launchNonce).toBe(1);
  });

  it("increments launchNonce on each successful startVerification with the same url", async () => {
    const sameSession = sessionResponse({
      url: "https://verify.didit.me/session/reused",
      session_token: "reused",
      is_existing: true,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse("not_started"))
      .mockResolvedValueOnce(sameSession)
      .mockResolvedValueOnce(sameSession);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useIdentityVerification({ persona: "provider" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setLegalDetails(VALID_LEGAL);
    });

    await act(async () => {
      await result.current.startVerification();
    });
    expect(result.current.launchNonce).toBe(1);

    await act(async () => {
      await result.current.startVerification();
    });
    expect(result.current.launchNonce).toBe(2);
    expect(result.current.sessionUrl).toBe("https://verify.didit.me/session/reused");
  });
});
