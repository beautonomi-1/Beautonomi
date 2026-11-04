const STORAGE_KEY = "admin_support_ticket_composer_drafts";

export type ComposerDraft = {
  reply: string;
  replyInternal: boolean;
};

type DraftMap = Record<string, ComposerDraft>;

function readMap(): DraftMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DraftMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: DraftMap): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function loadSupportTicketComposerDraft(ticketId: string): ComposerDraft | null {
  if (!ticketId) return null;
  const d = readMap()[ticketId];
  if (!d) return null;
  return { reply: d.reply ?? "", replyInternal: Boolean(d.replyInternal) };
}

export function saveSupportTicketComposerDraft(ticketId: string, draft: ComposerDraft): void {
  if (!ticketId) return;
  const map = readMap();
  if (!draft.reply.trim()) {
    delete map[ticketId];
  } else {
    map[ticketId] = { reply: draft.reply, replyInternal: draft.replyInternal };
  }
  writeMap(map);
}

export function clearSupportTicketComposerDraft(ticketId: string): void {
  if (!ticketId) return;
  const map = readMap();
  delete map[ticketId];
  writeMap(map);
}

export function hasSupportTicketComposerDraft(ticketId: string): boolean {
  const d = loadSupportTicketComposerDraft(ticketId);
  return Boolean(d?.reply.trim());
}
