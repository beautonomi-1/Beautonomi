/**
 * Canonical navigation for provider setup checklist steps.
 *
 * Checklist taps and "Continue setup" should land on the dedicated screen
 * for that task (server `native_route`). The guided wizard is only used when
 * a step has a safe wizard mapping — never bare wizard resume at phone/email.
 */

import { wizardStepForSetupStatusId } from "@/features/provider-onboarding/setupStepMap";

export const SETUP_HUB_ROUTE = "/(app)/onboarding";
export const GUIDED_WIZARD_ROUTE = "/(app)/onboarding/wizard";

export type SetupNavStep = {
  id: string;
  title?: string;
  completed?: boolean;
  required?: boolean;
  native_route?: string | null;
};

/**
 * Best route to complete a single checklist step.
 * 1. Server native_route when present
 * 2. Wizard with focus when a safe mapping exists
 * 3. Setup hub (never bare wizard — avoids draft resume at step 2)
 */
export function resolveSetupStepRoute(step: SetupNavStep): string {
  if (step.native_route && step.native_route.startsWith("/(app)/")) {
    return step.native_route;
  }
  const mapped = wizardStepForSetupStatusId(step.id);
  if (mapped != null) {
    return `/(app)/onboarding/wizard?focus=${encodeURIComponent(step.id)}`;
  }
  return SETUP_HUB_ROUTE;
}

/**
 * Route for the primary "Continue setup" CTA — first incomplete required step,
 * else first incomplete optional step.
 */
export function resolveNextIncompleteRoute(steps: SetupNavStep[]): string {
  const requiredIncomplete = steps.filter((s) => s.required && !s.completed);
  const optionalIncomplete = steps.filter((s) => !s.required && !s.completed);
  const next = requiredIncomplete[0] ?? optionalIncomplete[0];
  if (next) return resolveSetupStepRoute(next);
  return GUIDED_WIZARD_ROUTE;
}
