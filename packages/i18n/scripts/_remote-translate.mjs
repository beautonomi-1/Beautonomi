/**
 * Remote machine translation (@vitalets/google-translate-api, then fetch client=at, then MyMemory).
 */
import gt from "@vitalets/google-translate-api";
import { lockTokens, myMemoryLang, myMemoryTranslate, unlock } from "./_mymemory-translate.mjs";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function googleLang(locale) {
  if (locale === "pt" || locale === "pt-BR") return "pt";
  if (locale === "es" || locale === "es-MX") return "es";
  return locale.split("-")[0];
}

const GOOGLE_CLIENTS = ["at", "dict-chrome-ex", "gtx"];

async function vitaletsTranslate(text, locale) {
  const tl = googleLang(locale);
  try {
    const res = await gt.translate(text, { from: "en", to: tl });
    const out = res?.text;
    if (typeof out === "string" && out.trim() && !out.startsWith("<!DOCTYPE")) return out;
  } catch {
    /* rate limit / blocked */
  }
  return null;
}

async function googleTranslate(text, locale, tries = 3) {
  const tl = googleLang(locale);
  for (let i = 0; i < tries; i++) {
    const client = GOOGLE_CLIENTS[i % GOOGLE_CLIENTS.length];
    const url =
      "https://translate.googleapis.com/translate_a/single?client=" +
      client +
      "&sl=en&tl=" +
      encodeURIComponent(tl) +
      "&dt=t&q=" +
      encodeURIComponent(text);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.status === 429) {
        await sleep(3000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<html")) throw new Error("html");
      const data = JSON.parse(raw);
      const out = data?.[0]?.map((x) => x[0]).join("");
      if (typeof out !== "string" || !out.trim()) throw new Error("empty");
      if (out.startsWith("<!DOCTYPE") || out.startsWith("<html")) throw new Error("html");
      return out;
    } catch {
      await sleep(400 * (i + 1));
    }
  }
  return null;
}

export async function remoteTranslatePhrase(en, locale, delayMs = 80) {
  const { out, locks } = lockTokens(en);
  if (!out.trim()) return en;
  let tr = await vitaletsTranslate(out, locale);
  if (!tr) tr = await googleTranslate(out, locale);
  if (!tr) tr = await myMemoryTranslate(out, myMemoryLang(locale));
  await sleep(Math.max(delayMs, 3500));
  if (!tr) return null;
  return unlock(tr, locks);
}
