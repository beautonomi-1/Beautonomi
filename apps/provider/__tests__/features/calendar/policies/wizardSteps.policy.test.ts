import { WIZARD_STEPS } from "@/features/calendar/policies/wizardSteps.policy";
// WizardModeV2 keys match plan's WizardMode names

describe("WIZARD_STEPS", () => {
  it("studio mode ends with review", () => {
    const steps = WIZARD_STEPS.studio;
    expect(steps[steps.length - 1]).toBe("review");
    expect(steps).toHaveLength(6);
  });

  it("walkin mode has no slot or recurring step", () => {
    expect(WIZARD_STEPS.walkin).not.toContain("slot");
    expect(WIZARD_STEPS.walkin).not.toContain("recurring");
    expect(WIZARD_STEPS.walkin).toHaveLength(4);
  });

  it("housecall includes address step", () => {
    expect(WIZARD_STEPS.housecall).toContain("address");
  });

  it("block mode has no client or services step", () => {
    expect(WIZARD_STEPS.block).not.toContain("client");
    expect(WIZARD_STEPS.block).not.toContain("services");
  });
});
