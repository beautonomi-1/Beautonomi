/**
 * Support ticket UI presets — categories from @beautonomi/utils.
 */
export {
  SUPPORT_TICKET_ALL_ITEMS,
  SUPPORT_TICKET_CATEGORY_GROUPS,
  SUPPORT_TICKET_DEFAULT_CATEGORY,
  labelForSupportTicketCategory,
  supportTicketPresetFromCategory,
  type TicketCategoryGroup,
} from "@beautonomi/utils";

export const SUPPORT_TICKET_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number]["value"];
