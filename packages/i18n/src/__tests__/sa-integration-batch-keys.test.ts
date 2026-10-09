import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTEGRATION_BATCH_KEYS,
  SA_WAVE_A_LOCALES,
  isBatchSameAsEnglishAllowed,
} from "../../scripts/integration-batch-keys.mjs";
import { isIdentity } from "../../scripts/_wave-a-translate.mjs";

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localesDir = path.join(pkgRoot, "src/locales");

function flatten(obj: Record<string, unknown>, prefix = "", out = new Map<string, string>()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, full, out);
    } else {
      out.set(full, String(value ?? ""));
    }
  }
  return out;
}

function getFromFlat(flat: Map<string, string>, dotted: string): string | undefined {
  return flat.get(dotted);
}

describe("SA Wave A integration batch keys", () => {
  it("lists exactly 42 batch paths", () => {
    expect(INTEGRATION_BATCH_KEYS).toHaveLength(42);
  });

  const enFlat = flatten(
    JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8")) as Record<string, unknown>,
  );

  for (const locale of SA_WAVE_A_LOCALES) {
    it(`locale ${locale} has translated integration batch`, () => {
      const locFlat = flatten(
        JSON.parse(fs.readFileSync(path.join(localesDir, `${locale}.json`), "utf8")) as Record<
          string,
          unknown
        >,
      );

      for (const key of INTEGRATION_BATCH_KEYS) {
        const enVal = getFromFlat(enFlat, key);
        expect(enVal, `missing en key ${key}`).toBeTruthy();

        const locVal = getFromFlat(locFlat, key);
        expect(typeof locVal, `${locale} missing ${key}`).toBe("string");

        const allowedSame =
          isIdentity(enVal!) ||
          isBatchSameAsEnglishAllowed(key, enVal!) ||
          locVal !== enVal;

        expect(allowedSame, `${locale} ${key} still English: ${enVal}`).toBe(true);
      }
    });
  }
});
