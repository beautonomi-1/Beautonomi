/**
 * Pre-submission validator for Twilio/Meta WhatsApp Content template approval.
 */

export type WhatsAppCategory = "authentication" | "utility" | "marketing";

export interface ApprovalReadinessInput {
  whatsapp_body?: string | null;
  whatsapp_category?: WhatsAppCategory | string | null;
  whatsapp_approval_name?: string | null;
  whatsapp_content_variables?: Array<{ ordinal?: number; var?: string; sample?: string }> | null;
  whatsapp_content_type?: string | null;
  title?: string | null;
  body?: string | null;
}

export interface ApprovalReadinessResult {
  fatal: string[];
  warnings: string[];
  score: number;
}

const PROMO_WORDS = /\b(sale|discount|offer|promo|buy now|limited time|free gift)\b/i;
const TRANSACTIONAL_WORDS = /\b(confirmed|reminder|appointment|booking|receipt|invoice|payment)\b/i;

function countOrdinals(body: string): number {
  const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
  const nums = matches.map((m) => parseInt(m.replace(/\D/g, ""), 10));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

function countNamedVars(body: string): string[] {
  const matches = body.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export function validateWhatsAppApprovalReadiness(
  input: ApprovalReadinessInput,
): ApprovalReadinessResult {
  const fatal: string[] = [];
  const warnings: string[] = [];

  const body = (input.whatsapp_body || input.body || "").trim();
  const category = (input.whatsapp_category || "utility") as WhatsAppCategory;
  const name = (input.whatsapp_approval_name || "").trim();
  const contentType = input.whatsapp_content_type || "twilio/text";

  if (!body) {
    fatal.push("WhatsApp message body is required.");
  }

  if (!name) {
    fatal.push("Twilio approval name is required.");
  } else if (!/^[a-z0-9_]+$/.test(name)) {
    fatal.push("Approval name must be lowercase alphanumeric and underscores only.");
  }

  if (body.length > 1024) {
    fatal.push("Body exceeds 1024 characters (WhatsApp limit).");
  }

  if (/\n{3,}/.test(body)) {
    warnings.push("Avoid multiple sequential line breaks; WhatsApp may reject.");
  }

  if (body === body.toUpperCase() && body.length > 20) {
    warnings.push("Avoid ALL-CAPS body text.");
  }

  if ((body.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? []).length > 5) {
    warnings.push("Excessive emojis may reduce approval odds.");
  }

  const ordinals = countOrdinals(body);
  const namedVars = countNamedVars(body);
  const varCount = ordinals || namedVars.length;

  if (varCount > 0) {
    const vars = input.whatsapp_content_variables ?? [];
    for (let i = 1; i <= varCount; i++) {
      const entry = vars.find((v) => v.ordinal === i) ?? vars[i - 1];
      const sample = entry?.sample?.trim();
      if (!sample) {
        fatal.push(`Sample value required for variable {{${i}}}.`);
      } else if (/^(test|xxx|sample|placeholder|foo|bar)$/i.test(sample)) {
        warnings.push(`Variable {{${i}}} sample looks placeholder-like; use realistic data.`);
      }
    }

    if (/^\{\{\d+\}\}/.test(body.trim())) {
      warnings.push("Avoid starting the body with a variable.");
    }
    if (/\{\{\d+\}\}$/.test(body.trim())) {
      warnings.push("Avoid ending the body with a variable.");
    }
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) {
      warnings.push("Avoid adjacent variables without separating text.");
    }
    if (/^\s*\{\{\d+\}\}\s*$/.test(body)) {
      fatal.push("Body cannot be variable-only.");
    }
  }

  if (category === "marketing") {
    if (!PROMO_WORDS.test(body) && TRANSACTIONAL_WORDS.test(body)) {
      warnings.push("Marketing category with transactional wording may be rejected; consider Utility.");
    }
    if (!/\b(unsubscribe|opt.?out|stop)\b/i.test(body)) {
      warnings.push("Marketing templates should mention opt-out (e.g. Reply STOP).");
    }
  }

  if (category === "utility") {
    if (PROMO_WORDS.test(body) && !TRANSACTIONAL_WORDS.test(body)) {
      warnings.push("Utility category with promotional language may be rejected; use Marketing.");
    }
  }

  if (category === "authentication" && contentType !== "twilio/authentication") {
    warnings.push("Authentication category should use twilio/authentication content type.");
  }

  if (/\b(whatsapp|meta)\b/i.test(body)) {
    warnings.push("Avoid mentioning WhatsApp or Meta in template body.");
  }

  if (/bit\.ly|tinyurl|goo\.gl/i.test(body)) {
    warnings.push("Avoid URL shorteners; use full URLs.");
  }

  const score = Math.max(
    0,
    100 - fatal.length * 25 - warnings.length * 5,
  );

  return { fatal, warnings, score };
}
