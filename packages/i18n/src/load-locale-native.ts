/**
 * Metro/Expo locale importer. Keep this file out of the web client graph.
 */
const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  af: () => import("./locales/af.json"),
  zu: () => import("./locales/zu.json"),
  xh: () => import("./locales/xh.json"),
  st: () => import("./locales/st.json"),
  nso: () => import("./locales/nso.json"),
  tn: () => import("./locales/tn.json"),
  ts: () => import("./locales/ts.json"),
  ve: () => import("./locales/ve.json"),
  ss: () => import("./locales/ss.json"),
  fr: () => import("./locales/fr.json"),
  ar: () => import("./locales/ar.json"),
  sw: () => import("./locales/sw.json"),
  pt: () => import("./locales/pt.json"),
  "pt-BR": () => import("./locales/pt-BR.json"),
  es: () => import("./locales/es.json"),
  "es-MX": () => import("./locales/es-MX.json"),
  de: () => import("./locales/de.json"),
  hi: () => import("./locales/hi.json"),
  id: () => import("./locales/id.json"),
  tr: () => import("./locales/tr.json"),
  am: () => import("./locales/am.json"),
  rw: () => import("./locales/rw.json"),
  nl: () => import("./locales/nl.json"),
  it: () => import("./locales/it.json"),
};

export async function loadNativeLocaleMessages(code: string): Promise<Record<string, unknown>> {
  const loader = LOADERS[code];
  if (!loader) return {};
  const mod = await loader();
  return (mod.default ?? mod) as Record<string, unknown>;
}
