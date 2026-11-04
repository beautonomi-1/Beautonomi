/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSupportTicketComposerDraft,
  hasSupportTicketComposerDraft,
  loadSupportTicketComposerDraft,
  saveSupportTicketComposerDraft,
} from "./supportTicketComposerDrafts";

describe("supportTicketComposerDrafts", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips draft text per ticket", () => {
    saveSupportTicketComposerDraft("a", { reply: "hello", replyInternal: true });
    expect(loadSupportTicketComposerDraft("a")).toEqual({ reply: "hello", replyInternal: true });
    expect(hasSupportTicketComposerDraft("a")).toBe(true);
    expect(hasSupportTicketComposerDraft("b")).toBe(false);
  });

  it("removes empty drafts", () => {
    saveSupportTicketComposerDraft("a", { reply: "x", replyInternal: false });
    saveSupportTicketComposerDraft("a", { reply: "  ", replyInternal: false });
    expect(loadSupportTicketComposerDraft("a")).toBeNull();
  });

  it("clear removes one ticket", () => {
    saveSupportTicketComposerDraft("a", { reply: "x", replyInternal: false });
    saveSupportTicketComposerDraft("b", { reply: "y", replyInternal: false });
    clearSupportTicketComposerDraft("a");
    expect(loadSupportTicketComposerDraft("a")).toBeNull();
    expect(loadSupportTicketComposerDraft("b")?.reply).toBe("y");
  });
});
