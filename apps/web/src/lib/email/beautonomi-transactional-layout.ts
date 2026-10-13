/**
 * Beautonomi transactional email shell (aligned with migrations 542 / 738).
 * Table-based, inline styles for email client compatibility.
 */

export const BEAUTONOMI_EMAIL_TOKENS = {
  pageBg: "#f8fafc",
  text: "#111827",
  muted: "#475569",
  label: "#6b7280",
  border: "#e5e7eb",
  headerBg: "#111827",
  headerSubtext: "#cbd5e1",
  accent: "#f9a8d4",
  footerBg: "#fdf2f8",
  footerText: "#9d174d",
  ctaBg: "#FF0077",
  cardMaxWidth: "640px",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
} as const;

export type TransactionalEmailDetailRow = {
  label: string;
  value: string;
  /** When false, skip bottom border on last row styling is handled by caller order */
};

export type RenderBeautonomiTransactionalEmailInput = {
  heroTitle: string;
  heroSubtitle?: string;
  preheader?: string;
  detailRows?: TransactionalEmailDetailRow[];
  bodyHtml?: string;
  cta?: { label: string; href: string };
  footerNote?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDetailRows(rows: TransactionalEmailDetailRow[]): string {
  if (rows.length === 0) return "";
  const inner = rows
    .map((row, i) => {
      const border =
        i < rows.length - 1 ? "border-bottom:1px solid #e5e7eb;" : "";
      return `<tr>
                    <td style="padding:18px 20px;${border}">
                      <p style="margin:0;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(row.label)}</p>
                      <p style="margin:6px 0 0;color:#111827;font-size:16px;font-weight:600;">${row.value}</p>
                    </td>
                  </tr>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
                  ${inner}
                </table>`;
}

export function renderBeautonomiTransactionalEmail(
  input: RenderBeautonomiTransactionalEmailInput,
): string {
  const t = BEAUTONOMI_EMAIL_TOKENS;
  const preheader = input.preheader?.trim()
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>`
    : "";
  const subtitle = input.heroSubtitle?.trim()
    ? `<p style="margin:10px 0 0;color:${t.headerSubtext};font-size:15px;">${escapeHtml(input.heroSubtitle)}</p>`
    : "";
  const details = input.detailRows?.length ? renderDetailRows(input.detailRows) : "";
  const bodyBlock = input.bodyHtml?.trim()
    ? `<div style="margin:${details ? "20px" : "0"} 0 0;color:${t.muted};font-size:14px;line-height:1.6;">${input.bodyHtml}</div>`
    : "";
  const cta =
    input.cta?.href?.trim() && input.cta.label?.trim()
      ? `<p style="text-align:center;margin:28px 0 4px;">
                  <a href="${escapeHtml(input.cta.href)}" style="display:inline-block;background:${t.ctaBg};color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">${escapeHtml(input.cta.label)}</a>
                </p>`
      : "";
  const footer =
    input.footerNote?.trim() ??
    "This is an automatically generated Beautonomi notification.";

  return `<!doctype html>
<html>
  <body style="margin:0;background:${t.pageBg};color:${t.text};font-family:${t.fontFamily};line-height:1.5;">
    ${preheader}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${t.pageBg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${t.cardMaxWidth};background:#ffffff;border:1px solid ${t.border};border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:${t.headerBg};padding:32px 32px 28px;">
                <p style="margin:0 0 10px;color:${t.accent};font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Beautonomi</p>
                <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.15;font-weight:700;">${escapeHtml(input.heroTitle)}</h1>
                ${subtitle}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                ${details}
                ${bodyBlock}
                ${cta}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:${t.footerBg};color:${t.footerText};font-size:12px;text-align:center;">
                ${escapeHtml(footer)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** True when HTML is already a full Beautonomi (or custom) document — skip runtime wrap. */
export function isFullDocumentEmailHtml(html: string): boolean {
  const trimmed = html.trim().toLowerCase();
  if (trimmed.startsWith("<!doctype")) return true;
  if (trimmed.includes('role="presentation"') && trimmed.includes("max-width:640px")) {
    return true;
  }
  return false;
}

export type MaybeWrapNotificationEmailMeta = {
  heroTitle: string;
  heroSubtitle?: string;
  preheader?: string;
  ctaHref?: string;
  ctaLabel?: string;
};

const DEFAULT_CTA_LABEL = "View in Beautonomi";

export function maybeWrapNotificationEmailHtml(
  emailBody: string,
  meta: MaybeWrapNotificationEmailMeta,
): string {
  const raw = emailBody?.trim() ?? "";
  if (!raw) return raw;
  if (isFullDocumentEmailHtml(raw)) return emailBody;

  const cta =
    meta.ctaHref?.trim() &&
    (meta.ctaHref.startsWith("http") || meta.ctaHref.startsWith("/"))
      ? {
          label: meta.ctaLabel?.trim() || DEFAULT_CTA_LABEL,
          href: meta.ctaHref.startsWith("/")
            ? meta.ctaHref
            : meta.ctaHref,
        }
      : undefined;

  return renderBeautonomiTransactionalEmail({
    heroTitle: meta.heroTitle.trim() || "Notification",
    heroSubtitle: meta.heroSubtitle,
    preheader: meta.preheader ?? meta.heroSubtitle,
    bodyHtml: raw,
    cta,
  });
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

export function htmlToPlainText(html: string): string {
  let s = html;
  s = s.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    const t = label.replace(/<[^>]+>/g, "").trim();
    return t ? `${t}: ${href}` : href;
  });
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<\/tr>/gi, "\n");
  s = s.replace(/<\/h[1-6]>/gi, "\n\n");
  s = s.replace(/<[^>]+>/g, "");
  for (const [ent, ch] of Object.entries(HTML_ENTITY_MAP)) {
    s = s.split(ent).join(ch);
  }
  s = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export type FinalizeTemplateEmailInput = {
  emailBody: string;
  emailSubject: string;
  ctaHref?: string;
  ctaLabel?: string;
};

export type FinalizeTemplateEmailResult = {
  html: string;
  text: string;
};

export function finalizeTemplateEmailHtml(
  input: FinalizeTemplateEmailInput,
): FinalizeTemplateEmailResult {
  const html = maybeWrapNotificationEmailHtml(input.emailBody, {
    heroTitle: input.emailSubject || "Beautonomi",
    preheader: input.emailSubject,
    ctaHref: input.ctaHref,
    ctaLabel: input.ctaLabel,
  });
  return {
    html,
    text: htmlToPlainText(html),
  };
}
