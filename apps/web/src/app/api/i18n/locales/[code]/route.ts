import { NextResponse } from "next/server";
import { isSupportedLanguageCode } from "@beautonomi/i18n";

export const dynamic = "force-static";

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  af: () => import("@beautonomi/i18n/locales/af.json"),
  zu: () => import("@beautonomi/i18n/locales/zu.json"),
  xh: () => import("@beautonomi/i18n/locales/xh.json"),
  st: () => import("@beautonomi/i18n/locales/st.json"),
  nso: () => import("@beautonomi/i18n/locales/nso.json"),
  tn: () => import("@beautonomi/i18n/locales/tn.json"),
  ts: () => import("@beautonomi/i18n/locales/ts.json"),
  ve: () => import("@beautonomi/i18n/locales/ve.json"),
  ss: () => import("@beautonomi/i18n/locales/ss.json"),
  fr: () => import("@beautonomi/i18n/locales/fr.json"),
  ar: () => import("@beautonomi/i18n/locales/ar.json"),
  sw: () => import("@beautonomi/i18n/locales/sw.json"),
  pt: () => import("@beautonomi/i18n/locales/pt.json"),
  "pt-BR": () => import("@beautonomi/i18n/locales/pt-BR.json"),
  es: () => import("@beautonomi/i18n/locales/es.json"),
  "es-MX": () => import("@beautonomi/i18n/locales/es-MX.json"),
  de: () => import("@beautonomi/i18n/locales/de.json"),
  hi: () => import("@beautonomi/i18n/locales/hi.json"),
  id: () => import("@beautonomi/i18n/locales/id.json"),
  tr: () => import("@beautonomi/i18n/locales/tr.json"),
  am: () => import("@beautonomi/i18n/locales/am.json"),
  rw: () => import("@beautonomi/i18n/locales/rw.json"),
  nl: () => import("@beautonomi/i18n/locales/nl.json"),
  it: () => import("@beautonomi/i18n/locales/it.json"),
  "en-GB": () => import("@beautonomi/i18n/locales/en-GB.json"),
  "en-US": () => import("@beautonomi/i18n/locales/en-US.json"),
  "en-AU": () => import("@beautonomi/i18n/locales/en-AU.json"),
};

/**
 * GET /api/i18n/locales/:code
 * Serves a locale catalog as JSON so the web client does not inline every language.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  if (!isSupportedLanguageCode(code) || code === "en") {
    return NextResponse.json({ error: "Unknown locale" }, { status: 404 });
  }
  const loader = LOADERS[code];
  if (!loader) {
    return NextResponse.json({ error: "Unknown locale" }, { status: 404 });
  }
  const mod = await loader();
  return NextResponse.json(mod.default ?? mod, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
