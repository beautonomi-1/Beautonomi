import { describe, expect, it } from "vitest";
import { resolveSupportTicketSelectedNavAction } from "./supportTicketViewportNavigation";

describe("resolveSupportTicketSelectedNavAction", () => {
  it("noop when no selected id", () => {
    expect(
      resolveSupportTicketSelectedNavAction({
        selectedId: null,
        isDesktop: true,
        isTableView: false,
        everDesktop: false,
        wasDesktop: false,
      }),
    ).toBe("noop");
  });

  it("clears selected in table view", () => {
    expect(
      resolveSupportTicketSelectedNavAction({
        selectedId: "t1",
        isDesktop: true,
        isTableView: true,
        everDesktop: true,
        wasDesktop: true,
      }),
    ).toBe("clear_selected");
  });

  it("opens full page on mobile-first load", () => {
    expect(
      resolveSupportTicketSelectedNavAction({
        selectedId: "t1",
        isDesktop: false,
        isTableView: false,
        everDesktop: false,
        wasDesktop: false,
      }),
    ).toBe("open_full_page");
  });

  it("clears selected when shrinking from desktop", () => {
    expect(
      resolveSupportTicketSelectedNavAction({
        selectedId: "t1",
        isDesktop: false,
        isTableView: false,
        everDesktop: true,
        wasDesktop: true,
      }),
    ).toBe("clear_selected");
  });
});
