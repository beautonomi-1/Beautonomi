import { applyBatch4PartA } from "./b4-translations-a.mjs";
import { applyBatch4PartB } from "./b4-translations-b.mjs";
import { applyBatch4PartC } from "./b4-translations-c.mjs";
import { applyBatch4PartD } from "./b4-translations-d.mjs";
import { applyBatch4PartE } from "./b4-translations-e.mjs";

export function applyBatch4(r) {
  applyBatch4PartA(r);
  applyBatch4PartB(r);
  applyBatch4PartC(r);
  applyBatch4PartD(r);
  applyBatch4PartE(r);
}
