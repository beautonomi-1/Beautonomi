import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const enPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales/en.json");
const j = JSON.parse(fs.readFileSync(enPath, "utf8"));

const screens = j.provider?.mobile?.screens ?? {};
const bookingsList = screens.bookingsList ?? {};
if (!bookingsList.closeOutStartedRetryComplete) {
  const wrong = j.provider?.mobile?.bookingsList?.closeOutStartedRetryComplete;
  bookingsList.closeOutStartedRetryComplete =
    wrong ?? "Started, but not completed. Tap Complete again.";
  screens.bookingsList = bookingsList;
  j.provider.mobile.screens = screens;
  if (j.provider.mobile.bookingsList) delete j.provider.mobile.bookingsList;
}

const webBookings = j.web?.provider?.bookings ?? {};
webBookings.scheduleCard = {
  ...(webBookings.scheduleCard ?? {}),
  closeOutDue: webBookings.scheduleCard?.closeOutDue ?? "Due",
  actions: {
    ...(webBookings.scheduleCard?.actions ?? {}),
    complete_service: "Complete",
    review_booking: "Review",
  },
};
webBookings.overview = {
  ...(webBookings.overview ?? {}),
  closeOutCompleted: webBookings.overview?.closeOutCompleted ?? "Appointment completed",
  closeOutCompleteFailed: webBookings.overview?.closeOutCompleteFailed ?? "Could not complete this appointment",
  closeOutBalanceDue:
    webBookings.overview?.closeOutBalanceDue ??
    "Balance due — open the booking to take payment before completing.",
  closeOutStartedRetryComplete:
    webBookings.overview?.closeOutStartedRetryComplete ??
    "Started, but not completed. Tap Complete again.",
};
j.web.provider.bookings = webBookings;

const tmp = path.join(
  process.env.TEMP || "C:/Users/NoloSehloho/AppData/Local/Temp",
  `en-qa-${Date.now()}.json`,
);
fs.writeFileSync(tmp, `${JSON.stringify(j, null, 2)}\n`);
fs.copyFileSync(tmp, enPath);
fs.unlinkSync(tmp);
console.log("en paths fixed");