export type StreamAssistantReplyOptions = {
  streamUrl: string;
  message: string;
  onAssistantChunk: (text: string) => void;
  fetchFn?: typeof fetch;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
};

type ApiEnvelope = {
  data?: { assistantMessage?: unknown; handoff?: boolean; alreadyAnswered?: boolean } | null;
  error?: { message?: string; code?: string } | null;
};

/** POST to assistant stream endpoint; returns true when body was streamed as text/plain. */
export async function streamAssistantReply(options: StreamAssistantReplyOptions): Promise<{
  streamed: boolean;
  ok: boolean;
  handoff?: boolean;
  alreadyAnswered?: boolean;
  errorMessage?: string;
  errorCode?: string;
  infoMessage?: string;
}> {
  const fetchFn = options.fetchFn ?? fetch;
  const res = await fetchFn(options.streamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: options.headers ? undefined : "include",
    body: JSON.stringify({
      message: options.message,
      ...options.body,
    }),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (res.ok && contentType.includes("text/plain")) {
    const body = res.body;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        options.onAssistantChunk(accumulated);
      }
      return { streamed: true, ok: true };
    }
    const text = await res.text();
    if (text) options.onAssistantChunk(text);
    return { streamed: Boolean(text), ok: true };
  }

  const json = (await res.json().catch(() => ({}))) as ApiEnvelope;
  if (json.error?.message) {
    const handoff =
      res.ok &&
      (json.error.code === "LOCALE_ESCALATION" ||
        json.error.code === "RATE_LIMIT" ||
        json.error.code === "ASSISTANT_DISABLED" ||
        json.error.code === "AGENT_INACTIVE" ||
        json.error.code === "AGENT_MISSING" ||
        Boolean((json.data as { handoff?: boolean } | null)?.handoff));
    return {
      streamed: false,
      ok: handoff,
      handoff,
      infoMessage: handoff ? json.error.message : undefined,
      errorMessage: handoff ? undefined : json.error.message,
      errorCode: handoff ? undefined : json.error.code,
    };
  }

  if (res.ok && json.data?.alreadyAnswered) {
    return { streamed: false, ok: true, alreadyAnswered: true };
  }

  if (res.ok && (json.data?.assistantMessage || json.data?.handoff)) {
    return {
      streamed: false,
      ok: true,
      handoff: Boolean(json.data.handoff),
      infoMessage: json.data.handoff ? "Connecting you to support." : undefined,
    };
  }

  if (!res.ok) {
    return {
      streamed: false,
      ok: false,
      errorMessage: json.error?.message ?? "Assistant unavailable",
      errorCode: json.error?.code,
    };
  }

  return { streamed: false, ok: true };
}
