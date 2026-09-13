import en from "./locales/en.json";
import enGBOverrides from "./locales/en-GB.json";
import enUSOverrides from "./locales/en-US.json";
import enAUOverrides from "./locales/en-AU.json";
import zu from "./locales/zu.json";
import af from "./locales/af.json";
import st from "./locales/st.json";
import xh from "./locales/xh.json";
import nso from "./locales/nso.json";
import tn from "./locales/tn.json";
import ts from "./locales/ts.json";
import ve from "./locales/ve.json";
import ss from "./locales/ss.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import sw from "./locales/sw.json";
import pt from "./locales/pt.json";
import ptBROverrides from "./locales/pt-BR.json";
import es from "./locales/es.json";
import esMXOverrides from "./locales/es-MX.json";
import de from "./locales/de.json";
import hi from "./locales/hi.json";
import id from "./locales/id.json";
import tr from "./locales/tr.json";
import am from "./locales/am.json";
import rw from "./locales/rw.json";
import nl from "./locales/nl.json";
import it from "./locales/it.json";
import { deepMerge } from "./deep-merge";

export { deepMerge };
export const defaultNS = "translation";

/** Full catalogs for server-side `getServerT`. Client bundles `resources-core` only. */
export const resources = {
  en: { translation: en },
  "en-GB": { translation: deepMerge(en as Record<string, unknown>, enGBOverrides as Record<string, unknown>) },
  "en-US": { translation: deepMerge(en as Record<string, unknown>, enUSOverrides as Record<string, unknown>) },
  "en-AU": { translation: deepMerge(en as Record<string, unknown>, enAUOverrides as Record<string, unknown>) },
  zu: { translation: zu },
  af: { translation: af },
  st: { translation: st },
  xh: { translation: xh },
  nso: { translation: nso },
  tn: { translation: tn },
  ts: { translation: ts },
  ve: { translation: ve },
  ss: { translation: ss },
  fr: { translation: fr },
  ar: { translation: ar },
  sw: { translation: sw },
  pt: { translation: pt },
  "pt-BR": { translation: deepMerge(pt as Record<string, unknown>, ptBROverrides as Record<string, unknown>) },
  es: { translation: es },
  "es-MX": { translation: deepMerge(es as Record<string, unknown>, esMXOverrides as Record<string, unknown>) },
  de: { translation: de },
  hi: { translation: hi },
  id: { translation: id },
  tr: { translation: tr },
  am: { translation: am },
  rw: { translation: rw },
  nl: { translation: nl },
  it: { translation: it },
} as const;

export type BundledLocaleCode = keyof typeof resources;
