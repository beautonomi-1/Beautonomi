import { buildWebRebookHref, type RebookContext, type RebookServiceLine } from "./rebook-from-booking";

export type RebookOfferCopyInput = {
  clientFirstName: string;
  primaryServiceTitle: string;
  multiService: boolean;
  rebookWeeks: number | null;
  bookWithLabel: string;
  atHome: boolean;
  holdAppointmentLabel: string | null;
  holdConfirmUntilLabel: string | null;
  link: string;
};

export function firstNameFromDisplayName(name: string | null | undefined): string {
  const t = String(name ?? "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0] ?? t;
}

/** Use staff display name only when it looks like a person, not business/Owner placeholder. */
export function staffDisplayNameForRebook(
  staffName: string | null | undefined,
  businessName: string,
): string | null {
  const n = String(staffName ?? "").trim();
  if (!n) return null;
  if (n.toLowerCase() === "owner") return null;
  if (n === businessName) return null;
  return n;
}

export function teamMemberFirstName(staffName: string): string {
  return staffName.split(/\s+/)[0] ?? staffName;
}

export function resolveBookWithLabel(args: {
  staffNames: string[];
  businessName: string;
  atHome: boolean;
}): string {
  const business = args.businessName.trim() || "us";
  const people = args.staffNames
    .map((s) => staffDisplayNameForRebook(s, business))
    .filter((s): s is string => Boolean(s))
    .map(teamMemberFirstName);
  const unique = people.filter((person, index) => people.indexOf(person) === index);
  if (unique.length === 1) {
    return args.atHome ? `with ${unique[0]} at your place` : `with ${unique[0]}`;
  }
  return args.atHome ? `at ${business} (at your place)` : `at ${business}`;
}

export function buildRebookOfferClientMessage(input: RebookOfferCopyInput): string {
  const who = input.clientFirstName.trim() || "there";
  let body = `Hi ${who}`;
  const servicePhrase = input.multiService
    ? `your ${input.primaryServiceTitle} and your other services`
    : `your ${input.primaryServiceTitle}`;

  const verb = input.multiService ? "are" : "is";
  if (input.rebookWeeks != null && input.rebookWeeks > 0) {
    const w = input.rebookWeeks;
    body += ` — ${servicePhrase} ${verb} usually due again in ${w} week${w === 1 ? "" : "s"}.`;
  }

  const hasHold = Boolean(input.holdAppointmentLabel && input.holdConfirmUntilLabel);
  if (hasHold) {
    body += ` ${input.holdAppointmentLabel} is held for you ${input.bookWithLabel} until ${input.holdConfirmUntilLabel}.`;
    body += ` One tap to keep it: ${input.link}`;
  } else if (input.rebookWeeks != null && input.rebookWeeks > 0) {
    body += ` Book your next visit: ${input.link}`;
  } else {
    body += ` — book your next visit: ${input.link}`;
  }
  return body;
}

export function buildRebookOfferProviderHint(input: {
  clientFirstName: string;
  primaryServiceTitle: string;
  multiService: boolean;
  rebookWeeks: number | null;
  bookWithLabel: string;
  holdAppointmentLabel: string | null;
}): string {
  const who = input.clientFirstName.trim() || "your client";
  const servicePhrase = input.multiService
    ? `${who}'s ${input.primaryServiceTitle} and other services`
    : `${who}'s ${input.primaryServiceTitle}`;
  const verb = input.multiService ? "are" : "is";
  if (input.rebookWeeks != null && input.rebookWeeks > 0 && input.holdAppointmentLabel) {
    return `${servicePhrase} ${verb} usually every ${input.rebookWeeks} week${input.rebookWeeks === 1 ? "" : "s"}. ${input.holdAppointmentLabel} ${input.bookWithLabel} stays held for 24 hours once you send this.`;
  }
  if (input.rebookWeeks != null && input.rebookWeeks > 0) {
    return `Send ${who} your booking link — ${servicePhrase} ${verb} usually every ${input.rebookWeeks} week${input.rebookWeeks === 1 ? "" : "s"}.`;
  }
  return `Send ${who} your booking link for their next visit.`;
}

export function ensureSingleLinkInMessage(message: string, link: string): string {
  const trimmed = message.trim();
  if (trimmed.includes(link)) return trimmed;
  return `${trimmed} ${link}`.trim();
}

export function buildAbsoluteRebookLink(
  appBaseUrl: string,
  slug: string,
  services: RebookServiceLine[],
  context: RebookContext | undefined,
  extras: {
    rebookOfferId?: string;
    holdId?: string;
    dateYmd?: string;
    step?: "calendar" | "services";
  },
): string {
  const base = appBaseUrl.replace(/\/$/, "");
  const path = buildWebRebookHref(slug, services, context);
  const q = new URLSearchParams(path.split("?")[1] ?? "");
  if (extras.rebookOfferId) q.set("rebook_offer", extras.rebookOfferId);
  if (extras.holdId) q.set("hold_id", extras.holdId);
  if (extras.dateYmd) q.set("date", extras.dateYmd);
  if (extras.step) q.set("step", extras.step);
  return `${base}/booking?${q.toString()}`;
}