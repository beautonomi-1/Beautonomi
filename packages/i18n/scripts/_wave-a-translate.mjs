/**
 * Phrase-first Wave A translator: exact → punctuation variants → patterns → glossary.
 */
import { BRANDS, EXACT, LANGS } from "./_wave-a-engine.mjs";
import { EXTRA_EXACT, GLOSSARY } from "./_wave-a-lexicon.mjs";

const ALL_EXACT = new Map(EXACT);
for (const [en, row] of EXTRA_EXACT) ALL_EXACT.set(en, row);

export function isIdentity(s) {
  if (typeof s !== "string") return false;
  if (s === "" || s === "Beautonomi") return true;
  if (/^[\s\-—.·…,/:+*#&%<>[\]()0-9×=]+$/.test(s)) return true;
  if (/^\d{1,2}:\d{2}$/.test(s)) return true;
  if (/^[A-Z]{2} \+\d+$/.test(s)) return true;
  if (/^\+\d+\.\.\.$/.test(s)) return true;
  if (/^\.ics$/i.test(s)) return true;
  if (/^\/(mo|year|month|5)$/.test(s)) return true;
  if (/^(AM|PM|OK|QR|SMS|sms|EFT|SKU|CTR|GRP|MRR|UIF|VIP|UTC|PKG|EULA|TEST|HH:MM|Yoco|Didit|Apple|Google|Iris|Doe|John|X|W|R|WA|es|SID)$/.test(s)) {
    return true;
  }
  if (/^ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx$/.test(s)) return true;
  return false;
}

function extractVars(str) {
  const vars = new Set();
  for (const m of String(str).matchAll(/\{\{(\w+)\}\}/g)) vars.add(m[1]);
  return vars;
}

function restorePunct(src, dest) {
  if (!dest) return dest;
  let out = dest;
  if (/[.…]$/.test(src) && !/[.…]$/.test(out)) {
    out += src.endsWith("...") ? "..." : src.endsWith("…") ? "…" : src.endsWith(".") ? "." : "";
  }
  if (src.endsWith("?") && !out.endsWith("?")) out += "?";
  if (src.endsWith("!") && !out.endsWith("!")) out += "!";
  return out;
}

function lookupExact(en) {
  if (ALL_EXACT.has(en)) return ALL_EXACT.get(en);
  const trimmed = en.replace(/[\s]+$/g, "");
  if (trimmed !== en && ALL_EXACT.has(trimmed)) return ALL_EXACT.get(trimmed);
  const noEllipsis = en.replace(/[.…]+$/, "").trim();
  if (noEllipsis !== en && ALL_EXACT.has(noEllipsis)) return ALL_EXACT.get(noEllipsis);
  if (ALL_EXACT.has(`${noEllipsis}.`)) return ALL_EXACT.get(`${noEllipsis}.`);
  if (ALL_EXACT.has(`${noEllipsis}?`)) return ALL_EXACT.get(`${noEllipsis}?`);
  const lower = en.toLowerCase();
  if (lower !== en) {
    for (const [k, v] of ALL_EXACT) {
      if (k.toLowerCase() === lower) return v;
    }
  }
  return null;
}

const GLOSSARY_SORTED = [...GLOSSARY].sort((a, b) => b[0].length - a[0].length);

for (const [en, row] of ALL_EXACT) {
  if (en.includes("{{")) continue;
  if (en.length < 4 || en.length > 48) continue;
  if (/[.?!]/.test(en) && en.length > 24) continue;
  GLOSSARY_SORTED.push([en, row]);
}
GLOSSARY_SORTED.sort((a, b) => b[0].length - a[0].length);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyGlossary(en, locale) {
  const locks = [];
  const lock = (text) => {
    const i = locks.length;
    locks.push(text);
    return `\uE000${i}\uE001`;
  };
  let out = en.replace(/\{\{(\w+)\}\}/g, (m) => lock(m));
  for (const brand of BRANDS) {
    if (brand && out.includes(brand)) out = out.split(brand).join(lock(brand));
  }
  for (const [phrase, row] of GLOSSARY_SORTED) {
    const dest = row[locale];
    if (!dest || !phrase) continue;
    if (phrase.length <= 3) {
      const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, "g");
      if (re.test(out)) out = out.replace(new RegExp(`\\b${escapeRe(phrase)}\\b`, "g"), () => lock(dest));
      continue;
    }
    if (out.includes(phrase)) {
      out = out.split(phrase).join(lock(dest));
      continue;
    }
    const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, "gi");
    if (re.test(out)) out = out.replace(new RegExp(`\\b${escapeRe(phrase)}\\b`, "gi"), () => lock(dest));
  }
  out = out.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
  return out;
}

