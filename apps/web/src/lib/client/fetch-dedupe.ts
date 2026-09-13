/** In-flight dedupe for identical client fetches (helps React Strict Mode double-mount in dev). */
const inFlight = new Map<string, Promise<Response>>();

export function fetchDeduped(url: string, init?: RequestInit): Promise<Response> {
  const key = `${init?.method ?? "GET"} ${url}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = fetch(url, init).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}
