import fs from "node:fs";

const p = new URL("../src/locales/en.json", import.meta.url);
const j = JSON.parse(fs.readFileSync(p, "utf8"));

const pc = j.provider?.mobile?.components?.bookings?.postCompletion;
if (pc && !pc.ratingSavedBody) {
  pc.ratingSavedBody = "Your rating was saved.";
}

const bd = j.provider?.mobile?.screens?.bookingDetail;
if (bd && !bd.rateClientIntro) {
  bd.rateClientIntro =
    "How was your experience with this client? You can submit a rating as soon as the booking is completed or marked no-show — the customer does not need to leave a review first.";
}

fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`);