import fs from "fs";
import path from "path";

const en = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../../packages/i18n/src/locales/en.json"), "utf8"),
);

const bookingsList = en.provider.mobile.screens.bookingsList;
const scheduleCard = en.provider.mobile.components.bookings.scheduleCard;

describe("bookings overview i18n keys", () => {
  it("has appointmentsTile for overview stats label", () => {
    expect(bookingsList.appointmentsTile).toBeTruthy();
    expect(bookingsList.appointments_one).toBeTruthy();
  });

  it("has close-out banner and action keys", () => {
    expect(bookingsList.closeOutBreakdown).toBeTruthy();
    expect(bookingsList.closeOutAction).toBeTruthy();
    expect(bookingsList.closeOutFilterTitle_one).toBeTruthy();
    expect(bookingsList.closeOutBannerA11y_one).toBeTruthy();
  });

  it("has schedule card action labels", () => {
    expect(scheduleCard.actions.complete_service).toBeTruthy();
    expect(scheduleCard.closeOutComplete).toBeTruthy();
    expect(scheduleCard.tillPayment.cash).toBeTruthy();
  });
});