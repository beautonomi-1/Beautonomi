/** Hard caption matches that warrant automatic explore post hide (not medical/wellness terms). */
const EXPLICIT_SEXUAL_TERMS = [
  "porn",
  "pornography",
  "xxx",
  "blowjob",
  "handjob",
  "orgasm",
  "nude",
  "nudes",
  "naked",
  "nsfw",
  "onlyfans",
  "hentai",
  "hardcore",
  "cumshot",
  "anal sex",
  "oral sex",
] as const;

const MINOR_SEXUAL_TERMS = [
  "child porn",
  "child pornography",
  "cp ",
  " underage ",
  " minor sex",
  "teen nude",
  "teen naked",
  "loli",
  "shota",
] as const;

export type ExploreCaptionSafetyVerdict = "safe" | "likely_violation";

export function exploreCaptionSafetyVerdict(
  caption: string | null | undefined,
): ExploreCaptionSafetyVerdict {
  if (!caption?.trim()) return "safe";
  const lower = ` ${caption.toLowerCase().replace(/\s+/g, " ")} `;
  for (const term of MINOR_SEXUAL_TERMS) {
    if (lower.includes(term)) return "likely_violation";
  }
  for (const term of EXPLICIT_SEXUAL_TERMS) {
    if (lower.includes(term)) return "likely_violation";
  }
  return "safe";
}
