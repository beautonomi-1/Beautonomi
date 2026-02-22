/**
 * Server-only Gemini API client.
 * API key must be passed from gemini_integration_config (never from env in this module).
 */

export interface CallGeminiParams {
  apiKey: string;
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  schema?: Record<string, unknown>;
}

export interface CallGeminiResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  success: boolean;
  errorCode?: string;
}

interface GeminiCandidatePart {
  text?: string;
}
interface GeminiCandidateContent {
  parts?: GeminiCandidatePart[];
}
interface GeminiCandidate {
  content?: GeminiCandidateContent;
}
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

/**
 * Call Gemini generateContent. Returns raw text and token counts.
 */
export async function callGemini(params: CallGeminiParams): Promise<CallGeminiResult> {
  const {
    apiKey,
    model,
    system = "",
    user,
    temperature = 0.3,
    maxTokens = 600,
  } = params;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };
  if (system) {
    body.system_instruction = { parts: [{ text: system }] };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      const _errMessage = (data as { error?: { message?: string } }).error?.message ?? res.statusText;
      return {
        text: "",
        tokensIn: 0,
        tokensOut: 0,
        success: false,
        errorCode: `GEMINI_${res.status}`,
      };
    }

    const payload = data as GeminiResponse;
    const candidates = payload.candidates;
    const candidate = candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const usage = payload.usageMetadata;
    const tokensIn = usage?.promptTokenCount ?? 0;
    const tokensOut = usage?.candidatesTokenCount ?? usage?.totalTokenCount ?? 0;

    return { text, tokensIn, tokensOut, success: true };
  } catch (err) {
    console.error("Gemini call error:", err);
    return {
      text: "",
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: "GEMINI_NETWORK",
    };
  }
}
