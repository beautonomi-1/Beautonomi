import { applyBatch5PartA } from "./b5-translations-a.mjs";
import { applyBatch5PartB } from "./b5-translations-b.mjs";
import { applyBatch5PartC } from "./b5-translations-c.mjs";
import { applyBatch5PartD } from "./b5-translations-d.mjs";
import { applyBatch5PartE } from "./b5-translations-e.mjs";

export function applyBatch5(r) {
  applyBatch5PartA(r);
  applyBatch5PartB(r);
  applyBatch5PartC(r);
  applyBatch5PartD(r);
  applyBatch5PartE(r);
}
