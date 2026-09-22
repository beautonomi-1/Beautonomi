import { applyBatch3 as applyP1 } from "./b3-translations-p1.mjs";
import { applyBatch3P2 as applyP2 } from "./b3-translations-p2.mjs";
import { applyBatch3P3 as applyP3 } from "./b3-translations-p3.mjs";
import { applyBatch3P4 as applyP4 } from "./b3-translations-p4.mjs";

export function applyBatch3(r) {
  applyP1(r);
  applyP2(r);
  applyP3(r);
  applyP4(r);
}
