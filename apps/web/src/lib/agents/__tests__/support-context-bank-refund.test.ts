import { describe, expect, it, vi } from "vitest";
import { fetchSupportTicketContext } from "../support-context";

describe("fetchSupportTicketContext wallet_bank_refund", () => {
  it("returns masked wallet bank-refund facts for the ticket owner", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "wallet_bank_refund_requests") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "req-1",
                    request_number: "WBR-1",
                    user_id: "cust-1",
                    status: "pending",
                    amount: 200,
                    net_amount: 200,
                    currency: "ZAR",
                    bank_name: "FNB",
                    account_number_last4: "1234",
                    tenant_id: "t1",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      }),
    };
    const facts = await fetchSupportTicketContext(supabase as never, {
      user_id: "cust-1",
      support_context_type: "wallet_bank_refund",
      support_context_id: "req-1",
    });
    expect(facts?.contextType).toBe("wallet_bank_refund");
    expect(facts?.facts.status).toBe("pending");
    expect(facts?.facts.amount).toBe(200);
    expect(facts?.facts.bank_last4).toBe("1234");
    expect(facts?.facts.sla_business_days).toBeTruthy();
  });
});
