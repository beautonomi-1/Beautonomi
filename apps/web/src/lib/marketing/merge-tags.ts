/**
 * Marketing campaign merge tags.
 *
 * Shared between the provider campaign editor/preview (client) and the campaign
 * send route (server) so what a provider previews is exactly what is sent.
 * Blasts have no per-booking context, so tags are limited to recipient identity
 * and the sending business.
 */

export type MergeTagValues = {
  /** Recipient full name (falls back to "there" when unknown). */
  customer_name?: string | null;
  /** Recipient first name only. */
  first_name?: string | null;
  /** Sending provider's business/display name. */
  business_name?: string | null;
};

export type MergeTagDef = {
  tag: string;
  label: string;
  sample: string;
};

/** Tags offered in the editor's "Insert" menu and applied on send. */
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

/**
 * Replace `{{tag}}` tokens in a template. Unknown tokens are left untouched so
 * provider typos are visible rather than silently blanked.
 */
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

/** Sample values used for live preview in the editor. */
export const MERGE_TAG_PREVIEW_SAMPLE: MergeTagValues = {
  customer_name: "Thandi Mokoena",
  first_name: "Thandi",
  business_name: "Glow Studio",
};
