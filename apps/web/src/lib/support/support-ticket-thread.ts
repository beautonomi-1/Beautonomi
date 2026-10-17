type SupportTicketDescriptionSource = {
  id: string;
  description?: string | null;
  created_at?: string | null;
  user_id?: string | null;
};

/** When legacy tickets have description but no first message row, prepend it for the thread UI. */
export function prependSupportTicketDescriptionIfNeeded(
  ticket: SupportTicketDescriptionSource,
  messages: Record<string, unknown>[],
  currentUserId: string,
): Record<string, unknown>[] {
  const description = typeof ticket.description === "string" ? ticket.description.trim() : "";
  if (!description) return messages;

  const firstMessageText =
    messages.length > 0 && typeof messages[0]?.message === "string"
      ? String(messages[0].message).trim()
      : "";

  if (firstMessageText === description) return messages;

  const isCreator = ticket.user_id === currentUserId;
  return [
    {
      id: `ticket-description-${ticket.id}`,
      message: description,
      is_internal: false,
      created_at: ticket.created_at ?? new Date().toISOString(),
      user_id: ticket.user_id ?? "",
      author_name: isCreator ? "You" : undefined,
      is_mine: isCreator,
      attachments: [],
      is_ticket_description: true,
    },
    ...messages,
  ];
}

type AuthorProfile = {
  display_name?: string | null;
  full_name?: string | null;
};

export function enrichSupportTicketMessageForViewer(
  message: {
    user_id: string;
    author_kind?: string | null;
    author?: AuthorProfile | AuthorProfile[] | null;
    [key: string]: unknown;
  },
  currentUserId: string,
  labels?: { assistantName?: string },
): Record<string, unknown> {
  const authorProfile = Array.isArray(message.author) ? message.author[0] : message.author;
  const kind = message.author_kind ?? null;
  const isCurrentUser = kind !== "assistant" && message.user_id === currentUserId;
  let authorName: string;
  if (kind === "assistant") {
    authorName = labels?.assistantName ?? "Beautonomi Assistant";
  } else if (isCurrentUser) {
    authorName = "You";
  } else {
    authorName = authorProfile?.display_name || authorProfile?.full_name || "Support Team";
  }
  const { author: _drop, ...rest } = message;
  return { ...rest, author_name: authorName, is_mine: isCurrentUser };
}
