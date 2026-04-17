import sanitizeHtml from "sanitize-html";

/** Same allowlist as pricing/marketing HTML — safe for public CMS page copy. */
const CMS_PAGE_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "a",
    "ul",
    "ol",
    "li",
    "span",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "sub",
    "sup",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "title"],
    "*": ["class", "style"],
  },
  disallowedTagsMode: "discard",
};

export function sanitizeCmsPageHtml(raw: string): string {
  return sanitizeHtml(raw ?? "", CMS_PAGE_SANITIZE);
}

/** Heuristic: treat as HTML when tags are present (matches legacy `.includes('<')` checks). */
export function cmsContentLooksLikeHtml(raw: string): boolean {
  return /<[a-z][\s\S]*>/i.test(raw);
}