const WRAP = {
  failedTo: {
    pt: (x) => `Não foi possível ${x}`,
    es: (x) => `No se pudo ${x}`,
    af: (x) => `Kon nie ${x} nie`,
    zu: (x) => `Kwehlulekile ${/^uk[u-]/.test(x) ? x : `uku-${x}`}`,
    xh: (x) => `Kusilele ${/^uk[u-]/.test(x) ? x : `uku-${x}`}`,
    st: (x) => `E hlolehile ho ${x}`,
    nso: (x) => `E paletšwe go ${x}`,
    tn: (x) => `E reteletswe go ${x}`,
    ts: (x) => `Swi tsandzile ku ${x}`,
    ve: (x) => `Zwo kundelwa u ${x}`,
    ss: (x) => `Kwehlulekile ${/^ku-/.test(x) ? x : `ku-${x}`}`,
  },
  couldNot: {
    pt: (x) => `Não foi possível ${x}`,
    es: (x) => `No se pudo ${x}`,
    af: (x) => `Kon nie ${x} nie`,
    zu: (x) => `Ayikwazanga ${/^uk[u-]/.test(x) ? x : `uku-${x}`}`,
    xh: (x) => `Ayikwazanga ${/^uk[u-]/.test(x) ? x : `uku-${x}`}`,
    st: (x) => `Ha e a khona ho ${x}`,
    nso: (x) => `Ga e kgona go ${x}`,
    tn: (x) => `Ga e kgona go ${x}`,
    ts: (x) => `A swi koteki ku ${x}`,
    ve: (x) => `A zwo koni u ${x}`,
    ss: (x) => `Ayikhonanga ${/^ku-/.test(x) ? x : `ku-${x}`}`,
  },
  please: {
    pt: (x) => `Por favor, ${x}`,
    es: (x) => `${x.charAt(0).toUpperCase()}${x.slice(1)}`,
    af: (x) => `${x.charAt(0).toUpperCase()}${x.slice(1)} asseblief`,
    zu: (x) => `Sicela ${x}`,
    xh: (x) => `Nceda ${x}`,
    st: (x) => `Ka kopo ${x}`,
    nso: (x) => `Hle ${x}`,
    tn: (x) => `Tsweetswee ${x}`,
    ts: (x) => `${x.charAt(0).toUpperCase()}${x.slice(1)}`,
    ve: (x) => `${x.charAt(0).toUpperCase()}${x.slice(1)}`,
    ss: (x) => `Sicela ${x}`,
  },
  noYet: {
    pt: (x) => `Ainda sem ${x}`,
    es: (x) => `Aún no hay ${x}`,
    af: (x) => `Nog geen ${x} nie`,
    zu: (x) => `Akukho ${x} okwamanje`,
    xh: (x) => `Akukho ${x} okwangoku`,
    st: (x) => `Ha ho ${x} hona joale`,
    nso: (x) => `Ga go na ${x} gabjale`,
    tn: (x) => `Ga go na ${x} gajaana`,
    ts: (x) => `A ku na ${x} sweswi`,
    ve: (x) => `A huna ${x} zwazwino`,
    ss: (x) => `Awekho ${x} kwanyalo`,
  },
  search: {
    pt: (x) => `Pesquisar ${x}`,
    es: (x) => `Buscar ${x}`,
    af: (x) => `Soek ${x}`,
    zu: (x) => `Sesha ${x}`,
    xh: (x) => `Khangela ${x}`,
    st: (x) => `Batla ${x}`,
    nso: (x) => `Nyaka ${x}`,
    tn: (x) => `Batla ${x}`,
    ts: (x) => `Lavisisa ${x}`,
    ve: (x) => `Ṱoḓa ${x}`,
    ss: (x) => `Sesha ${x}`,
  },
  loading: {
    pt: (x) => `A carregar ${x}`,
    es: (x) => `Cargando ${x}`,
    af: (x) => `Laai tans ${x}`,
    zu: (x) => `Iyalayisha ${x}`,
    xh: (x) => `Iyalayisha ${x}`,
    st: (x) => `E jaefa ${x}`,
    nso: (x) => `E laiša ${x}`,
    tn: (x) => `E laiša ${x}`,
    ts: (x) => `Yi loyida ${x}`,
    ve: (x) => `I khou ḽoḓa ${x}`,
    ss: (x) => `Iyalayisha ${x}`,
  },
  add: {
    pt: (x) => `Adicionar ${x}`,
    es: (x) => `Añadir ${x}`,
    af: (x) => `Voeg ${x} by`,
    zu: (x) => `Engeza ${x}`,
    xh: (x) => `Yongeza ${x}`,
    st: (x) => `Kenya ${x}`,
    nso: (x) => `Oketsa ${x}`,
    tn: (x) => `Tsenya ${x}`,
    ts: (x) => `Engetela ${x}`,
    ve: (x) => `Engedza ${x}`,
    ss: (x) => `Ngeta ${x}`,
  },
  edit: {
    pt: (x) => `Editar ${x}`,
    es: (x) => `Editar ${x}`,
    af: (x) => `Wysig ${x}`,
    zu: (x) => `Hlela ${x}`,
    xh: (x) => `Hlela ${x}`,
    st: (x) => `Lokisa ${x}`,
    nso: (x) => `Lokiša ${x}`,
    tn: (x) => `Lokisa ${x}`,
    ts: (x) => `Hlela ${x}`,
    ve: (x) => `Lulamisisa ${x}`,
    ss: (x) => `Hlela ${x}`,
  },
  delete: {
    pt: (x) => `Eliminar ${x}`,
    es: (x) => `Eliminar ${x}`,
    af: (x) => `Skrap ${x}`,
    zu: (x) => `Sula ${x}`,
    xh: (x) => `Cima ${x}`,
    st: (x) => `Hlakola ${x}`,
    nso: (x) => `Phumola ${x}`,
    tn: (x) => `Phimola ${x}`,
    ts: (x) => `Sula ${x}`,
    ve: (x) => `Thutha ${x}`,
    ss: (x) => `Sula ${x}`,
  },
  create: {
    pt: (x) => `Criar ${x}`,
    es: (x) => `Crear ${x}`,
    af: (x) => `Skep ${x}`,
    zu: (x) => `Dala ${x}`,
    xh: (x) => `Yila ${x}`,
    st: (x) => `Theha ${x}`,
    nso: (x) => `Hlama ${x}`,
    tn: (x) => `Tlhola ${x}`,
    ts: (x) => `Tumbuluxa ${x}`,
    ve: (x) => `Vumba ${x}`,
    ss: (x) => `Yakha ${x}`,
  },
  newX: {
    pt: (x) => `Novo ${x}`,
    es: (x) => `Nuevo ${x}`,
    af: (x) => `Nuwe ${x}`,
    zu: (x) => `${x} entsha`,
    xh: (x) => `${x} entsha`,
    st: (x) => `${x} e ncha`,
    nso: (x) => `${x} ye mpsha`,
    tn: (x) => `${x} e ntšha`,
    ts: (x) => `${x} lexintshwa`,
    ve: (x) => `${x} ntswa`,
    ss: (x) => `${x} lesisha`,
  },
  select: {
    pt: (x) => `Selecionar ${x}`,
    es: (x) => `Seleccionar ${x}`,
    af: (x) => `Kies ${x}`,
    zu: (x) => `Khetha ${x}`,
    xh: (x) => `Khetha ${x}`,
    st: (x) => `Khetha ${x}`,
    nso: (x) => `Kgetha ${x}`,
    tn: (x) => `Tlhopha ${x}`,
    ts: (x) => `Hlawula ${x}`,
    ve: (x) => `Nanga ${x}`,
    ss: (x) => `Khetsa ${x}`,
  },
  enter: {
    pt: (x) => `Introduzir ${x}`,
    es: (x) => `Introduce ${x}`,
    af: (x) => `Voer ${x} in`,
    zu: (x) => `Faka ${x}`,
    xh: (x) => `Faka ${x}`,
    st: (x) => `Kenya ${x}`,
    nso: (x) => `Tsenya ${x}`,
    tn: (x) => `Tsenya ${x}`,
    ts: (x) => `Nghenisa ${x}`,
    ve: (x) => `Ṅwališa ${x}`,
    ss: (x) => `Faka ${x}`,
  },
  view: {
    pt: (x) => `Ver ${x}`,
    es: (x) => `Ver ${x}`,
    af: (x) => `Sien ${x}`,
    zu: (x) => `Buka ${x}`,
    xh: (x) => `Jonga ${x}`,
    st: (x) => `Sheba ${x}`,
    nso: (x) => `Bona ${x}`,
    tn: (x) => `Bona ${x}`,
    ts: (x) => `Vona ${x}`,
    ve: (x) => `Vhona ${x}`,
    ss: (x) => `Buka ${x}`,
  },
  open: {
    pt: (x) => `Abrir ${x}`,
    es: (x) => `Abrir ${x}`,
    af: (x) => `Open ${x}`,
    zu: (x) => `Vula ${x}`,
    xh: (x) => `Vula ${x}`,
    st: (x) => `Bula ${x}`,
    nso: (x) => `Bula ${x}`,
    tn: (x) => `Bula ${x}`,
    ts: (x) => `Pfula ${x}`,
    ve: (x) => `Vula ${x}`,
    ss: (x) => `Vula ${x}`,
  },
  remove: {
    pt: (x) => `Remover ${x}`,
    es: (x) => `Quitar ${x}`,
    af: (x) => `Verwyder ${x}`,
    zu: (x) => `Susa ${x}`,
    xh: (x) => `Susa ${x}`,
    st: (x) => `Tlosa ${x}`,
    nso: (x) => `Tloša ${x}`,
    tn: (x) => `Tlosetsa ${x}`,
    ts: (x) => `Susa ${x}`,
    ve: (x) => `Bvisa ${x}`,
    ss: (x) => `Susa ${x}`,
  },
  send: {
    pt: (x) => `Enviar ${x}`,
    es: (x) => `Enviar ${x}`,
    af: (x) => `Stuur ${x}`,
    zu: (x) => `Thumela ${x}`,
    xh: (x) => `Thumela ${x}`,
    st: (x) => `Romela ${x}`,
    nso: (x) => `Romela ${x}`,
    tn: (x) => `Romela ${x}`,
    ts: (x) => `Rhumela ${x}`,
    ve: (x) => `Ruma ${x}`,
    ss: (x) => `Tfumela ${x}`,
  },
  save: {
    pt: (x) => `Guardar ${x}`,
    es: (x) => `Guardar ${x}`,
    af: (x) => `Stoor ${x}`,
    zu: (x) => `Londoloza ${x}`,
    xh: (x) => `Gcina ${x}`,
    st: (x) => `Boloka ${x}`,
    nso: (x) => `Boloka ${x}`,
    tn: (x) => `Boloka ${x}`,
    ts: (x) => `Hlayisa ${x}`,
    ve: (x) => `Vhulunga ${x}`,
    ss: (x) => `Gcina ${x}`,
  },
  cancel: {
    pt: (x) => `Cancelar ${x}`,
    es: (x) => `Cancelar ${x}`,
    af: (x) => `Kanselleer ${x}`,
    zu: (x) => `Khansela ${x}`,
    xh: (x) => `Rhoxisa ${x}`,
    st: (x) => `Hlakola ${x}`,
    nso: (x) => `Khansela ${x}`,
    tn: (x) => `Khansela ${x}`,
    ts: (x) => `Khansela ${x}`,
    ve: (x) => `Khansela ${x}`,
    ss: (x) => `Khansela ${x}`,
  },
  update: {
    pt: (x) => `Atualizar ${x}`,
    es: (x) => `Actualizar ${x}`,
    af: (x) => `Dateer ${x} op`,
    zu: (x) => `Buyekeza ${x}`,
    xh: (x) => `Hlaziya ${x}`,
    st: (x) => `Ntlafatsa ${x}`,
    nso: (x) => `Mpshafatša ${x}`,
    tn: (x) => `Ntšhwafatsa ${x}`,
    ts: (x) => `Pfuxa ${x}`,
    ve: (x) => `Khwinisa ${x}`,
    ss: (x) => `Buyekisa ${x}`,
  },
  change: {
    pt: (x) => `Alterar ${x}`,
    es: (x) => `Cambiar ${x}`,
    af: (x) => `Verander ${x}`,
    zu: (x) => `Shintsha ${x}`,
    xh: (x) => `Tshintsha ${x}`,
    st: (x) => `Fetola ${x}`,
    nso: (x) => `Fetoša ${x}`,
    tn: (x) => `Fetola ${x}`,
    ts: (x) => `Cinca ${x}`,
    ve: (x) => `Shandukisa ${x}`,
    ss: (x) => `Gucula ${x}`,
  },
  confirm: {
    pt: (x) => `Confirmar ${x}`,
    es: (x) => `Confirmar ${x}`,
    af: (x) => `Bevestig ${x}`,
    zu: (x) => `Qinisekisa ${x}`,
    xh: (x) => `Qinisekisa ${x}`,
    st: (x) => `Netefatsa ${x}`,
    nso: (x) => `Netefatša ${x}`,
    tn: (x) => `Netefatsa ${x}`,
    ts: (x) => `Tiyisisa ${x}`,
    ve: (x) => `Khwaṱhisedza ${x}`,
    ss: (x) => `Cinisekisa ${x}`,
  },
  manage: {
    pt: (x) => `Gerir ${x}`,
    es: (x) => `Gestionar ${x}`,
    af: (x) => `Bestuur ${x}`,
    zu: (x) => `Phatha ${x}`,
    xh: (x) => `Lawula ${x}`,
    st: (x) => `Laola ${x}`,
    nso: (x) => `Laola ${x}`,
    tn: (x) => `Laola ${x}`,
    ts: (x) => `Lawula ${x}`,
    ve: (x) => `Langulula ${x}`,
    ss: (x) => `Phatsa ${x}`,
  },
  choose: {
    pt: (x) => `Escolher ${x}`,
    es: (x) => `Elegir ${x}`,
    af: (x) => `Kies ${x}`,
    zu: (x) => `Khetha ${x}`,
    xh: (x) => `Khetha ${x}`,
    st: (x) => `Khetha ${x}`,
    nso: (x) => `Kgetha ${x}`,
    tn: (x) => `Tlhopha ${x}`,
    ts: (x) => `Hlawula ${x}`,
    ve: (x) => `Nanga ${x}`,
    ss: (x) => `Khetsa ${x}`,
  },
  show: {
    pt: (x) => `Mostrar ${x}`,
    es: (x) => `Mostrar ${x}`,
    af: (x) => `Wys ${x}`,
    zu: (x) => `Bonisa ${x}`,
    xh: (x) => `Bonisa ${x}`,
    st: (x) => `Bontša ${x}`,
    nso: (x) => `Bontšha ${x}`,
    tn: (x) => `Bontsha ${x}`,
    ts: (x) => `Kombisa ${x}`,
    ve: (x) => `Sumbedza ${x}`,
    ss: (x) => `Khombisa ${x}`,
  },
  copy: {
    pt: (x) => `Copiar ${x}`,
    es: (x) => `Copiar ${x}`,
    af: (x) => `Kopieer ${x}`,
    zu: (x) => `Kopisha ${x}`,
    xh: (x) => `Khuphela ${x}`,
    st: (x) => `Kopitsa ${x}`,
    nso: (x) => `Kopiša ${x}`,
    tn: (x) => `Kopitsa ${x}`,
    ts: (x) => `Kopa ${x}`,
    ve: (x) => `Kopa ${x}`,
    ss: (x) => `Khopisha ${x}`,
  },
  invalid: {
    pt: (x) => `${x.charAt(0).toUpperCase()}${x.slice(1)} inválido`,
    es: (x) => `${x.charAt(0).toUpperCase()}${x.slice(1)} no válido`,
    af: (x) => `Ongeldige ${x}`,
    zu: (x) => `${x} engavumelekile`,
    xh: (x) => `${x} engasebenziyo`,
    st: (x) => `${x} e fosahetseng`,
    nso: (x) => `${x} ye e sa šomego`,
    tn: (x) => `${x} e e sa siamang`,
    ts: (x) => `${x} yo nga tirhiki`,
    ve: (x) => `${x} i siho yone`,
    ss: (x) => `${x} lengavumelekile`,
  },
  your: {
    pt: (x) => `O seu ${x}`,
    es: (x) => `Tu ${x}`,
    af: (x) => `Jou ${x}`,
    zu: (x) => `${x} yakho`,
    xh: (x) => `${x} yakho`,
    st: (x) => `${x} ya hau`,
    nso: (x) => `${x} ya gago`,
    tn: (x) => `${x} ya gago`,
    ts: (x) => `${x} ya wena`,
    ve: (x) => `${x} yau`,
    ss: (x) => `${x} yakho`,
  },
};

