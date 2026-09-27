/**
 * GRC catalogue: frameworks, requirements, Beautonomi controls, policy templates and starter inventories.
 * Seeded idempotently by `pnpm grc:seed` (scripts/grc-seed.mjs).
 */
import { CONTROLS } from "./controls";
import { POLICY_TEMPLATES } from "./documents";
import { FRAMEWORKS, REQUIREMENTS } from "./frameworks";
import { ASSETS, PROCESSING_ACTIVITIES, VENDORS } from "./inventory";

export * from "./types";
export { CONTROLS, POLICY_TEMPLATES, FRAMEWORKS, REQUIREMENTS, ASSETS, PROCESSING_ACTIVITIES, VENDORS };

/** Legacy placeholder ids from the first catalogue draft; the seed removes them if unused. */
export const LEGACY_REQUIREMENT_ID_PREFIXES = ["iso-clause-", "iso-annex-", "nist-", "popia-condition-", "gdpr-"];
export const LEGACY_CONTROL_ID_PATTERN = /^CTRL-\d{3}$/;

export function getCatalog() {
  return {
    frameworks: FRAMEWORKS,
    requirements: REQUIREMENTS,
    controls: CONTROLS,
    documents: POLICY_TEMPLATES,
    vendors: VENDORS,
    assets: ASSETS,
    processingActivities: PROCESSING_ACTIVITIES,
  };
}
