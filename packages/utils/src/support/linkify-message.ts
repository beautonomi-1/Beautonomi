const URL_RE = /https:\/\/[^\s<]+/gi;
const BLOCKED_SCHEMES = /^(javascript|data):/i;

export type MessageLinkSegment = { type: "text" | "link"; value: string };

/** Split plain text into text and https link segments (safe for RN and web). */
export function splitMessageWithLinks(text: string): MessageLinkSegment[] {
  const parts: MessageLinkSegment[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const url = match[0];
    if (!BLOCKED_SCHEMES.test(url)) {
      parts.push({ type: "link", value: url });
    } else {
      parts.push({ type: "text", value: url });
    }
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts.length ? parts : [{ type: "text", value: text }];
}
