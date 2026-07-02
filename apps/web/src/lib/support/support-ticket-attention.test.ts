import { describe, expect, it } from "vitest";
import { computeTicketAttention, type TicketAttentionInput } from "./support-ticket-attention";

const NOW = new Date("2024-06-01T12:00:00Z").getTime();
const H = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const H_AGO = (h: number) => new Date(NOW - h * 3600_000).toISOString();

function base(overrides: Partial<TicketAttentionInput> = {}): TicketAttentionInput {
  return {
    status: "open",
    priority: "medium",
    last_message_from: null,
    last_message_at: null,
    first_staff_reply_at: null,
    first_response_due_at: H(8),
    sla_resolution_due_at: H(72),
    assigned_to: "agent-1",
    last_staff_view_at: null,
    ...overrides,
  };
}

describe("computeTicketAttention", () => {
  describe("attention_state", () => {
    it("returns resolved for closed tickets", () => {
      const r = computeTicketAttention(base({ status: "closed" }), NOW);
      expect(r.attention_state).toBe("resolved");
    });

    it("returns resolved for resolved tickets", () => {
      const r = computeTicketAttention(base({ status: "resolved" }), NOW);
      expect(r.attention_state).toBe("resolved");
    });

    it("returns sla_breached when resolution SLA has passed", () => {
      const r = computeTicketAttention(
        base({ sla_resolution_due_at: H_AGO(1), last_message_from: "customer" }),
        NOW,
      );
      expect(r.attention_state).toBe("sla_breached");
    });

    it("returns awaiting_agent when customer replied last and SLA is ok", () => {
      const r = computeTicketAttention(
        base({
          last_message_from: "customer",
          last_message_at: H_AGO(1),
          first_staff_reply_at: H_AGO(5),
        }),
        NOW,
      );
      expect(r.attention_state).toBe("awaiting_agent");
    });

    it("returns unassigned_new for brand-new tickets with no assignee", () => {
      const r = computeTicketAttention(
        base({ assigned_to: null, first_staff_reply_at: null }),
        NOW,
      );
      expect(r.attention_state).toBe("unassigned_new");
    });

    it("returns first_response_overdue when first_response_due_at has passed and no reply", () => {
      const r = computeTicketAttention(
        base({
          first_response_due_at: H_AGO(1),
          first_staff_reply_at: null,
          assigned_to: "agent-1",
        }),
        NOW,
      );
      expect(r.attention_state).toBe("first_response_overdue");
    });

    it("returns waiting_customer when staff replied last", () => {
      const r = computeTicketAttention(
        base({
          last_message_from: "staff",
          first_staff_reply_at: H_AGO(2),
          status: "in_progress",
        }),
        NOW,
      );
      expect(r.attention_state).toBe("waiting_customer");
    });

    it("returns sla_at_risk when SLA window is < 25% remaining", () => {
      // medium resolution = 72h. At-risk at <18h remaining.
      const r = computeTicketAttention(
        base({
          sla_resolution_due_at: H(10), // 10h left out of 72h → at risk
          last_message_from: "staff",
          first_staff_reply_at: H_AGO(2),
          status: "in_progress",
        }),
        NOW,
      );
      expect(r.attention_state).toBe("sla_at_risk");
    });

    it("returns waiting_customer when staff replied last and SLA is fine", () => {
      const r = computeTicketAttention(
        base({
          last_message_from: "staff",
          first_staff_reply_at: H_AGO(1),
          sla_resolution_due_at: H(50), // well within window
          status: "in_progress",
        }),
        NOW,
      );
      expect(r.attention_state).toBe("waiting_customer");
    });

    it("returns assigned_idle when no messages yet and SLA is fine", () => {
      const r = computeTicketAttention(
        base({
          last_message_from: null,
          first_staff_reply_at: H_AGO(1),
          sla_resolution_due_at: H(50),
          status: "in_progress",
          assigned_to: "agent-1",
        }),
        NOW,
      );
      expect(r.attention_state).toBe("assigned_idle");
    });
  });

  describe("sla_state", () => {
    it("returns none when no SLA is set", () => {
      const r = computeTicketAttention(base({ sla_resolution_due_at: null }), NOW);
      expect(r.sla_state).toBe("none");
    });

    it("returns breached when SLA passed", () => {
      const r = computeTicketAttention(base({ sla_resolution_due_at: H_AGO(1) }), NOW);
      expect(r.sla_state).toBe("breached");
    });

    it("returns at_risk when less than 25% window remains", () => {
      // 72h window, 10h left → 10/72 ≈ 13.9% → at_risk
      const r = computeTicketAttention(base({ sla_resolution_due_at: H(10) }), NOW);
      expect(r.sla_state).toBe("at_risk");
    });

    it("returns ok when plenty of time remains", () => {
      const r = computeTicketAttention(base({ sla_resolution_due_at: H(60) }), NOW);
      expect(r.sla_state).toBe("ok");
    });

    it("returns none for resolved tickets even if SLA passed", () => {
      const r = computeTicketAttention(
        base({ status: "resolved", sla_resolution_due_at: H_AGO(5) }),
        NOW,
      );
      expect(r.sla_state).toBe("none");
    });
  });

  describe("agent_unread", () => {
    it("is false when ticket is done", () => {
      const r = computeTicketAttention(
        base({
          status: "closed",
          last_message_from: "customer",
          last_message_at: H_AGO(1),
          last_staff_view_at: H_AGO(3),
        }),
        NOW,
      );
      expect(r.agent_unread).toBe(false);
    });

    it("is true when customer replied after last staff view", () => {
      const r = computeTicketAttention(
        base({
          last_message_from: "customer",
          last_message_at: H_AGO(1),
          last_staff_view_at: H_AGO(3), // viewed before the message
        }),
        NOW,
      );
      expect(r.agent_unread).toBe(true);
    });

    it("is false when staff viewed after the last customer message", () => {
      const r = computeTicketAttention(
        base({
          last_message_from: "customer",
          last_message_at: H_AGO(3),
          last_staff_view_at: H_AGO(1), // viewed after the message
        }),
        NOW,
      );
      expect(r.agent_unread).toBe(false);
    });

    it("is true when last_staff_view_at is null and customer has replied", () => {
      const r = computeTicketAttention(
        base({
          last_message_from: "customer",
          last_message_at: H_AGO(2),
          last_staff_view_at: null,
        }),
        NOW,
      );
      expect(r.agent_unread).toBe(true);
    });

    it("is false when last message is from staff", () => {
      const r = computeTicketAttention(
        base({
          last_message_from: "staff",
          last_message_at: H_AGO(1),
          last_staff_view_at: null,
        }),
        NOW,
      );
      expect(r.agent_unread).toBe(false);
    });
  });

  describe("needs_agent_response shortcut", () => {
    it("uses the provided needs_agent_response column when available", () => {
      // Force needs_agent_response=true even though last_message_from=staff
      const r = computeTicketAttention(
        base({
          last_message_from: "staff",
          first_staff_reply_at: H_AGO(1),
          needs_agent_response: true,
        }),
        NOW,
      );
      // Should be awaiting_agent (or similar) since the DB says so, not waiting_customer
      expect(["awaiting_agent", "unassigned_new", "first_response_overdue"]).toContain(
        r.attention_state,
      );
    });
  });
});
