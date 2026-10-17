export type StreamAssistantReplyOptions = {
  streamUrl: string;
  message: string;
  onAssistantChunk: (text: string) => void;
};

type ApiEnvelope = {
  data?: { assistantMessage?: unknown; handoff?: boolean } | null;
  error?: { message?: string; code?: string } | null;
};

/** POST to assistant stream endpoint; returns true when body was streamed as text/plain. */
export async function streamAssistantReply(options: StreamAssistantReplyOptions): Promise<{
  streamed: boolean;
  ok: boolean;
  handoff?: boolean;
  errorMessage?: string;
  infoMessage?: string;
}> {
  const res = await fetch(options.streamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message: options.message }),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (res.ok && contentType.includes("text/plain") && res.body) {
    const reader = res.body.getReader();
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

  const json = (await res.json().catch(() => ({}))) as ApiEnvelope;
  if (json.error?.message) {
    const handoff =
      res.ok &&
      (json.error.code === "LOCALE_ESCALATION" ||
        json.error.code === "RATE_LIMIT" ||
        Boolean((json.data as { handoff?: boolean } | null)?.handoff));
    return {
      streamed: false,
      ok: handoff,
      handoff,
      infoMessage: json.error.message,
      errorMessage: handoff ? undefined : json.error.message,
    };
  }

  if (res.ok && json.data?.assistantMessage) {
    return { streamed: false, ok: true, handoff: json.data.handoff };
  }

  if (!res.ok) {
    return {
      streamed: false,
      ok: false,
      errorMessage: json.error?.message ?? "Assistant unavailable",
    };
  }

  return { streamed: false, ok: true };
}
