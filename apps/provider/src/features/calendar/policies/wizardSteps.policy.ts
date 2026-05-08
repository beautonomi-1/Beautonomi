import type { WizardModeV2, WizardStepIdV2 } from "@/features/calendar/types/wizard";

export const WIZARD_STEPS: Record<WizardModeV2, WizardStepIdV2[]> = {
  studio: ["services", "client", "staff", "slot", "recurring", "review"],
  walkin: ["services", "client", "staff", "review"],
  housecall: ["services", "client", "staff", "slot", "address", "review"],
  group: ["services", "clients", "staff", "slot", "review"],
  block: ["staff", "slot", "block-label", "review"],
};

export function stepsForMode(mode: WizardModeV2): WizardStepIdV2[] {
  return [...(WIZARD_STEPS[mode] ?? WIZARD_STEPS.studio)];
}