function frag(en, locale) {
  const hit = lookupExact(en);
  if (hit?.[locale]) return hit[locale];
  return applyGlossary(en, locale);
}

function applyPattern(en, locale) {
  const specs = [
    [/^Failed to (.+?)(\.?)$/i, "failedTo"],
    [/^Could not (.+?)(\.?)$/i, "couldNot"],
    [/^Please (.+?)(\.?)$/i, "please"],
    [/^No (.+) yet$/i, "noYet"],
    [/^Search (.+)$/i, "search"],
    [/^Loading (.+)$/i, "loading"],
    [/^Add (.+)$/i, "add"],
    [/^Edit (.+)$/i, "edit"],
    [/^Delete (.+)$/i, "delete"],
    [/^Create (.+)$/i, "create"],
    [/^New (.+)$/i, "newX"],
    [/^Select (.+)$/i, "select"],
    [/^Enter (.+)$/i, "enter"],
    [/^View (.+)$/i, "view"],
    [/^Open (.+)$/i, "open"],
    [/^Remove (.+)$/i, "remove"],
    [/^Send (.+)$/i, "send"],
    [/^Save (.+)$/i, "save"],
    [/^Cancel (.+)$/i, "cancel"],
    [/^Update (.+)$/i, "update"],
    [/^Change (.+)$/i, "change"],
    [/^Confirm (.+)$/i, "confirm"],
    [/^Manage (.+)$/i, "manage"],
    [/^Choose (.+)$/i, "choose"],
    [/^Show (.+)$/i, "show"],
    [/^Copy (.+)$/i, "copy"],
    [/^Invalid (.+)$/i, "invalid"],
    [/^Your (.+)$/i, "your"],
  ];
  for (const [re, key] of specs) {
    const m = en.match(re);
    if (!m) continue;
    const inner = frag(m[1], locale);
    const wrapped = WRAP[key][locale](inner);
    return restorePunct(en, wrapped);
  }
  return null;
}

