/**
 * ESLint rule: perf/require-auth-on-route
 *
 * Enforces that every API route handler under `src/app/api/**` references one of the
 * platform auth guards. Prevents accidental shipping of unauthenticated admin/provider
 * endpoints (F6 in the remediation plan).
 *
 * Allow-listed prefixes (no guard required):
 *   - /api/public/**              public marketing + unauth read endpoints
 *   - /api/webhooks/**            third-party webhooks (verify signature instead)
 *   - /api/payments/webhook       canonical Paystack webhook
 *   - /api/cron/**                Vercel cron endpoints (verify cron secret)
 *   - /api/health                 liveness probe
 *   - /api/sentry-test            Sentry diagnostics
 *   - /api/auth/sign-in           proxy sign-in (rate limited)
 *   - /api/auth/sign-out          proxy sign-out
 *   - /api/auth/mfa-policy        unauthenticated MFA policy lookup
 *   - /api/mapbox/distance/route   local haversine — no paid Mapbox API call, no auth needed
 *                                  All other /api/mapbox/** routes require optionalAuthInApi + rate limit
 *   - /api/i18n/**                public translations bundle
 *   - /api/feature-flags/check    public flag evaluation
 *   - /api/permissions/**         role-permission introspection
 *   - /api/retention/**           token-validated retention links
 *   - /api/location/validate      public location sanity check
 *   - /api/services               public service catalog read
 *   - /api/availability           public availability read
 *   - /api/search/**              public search endpoints
 *   - /api/explore/events         public analytics beacon (rate limited)
 *   - /api/promotions/validate    public promotion-code validation
 *   - /api/bookings/at-home/**    public distance/availability checks
 *   - /api/custom-fields/**       RLS-protected read (authenticated Supabase client)
 *   - /api/provider/yoco/webhook  Yoco webhook (HMAC signature)
 *   - /api/provider/paycloud/webhook  PayCloud webhook (RSA2 signature)
 *
 * Accepted guard references (case sensitive):
 *   requireRoleInApi, requireAuthInApi, optionalAuthInApi, requireRole, requireAdminSection,
 *   requireAdminSectionAny, requireSuperadmin, requireSuperadminPlatform,
 *   requirePermission, requirePublicTenant, validatePortalToken, usePortalToken,
 *   checkPortalRateLimit, verifyEmbedRefreshToken, parseRetentionToken,
 *   verifyCronSecret, verifyWebhookSignature, verifyPaystackSignature,
 *   verifyCronRequest, requireTerminalMerchantAdmin.
 *
 * Additional inline patterns (text match): `auth.getUser`, `auth.getSession`,
 * `Bearer ${cronSecret}`, and explicit HMAC signature verification via the
 * `crypto.timingSafeEqual` + `createHmac` idiom.
 */
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

const GUARD_IDENTIFIERS = new Set([
  "requireRoleInApi",
  "requireAuthInApi",
  "optionalAuthInApi",
  "requireRole",
  "requireAdminSection",
  "requireAdminSectionAny",
  "requireSuperadmin",
  "requireSuperadminPlatform",
  "requirePermission",
  "requirePublicTenant",
  "validatePortalToken",
  "usePortalToken",
  "checkPortalRateLimit",
  "verifyEmbedRefreshToken",
  "parseRetentionToken",
  "parseReceiptDownloadToken",
  "decodeCalendarOAuthState",
  "getProviderDashboardResponse",
  "createConversation",
  "verifyCronSecret",
  "verifyCronRequest",
  "verifyWebhookSignature",
  "verifyPaycloudWebhookSignature",
  "verifyPaystackSignature",
  "requireTerminalMerchantAdmin",
]);

/**
 * Extra textual hints that indicate inline auth was performed. These are used
 * as a complement to the guard identifier list for routes that authenticate
 * via `supabase.auth.getUser()` directly, check a `Bearer ${cronSecret}`
 * header, or verify a webhook signature with `crypto.timingSafeEqual`.
 */
