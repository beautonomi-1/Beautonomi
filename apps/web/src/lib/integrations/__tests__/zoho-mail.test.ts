import { describe, expect, it } from "vitest";
import {
  accountsHostForMailBase,
  extractTicketNumberFromSubject,
  isAutoReplyHeaders,
  matchAccountForMailbox,
  parseEmailAddress,
  parseZohoHeaderContent,
  resolveInboxFolderId,
  zohoListRowHasAttachment,
  ZOHO_MAIL_DATA_CENTERS,
} from "@/lib/integrations/zoho-mail";

describe("zoho-mail helpers", () => {
  it("maps all nine data centers including Canada accounts host", () => {
    expect(accountsHostForMailBase(ZOHO_MAIL_DATA_CENTERS.CA)).toBe("https://accounts.zohocloud.ca");
    expect(accountsHostForMailBase(ZOHO_MAIL_DATA_CENTERS.EU)).toBe("https://accounts.zoho.eu");
    expect(accountsHostForMailBase(ZOHO_MAIL_DATA_CENTERS.US)).toBe("https://accounts.zoho.com");
  });

  it("matches account by sendMailDetails fromAddress", () => {
    const accounts = [
      { accountId: "a1", sendMailDetails: [{ fromAddress: "other@x.com" }] },
      { accountId: "a2", sendMailDetails: [{ fromAddress: "support@beautonomi.com" }] },
    ];
    expect(matchAccountForMailbox(accounts, "support@beautonomi.com")?.accountId).toBe("a2");
  });

  it("resolves Inbox by folderType", () => {
    const id = resolveInboxFolderId([
      { folderId: "1", folderType: "Drafts" },
      { folderId: "2", folderType: "Inbox" },
    ]);
    expect(id).toBe("2");
  });

  it("parses headerContent string and map shapes", () => {
    const fromString = parseZohoHeaderContent("Auto-Submitted: auto-replied\nSubject: Hi");
    expect(isAutoReplyHeaders(fromString)).toBe(true);
    const fromMap = parseZohoHeaderContent({ "Auto-Submitted": ["auto-generated"] });
    expect(isAutoReplyHeaders(fromMap)).toBe(true);
  });

  it("parses display-name addresses and Not Provided cc", () => {
    expect(parseEmailAddress('"Support" <help@beautonomi.com>')).toBe("help@beautonomi.com");
    expect(parseEmailAddress("Not Provided")).toBe("");
  });

  it("extracts ticket number from subject", () => {
    expect(extractTicketNumberFromSubject("Re: billing [TKT-20260415-000042]")).toBe("TKT-20260415-000042");
  });

  it("detects hasAttachment list flag shapes", () => {
    expect(zohoListRowHasAttachment({ hasAttachment: 1 })).toBe(true);
    expect(zohoListRowHasAttachment({ hasAttachment: "1" })).toBe(true);
    expect(zohoListRowHasAttachment({ hasAttachment: 0 })).toBe(false);
    expect(zohoListRowHasAttachment({})).toBe(false);
  });
});
