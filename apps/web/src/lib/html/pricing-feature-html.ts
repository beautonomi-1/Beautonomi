import DOMPurify from "isomorphic-dompurify";
import { isBlankHtmlContent, stripHtmlToPlainText } from "./pricing-feature-html-shared";

export { isBlankHtmlContent, stripHtmlToPlainText };

/** Rich bullets for `pricing_plan_features.feature_text` (Quill / admin WYSIWYG output). */
const PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
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
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
  ALLOW_DATA_ATTR: false,
};

export function sanitizePricingFeatureHtml(raw: string): string {
  return DOMPurify.sanitize(raw ?? "", PURIFY_CONFIG);
}
