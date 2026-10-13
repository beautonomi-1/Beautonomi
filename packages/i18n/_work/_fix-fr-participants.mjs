import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales/fr.json");
const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
const block = data?.customer?.mobile?.screens?.groupBookingDetail;
if (block?.participants === "Participants") {
  block.participants = "Liste des participants";
  fs.writeFileSync(localePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log("updated fr participants");
} else {
  console.log("skip", block?.participants);
}
