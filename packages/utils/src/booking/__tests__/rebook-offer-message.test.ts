import { describe, expect, it } from "vitest";
import {
  buildRebookOfferClientMessage,
  ensureSingleLinkInMessage,
  staffDisplayNameForRebook,
} from "../rebook-offer-message";

describe("rebook-offer-message", () => {
  it("omits cadence when weeks is null", () => {
    const msg = buildRebookOfferClientMessage({
      clientFirstName: "Thandi",
      primaryServiceTitle: "Gel set",
      multiService: false,
      rebookWeeks: null,
      bookWithLabel: "with Lerato",
      atHome: false,
      holdAppointmentLabel: null,
      holdConfirmUntilLabel: null,
      link: "https://x/book",
    });
    expect(msg).not.toMatch(/due again/i);
    expect(msg).toContain("https://x/book");
    expect(msg.match(/https:\/\/x\/book/g)?.length).toBe(1);
  });

  it("includes hold labels when provided", () => {
    const msg = buildRebookOfferClientMessage({
      clientFirstName: "Thandi",
      primaryServiceTitle: "Gel set",
      multiService: false,
      rebookWeeks: 3,
      bookWithLabel: "with Lerato",
      atHome: false,
      holdAppointmentLabel: "Thu 18 Dec, 14:00",
      holdConfirmUntilLabel: "tomorrow 10:14",
      link: "https://x/book",
    });
    expect(msg).toMatch(/your Gel set is usually due again in 3 weeks/);
    expect(msg).not.toMatch(/\b(stylist|barber|therapist|technician)\b/i);
    expect(msg).toContain("Thu 18 Dec, 14:00");
    expect(msg).toContain("tomorrow 10:14");
  });

  it("ensureSingleLinkInMessage appends link once", () => {
    expect(ensureSingleLinkInMessage("Hi", "https://l")).toBe("Hi https://l");
    expect(ensureSingleLinkInMessage("Hi https://l", "https://l")).toBe("Hi https://l");
  });

  it("rejects business name as staff", () => {
    expect(staffDisplayNameForRebook("Glow Studio", "Glow Studio")).toBeNull();
    expect(staffDisplayNameForRebook("Owner", "Glow")).toBeNull();
    expect(staffDisplayNameForRebook("Lerato M", "Glow Studio")).toBe("Lerato M");
  });
});