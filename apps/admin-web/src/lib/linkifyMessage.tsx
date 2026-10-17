const URL_RE = /https:\/\/[^\s<]+/gi;

export function LinkifiedMessageText({ text }: { text: string }) {
  const parts: Array<{ type: "text" | "link"; value: string }> = [];
  let lastIndex = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const url = match[0];
    if (!/^javascript:/i.test(url) && !/^data:/i.test(url)) {
      parts.push({ type: "link", value: url });
    } else {
      parts.push({ type: "text", value: url });
    }
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  const nodes = parts.length ? parts : [{ type: "text" as const, value: text }];
  return (
    <>
      {nodes.map((p, i) =>
        p.type === "link" ? (
          <a key={`${i}-l`} href={p.value} target="_blank" rel="noopener noreferrer" className="underline break-all">
            {p.value}
          </a>
        ) : (
          <span key={`${i}-t`}>{p.value}</span>
        ),
      )}
    </>
  );
}
