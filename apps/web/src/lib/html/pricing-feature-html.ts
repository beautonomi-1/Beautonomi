import sanitizeHtml from "sanitize-html";
import { isBlankHtmlContent, stripHtmlToPlainText } from "./pricing-feature-html-shared";

export { isBlankHtmlContent, stripHtmlToPlainText };

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
    "a", "ul", "ol", "li", "span", "div",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "sub", "sup",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    "*": ["class", "style"],
  },
  disallowedTagsMode: "discard",
};

export function sanitizePricingFeatureHtml(raw: string): string {
  return sanitizeHtml(raw ?? "", SANITIZE_OPTIONS);
}
