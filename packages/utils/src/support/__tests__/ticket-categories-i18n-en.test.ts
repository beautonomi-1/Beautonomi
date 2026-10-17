import { describe, expect, it } from "vitest";
import en from "../../../../i18n/src/locales/en.json";
import {
  SUPPORT_CONTEXT_TYPE_OPTIONS,
  SUPPORT_TICKET_CATEGORY_GROUPS_RICH,
  supportTicketCategoryGroupI18nKey,
  supportTicketCategoryItemI18nKey,
  supportTicketContextTypeI18nKey,
} from "../ticket-categories";

type TicketCategoriesLocale = {
  groups: Record<string, string>;
  items: Record<string, string>;
  contextTypes: Record<string, string>;
};

function ticketCategoriesLocale(): TicketCategoriesLocale {
  const root = en as { support?: { ticketCategories?: TicketCategoriesLocale } };
  const tc = root.support?.ticketCategories;
  if (!tc) throw new Error("en.json missing support.ticketCategories");
  return tc;
}

describe("support.ticketCategories en.json parity", () => {
  it("matches catalog labels for groups, items, and context types", () => {
    const tc = ticketCategoriesLocale();
    for (const g of SUPPORT_TICKET_CATEGORY_GROUPS_RICH) {
      expect(tc.groups[g.id], supportTicketCategoryGroupI18nKey(g.id)).toBe(g.label);
      for (const item of g.items) {
        expect(tc.items[item.value], supportTicketCategoryItemI18nKey(item.value)).toBe(item.label);
      }
    }
    for (const opt of SUPPORT_CONTEXT_TYPE_OPTIONS) {
      expect(tc.contextTypes[opt.value], supportTicketContextTypeI18nKey(opt.value)).toBe(opt.label);
    }
  });
});