export function translate(en, locale) {
  if (typeof en !== "string") return en;
  if (isIdentity(en)) return en;
  const exact = lookupExact(en);
  if (exact?.[locale]) return restorePunct(en, exact[locale]);
  const patterned = applyPattern(en, locale);
  if (patterned && !stillMostlyEnglish(en, patterned)) return patterned;
  const glossed = applyGlossary(en, locale);
  if (stillMostlyEnglish(en, glossed)) return en;
  return glossed;
}

export function assertVars(en, translated, locale, pathKey, errors) {
  const enVars = extractVars(en);
  const locVars = extractVars(translated);
  for (const v of enVars) {
    if (!locVars.has(v)) errors.push(`${locale} ${pathKey}: missing {{${v}}}`);
  }
}

const ENGLISH_MARKERS = /\b(the|your|this|that|will|could|would|please|failed|cannot|before|after|when|where|which|have|has|been|was|were|not|and|for|are|can|with|from|into|onto)\b/i;

export function stillMostlyEnglish(en, out) {
  if (out === en) return true;
  if (isIdentity(en)) return false;
  if (en.length < 28) return false;
  const brands = new Set(BRANDS.map((b) => b.toLowerCase()));
  const keep = (w) => !brands.has(w) && !/^\{\{/.test(w);
  const enWords = (en.toLowerCase().match(/[a-z]{4,}/g) || []).filter(keep);
  const outWords = (out.toLowerCase().match(/[a-z]{4,}/g) || []).filter(keep);
  const leftover = outWords.filter((w) => enWords.includes(w));
  if (leftover.length >= 4) return true;
  if (leftover.length >= 3 && leftover.length / Math.max(outWords.length, 1) > 0.45) return true;
  if (ENGLISH_MARKERS.test(out) && leftover.length >= 2 && en.length > 50) return true;
  return false;
}

export function translateTree(node, locale, stats, pathKey = "") {
  if (typeof node === "string") {
    stats.total += 1;
    if (isIdentity(node)) {
      stats.identity += 1;
      return node;
    }
    const out = translate(node, locale);
    assertVars(node, out, locale, pathKey, stats.varErrors);
    if (out === node) stats.untranslated += 1;
    else stats.translated += 1;
    return out;
  }
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const dest = {};
    for (const [k, v] of Object.entries(node)) {
      dest[k] = translateTree(v, locale, stats, pathKey ? `${pathKey}.${k}` : k);
    }
    return dest;
  }
  return node;
}

export { LANGS, ALL_EXACT };
