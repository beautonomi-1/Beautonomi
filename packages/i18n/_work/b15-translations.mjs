import { applyB15PartA } from "./b15-translations-a.mjs";
import { applyB15PartB } from "./b15-translations-b.mjs";
import { applyB15PartC } from "./b15-translations-c.mjs";
import { applyB15PartD } from "./b15-translations-d.mjs";

export function applyB15(r) {
  applyB15PartA(r);
  applyB15PartB(r);
  applyB15PartC(r);
  applyB15PartD(r);
}
