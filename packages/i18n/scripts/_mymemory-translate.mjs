/**
 * MyMemory machine translation (fallback when Google Translate HTML-blocks requests).
 */

const BRANDS = [
  "Beautonomi",
  "Paystack",
  "Yoco",
  "WhatsApp",
  "Apple",
  "Google",
  "Instagram",
  "Facebook",
  "Mailchimp",
  "Stripe",
  "Mapbox",
  "Twilio",
];

export function lockTokens(text) {
  const locks = [];
  const lock = (t) => {
    locks.push(t);
    return `\uE000${locks.length - 1}\uE001`;
  };
  let out = text;
  out = out.replace(/\n/g, () => lock("\n"));
  out = out.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const t of BRANDS.sort((a, b) => b.length - a.length)) {
    if (t && out.includes(t)) out = out.split(t).join(lock(t));
  }
  return { out, locks };
}

export function unlock(text, locks) {
  return text.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
}

export function myMemoryLang(locale) {
  if (locale === "pt" || locale === "pt-BR") return "pt";
  if (locale === "es" || locale === "es-MX") return "es";
  return locale.split("-")[0];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function myMemoryTranslate(text, locale, tries = 5) {
  const tl = myMemoryLang(locale);
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=en|" +
    encodeURIComponent(tl);
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (res.status === 429) {
        await sleep(5000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const out = data?.responseData?.translatedText;
      if (typeof out !== "string" || !out.trim()) throw new Error("empty");
      if (/MYMEMORY WARNING/i.test(out)) return null;
      return out;
    } catch {
      await sleep(800 * (i + 1));
    }
  }
  return null;
}

export async function translatePhrase(en, locale, delayMs = 320) {
  const { out, locks } = lockTokens(en);
  if (!out.trim()) return en;
  const tr = await myMemoryTranslate(out, locale);
  await sleep(delayMs);
  if (!tr) return null;
  return unlock(tr, locks);
}
