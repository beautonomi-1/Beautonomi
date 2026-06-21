/**
 * Marketing campaign merge tags (mobile mirror of the web send-side logic in
 * `apps/web/src/lib/marketing/merge-tags.ts`). Kept byte-compatible so a
 * provider's in-app preview matches exactly what the server substitutes on send.
 */

export interface MergeTagValues {
  customer_name?: string | null;
  first_name?: string | null;
  business_name?: string | null;
}

export interface MergeTagDef {
  tag: string;
  label: string;
  sample: string;
}

export const CAMPAIGN_MERGE_TAGS: MergeTagDef[] = [
  { tag: "{{customer_name}}", label: "Customer name", sample: "Thandi Mokoena" },
  { tag: "{{first_name}}", label: "First name", sample: "Thandi" },
  { tag: "{{business_name}}", label: "Your business name", sample: "Glow Studio" },
];

function firstNameOf(fullName?: string | null): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

/** Replace `{{tag}}` tokens. Unknown tokens are left untouched (typos stay visible). */
export function substituteMergeTags(template: string, values: MergeTagValues): string {
  if (!template) return template ?? "";
  const fullName = (values.customer_name ?? "").trim();
  const customerName = fullName || "there";
  const firstName = (values.first_name ?? "").trim() || firstNameOf(fullName);
  const businessName = (values.business_name ?? "").trim() || "your salon";

  return template
    .replace(/\{\{\s*customer_name\s*\}\}/gi, customerName)
    .replace(/\{\{\s*name\s*\}\}/gi, customerName)
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*business_name\s*\}\}/gi, businessName);
}

export const MERGE_TAG_PREVIEW_SAMPLE: MergeTagValues = {
  customer_name: "Thandi Mokoena",
  first_name: "Thandi",
  business_name: "Glow Studio",
};