const INLINE_AUTH_PATTERNS = [
  /\bauth\.getUser\s*\(/,
  /\bauth\.getSession\s*\(/,
  /Bearer\s+\$\{\s*cronSecret\s*\}/,
  /crypto\.timingSafeEqual\s*\(/,
];

const ALLOW_LIST_PREFIXES = [
  "src/app/api/public/",
  "src/app/api/webhooks/",
  "src/app/api/payments/webhook",
  "src/app/api/payments/stripe/webhook",
  "src/app/api/cron/",
  "src/app/api/health",
  "src/app/api/sentry-test",
  "src/app/api/auth/sign-in",
  "src/app/api/auth/sign-out",
  "src/app/api/auth/mfa-policy",
  "src/app/api/mapbox/distance/route", // local haversine — no paid API, no auth needed
  "src/app/api/i18n/",
  "src/app/api/feature-flags/check",
  "src/app/api/permissions/",
  "src/app/api/retention/",
  "src/app/api/location/validate",
  "src/app/api/services/route",
  "src/app/api/availability/route",
  "src/app/api/search/",
  "src/app/api/explore/events",
  "src/app/api/promotions/validate",
  "src/app/api/bookings/at-home/",
  "src/app/api/custom-fields/",
  "src/app/api/provider/yoco/webhook",
  "src/app/api/provider/paycloud/webhook",
  "src/app/api/provider/calendar/links/",
  "src/app/api/provider/calendar/providers",
  "src/app/api/provider/reference-data",
  "src/app/api/staff/",
];

function normalize(fp) {
  return fp.replace(/\\/g, "/");
}

function isRoute(filename) {
  return /src\/app\/api\/.*\/route\.(ts|tsx|js|jsx)$/.test(filename);
}

function isAllowListed(filename) {
  return ALLOW_LIST_PREFIXES.some((prefix) => filename.includes(prefix));
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require that every API route handler references one of the platform auth guards.",
    },
    messages: {
      missingGuard:
        "Route handler {{method}} in {{route}} never references an auth guard " +
        "(requireRoleInApi / requireAuthInApi / optionalAuthInApi / requireRole / requireAdminSection / " +
        "verifyCronSecret / verifyWebhookSignature). If this endpoint is intentionally " +
        "public, move it under /api/public/** or /api/webhooks/** or /api/cron/**, " +
        "whichever applies.",
    },
    schema: [],
  },
  create(context) {
    const filename = normalize(context.filename || context.getFilename() || "");
    if (!isRoute(filename) || isAllowListed(filename)) return {};

    const sourceCode = context.sourceCode || context.getSourceCode();
    const fullText = sourceCode.text;

    // Cheap guard: if none of the guard identifiers appear anywhere in the file, flag every
    // exported handler in the file. Avoids complex call-graph analysis.
    const hasAnyGuard = [...GUARD_IDENTIFIERS].some((id) =>
      new RegExp(`\\b${id}\\b`).test(fullText),
    );

    if (hasAnyGuard) return {};

    // Second-chance: inline auth patterns (supabase.auth.getUser, HMAC signature
    // verification via crypto.timingSafeEqual, Bearer ${cronSecret} check).
    const hasInlineAuth = INLINE_AUTH_PATTERNS.some((re) => re.test(fullText));
    if (hasInlineAuth) return {};

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;
        if (decl.type === "FunctionDeclaration" && HTTP_METHODS.has(decl.id?.name ?? "")) {
          context.report({
            node: decl,
            messageId: "missingGuard",
            data: { method: decl.id.name, route: filename },
          });
        }
        if (decl.type === "VariableDeclaration") {
          for (const v of decl.declarations) {
            if (v.id.type === "Identifier" && HTTP_METHODS.has(v.id.name)) {
              context.report({
                node: v,
                messageId: "missingGuard",
                data: { method: v.id.name, route: filename },
              });
            }
          }
        }
      },
    };
  },
};
