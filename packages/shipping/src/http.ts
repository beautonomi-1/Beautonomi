export class ShippingHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

export async function shippingJsonRequest(params: {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 20_000);
  try {
    const res = await fetch(params.url, {
      method: params.method,
      headers: params.headers,
      body: params.body == null ? undefined : JSON.stringify(params.body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new ShippingHttpError(
        `Shipping API ${res.status}: ${text.slice(0, 400)}`,
        res.status,
        text,
      );
    }
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ShippingHttpError("Shipping API returned non-JSON", res.status, text);
    }
  } finally {
    clearTimeout(timer);
  }
}
