import { describe, expect, it, vi, beforeEach } from "vitest";
import { riskScoreForSignal, FRAUD_RISK } from "../fraud-risk-scores";
import {
  isValidFraudCaseTransition,
  requiresDecisionNotes,
} from "../fraud-case-transitions";

vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyFraudCaseOpened: vi.fn(),
}));

describe("fraud-risk-scores", () => {
  it("returns deterministic scores per signal kind", () => {
    expect(riskScoreForSignal("psp.chargeback")).toBe(FRAUD_RISK.PSP_CHARGEBACK);
    expect(riskScoreForSignal("identity.rejected")).toBe(FRAUD_RISK.DIDIT_REJECTED);
    expect(riskScoreForSignal("identity.name_mismatch")).toBe(FRAUD_RISK.DIDIT_NAME_MISMATCH);
    expect(riskScoreForSignal("support.safety_fraud")).toBe(FRAUD_RISK.SAFETY_FRAUD_TICKET);
  });
});

describe("fraud-case-transitions", () => {
  it("allows valid human disposition paths", () => {
    expect(isValidFraudCaseTransition("open", "review")).toBe(true);
    expect(isValidFraudCaseTransition("open", "held")).toBe(true);
    expect(isValidFraudCaseTransition("review", "held")).toBe(true);
    expect(isValidFraudCaseTransition("held", "released")).toBe(true);
    expect(isValidFraudCaseTransition("released", "closed")).toBe(true);
  });

  it("blocks invalid transitions", () => {
    expect(isValidFraudCaseTransition("closed", "open")).toBe(false);
    expect(isValidFraudCaseTransition("held", "open")).toBe(false);
    expect(isValidFraudCaseTransition("open", "released")).toBe(false);
  });

  it("requires decision notes on terminal release/close", () => {
    expect(requiresDecisionNotes("released")).toBe(true);
    expect(requiresDecisionNotes("closed")).toBe(true);
    expect(requiresDecisionNotes("held")).toBe(false);
  });
});

describe("openFraudCase idempotency", () => {
  const insertMock = vi.fn();
  const selectMock = vi.fn();
  const eqMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const inMock = vi.fn();
  const limitMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: "case-new" }, error: null }),
      }),
    });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    limitMock.mockReturnValue({ maybeSingle: maybeSingleMock });
    inMock.mockReturnValue({ limit: limitMock });
    eqMock.mockImplementation(() => ({
      eq: eqMock,
      in: inMock,
      maybeSingle: maybeSingleMock,
      limit: limitMock,
    }));
    selectMock.mockReturnValue({ eq: eqMock });
    vi.doMock("@/lib/integrations/slack/ops-triggers", () => ({
      slackNotifyFraudCaseOpened: vi.fn(),
    }));
  });

  it("returns existing case when idempotency key matches", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: "case-existing" }, error: null });

    const { openFraudCase } = await import("../open-fraud-case");
    const supabase = {
      from: vi.fn().mockReturnValue({ select: selectMock, insert: insertMock }),
    };

    const result = await openFraudCase(
      {
        tenantId: "tenant-1",
        riskScore: 85,
        signal: "psp.chargeback",
        idempotencyKey: "stripe:dispute:dp_1",
      },
      supabase as never,
    );

    expect(result.fraudCaseId).toBe("case-existing");
    expect(result.alreadyExisted).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
