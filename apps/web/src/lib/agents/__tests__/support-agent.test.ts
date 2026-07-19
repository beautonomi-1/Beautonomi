import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error("not needed in unit tests");
  }),
}));
vi.mock("@/lib/ai/gemini", () => ({
  callGemini: vi.fn(async () => ({ text: "", tokensIn: 0, tokensOut: 0, success: false })),
}));

import {
  buildFallbackReplyDraft,
  classifySupportTicketHeuristically,
} from "../workflows/support-agent";

describe("support agent heuristic classification", () => {
  it("escalates refund and dispute language to a human", () => {
    const result = classifySupportTicketHeuristically({
      subject: "I want my money back",
      description: "I was charged twice and I want a refund immediately or I will open a chargeback.",
      priority: "medium",
      category: "payment",
    });
    expect(result.needsHuman).toBe(true);
    expect(result.escalationReasons).toContain("refund_or_billing");
    expect(result.escalationReasons).toContain("payment_dispute");
    expect(result.urgency).toBe("high");
  });

  it("escalates safety incidents and legal threats", () => {
    const result = classifySupportTicketHeuristically({
      subject: "Allergic reaction after treatment",
      description: "My skin has a rash and burns. I am speaking to my lawyer about this.",
      priority: "low",
    });
    expect(result.needsHuman).toBe(true);
    expect(result.escalationReasons).toEqual(
      expect.arrayContaining(["safety_incident", "legal_threat"]),
    );
  });

  it("does not escalate a routine question", () => {
    const result = classifySupportTicketHeuristically({
      subject: "How do I change my booking time?",
      description: "I booked a haircut for Friday and would like to move it to Saturday.",
      priority: "medium",
    });
    expect(result.needsHuman).toBe(false);
    expect(result.escalationReasons).toHaveLength(0);
  });

  it("treats customer-marked urgent tickets as escalations", () => {
    const result = classifySupportTicketHeuristically({
      subject: "App not loading",
      description: "The app shows a white screen.",
      priority: "urgent",
    });
    expect(result.needsHuman).toBe(true);
    expect(result.urgency).toBe("urgent");
  });
});

describe("support agent fallback reply draft", () => {
  it("references the ticket, greets by name, and flags human review on escalation", () => {
    const draft = buildFallbackReplyDraft({
      customerName: "Naledi",
      ticketNumber: "TKT-20260719-000123",
      subject: "Refund request",
      needsHuman: true,
    });
    expect(draft).toContain("Hi Naledi,");
    expect(draft).toContain("TKT-20260719-000123");
    expect(draft).toContain("personally reviewing");
  });

  it("never promises refunds or compensation", () => {
    for (const needsHuman of [true, false]) {
      const draft = buildFallbackReplyDraft({
        customerName: null,
        ticketNumber: "TKT-1",
        subject: "I want a refund",
        needsHuman,
      });
      expect(draft.toLowerCase()).not.toMatch(/we will refund|refund has been|you will receive a refund|compensat/);
    }
  });
});
