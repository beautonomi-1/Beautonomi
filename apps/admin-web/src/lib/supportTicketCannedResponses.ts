/** Quick-insert snippets for agent replies (admin SPA only). */
export const SUPPORT_TICKET_CANNED_RESPONSES: { label: string; body: string }[] = [
  {
    label: "Acknowledge",
    body: "Hi — thanks for contacting us. We’ve received your message and are reviewing the details now.",
  },
  {
    label: "Need more info",
    body: "To help you faster, could you share a few more details (screenshots, booking reference, or exact error message)?",
  },
  {
    label: "Working on it",
    body: "We’re actively working on this and will follow up as soon as we have an update.",
  },
  {
    label: "Resolved — verify",
    body: "We believe this is resolved on our side. Please try again and let us know if anything still looks off.",
  },
  {
    label: "Escalated",
    body: "I’ve escalated this to our specialist team. You’ll hear back from us with the next steps shortly.",
  },
];
