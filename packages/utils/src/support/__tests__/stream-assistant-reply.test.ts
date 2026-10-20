import { describe, expect, it, vi } from "vitest";
import { streamAssistantReply } from "../stream-assistant-reply";

describe("streamAssistantReply", () => {
  it("streams chunked text/plain via getReader", async () => {
    const chunks = ["Hel", "lo ", "world"];
    let readIndex = 0;
    const fetchFn = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "text/plain; charset=utf-8" },
      body: {
        getReader: () => ({
          read: async () => {
            if (readIndex >= chunks.length) return { done: true, value: undefined };
            const value = new TextEncoder().encode(chunks[readIndex++]);
            return { done: false, value };
          },
        }),
      },
    }));

    const seen: string[] = [];
    const result = await streamAssistantReply({
      streamUrl: "/stream",
      message: "hi",
      fetchFn: fetchFn as unknown as typeof fetch,
      onAssistantChunk: (text) => seen.push(text),
    });

    expect(result).toEqual({ streamed: true, ok: true });
    expect(seen[seen.length - 1]).toBe("Hello world");
  });

  it("falls back to res.text when getReader is missing", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "text/plain" },
      body: {},
      text: async () => "Full reply",
    }));

    let text = "";
    const result = await streamAssistantReply({
      streamUrl: "/stream",
      message: "hi",
      fetchFn: fetchFn as unknown as typeof fetch,
      onAssistantChunk: (chunk) => {
        text = chunk;
      },
    });

    expect(result.streamed).toBe(true);
    expect(text).toBe("Full reply");
  });

  it("treats JSON handoff as ok with infoMessage", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        error: { message: "Connecting you to support.", code: "ASSISTANT_DISABLED" },
      }),
    }));

    const result = await streamAssistantReply({
      streamUrl: "/stream",
      message: "hi",
      fetchFn: fetchFn as unknown as typeof fetch,
      onAssistantChunk: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.handoff).toBe(true);
    expect(result.infoMessage).toContain("support");
  });

  it("returns error for non-handoff JSON failures", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      headers: { get: () => "application/json" },
      json: async () => ({
        error: { message: "Bad request", code: "VALIDATION_ERROR" },
      }),
    }));

    const result = await streamAssistantReply({
      streamUrl: "/stream",
      message: "",
      fetchFn: fetchFn as unknown as typeof fetch,
      onAssistantChunk: () => {},
    });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("Bad request");
  });

  it("reports handoff when the reply was saved as a human message", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ data: { message: { id: "m1" }, handoff: true } }),
    }));

    const result = await streamAssistantReply({
      streamUrl: "/stream",
      message: "hi",
      fetchFn: fetchFn as unknown as typeof fetch,
      onAssistantChunk: () => {},
    });

    expect(result).toEqual({
      streamed: false,
      ok: true,
      handoff: true,
      infoMessage: "Connecting you to support.",
    });
  });

  it("exposes the error code for IN_FLIGHT", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      headers: { get: () => "application/json" },
      json: async () => ({ error: { message: "Please wait for the current reply.", code: "IN_FLIGHT" } }),
    }));

    const result = await streamAssistantReply({
      streamUrl: "/stream",
      message: "",
      body: { mode: "initial" },
      fetchFn: fetchFn as unknown as typeof fetch,
      onAssistantChunk: () => {},
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("IN_FLIGHT");
  });

  it("returns alreadyAnswered for initial stream JSON", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ data: { alreadyAnswered: true } }),
    }));

    const result = await streamAssistantReply({
      streamUrl: "/stream",
      message: "hi",
      body: { mode: "initial" },
      fetchFn: fetchFn as unknown as typeof fetch,
      onAssistantChunk: () => {},
    });

    expect(result.ok).toBe(true);
    expect(result.alreadyAnswered).toBe(true);
  });
});
