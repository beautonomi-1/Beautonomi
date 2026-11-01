import { describe, expect, it } from "vitest";
import { parseStaffJobPreset, resolveStaffJobPreset } from "../staff-job-presets";

/** Mirrors PATCH /api/provider/staff/[id] job branch (role_id must clear; bookable flags from preset). */
function patchFieldsForJob(job: unknown) {
  const presetKey = parseStaffJobPreset(job);
  if (!presetKey) return null;
  const preset = resolveStaffJobPreset(presetKey);
  return {
    role: preset.dbRole,
    permissions: preset.permissions,
    role_id: null,
    work_hours_enabled: preset.work_hours_enabled,
    is_service_provider: preset.is_service_provider,
    enable_in_online_booking: preset.enable_in_online_booking,
  };
}

describe("PATCH job preset fields", () => {
  it("clears role_id and copies bookable flags from preset", () => {
    const fields = patchFieldsForJob("front_desk");
    expect(fields?.role_id).toBeNull();
    expect(fields?.is_service_provider).toBe(false);
    expect(fields?.enable_in_online_booking).toBe(false);
  });

  it("returns null when job is absent", () => {
    expect(patchFieldsForJob(undefined)).toBeNull();
  });

  it("does not mutate when job is invalid", () => {
    expect(patchFieldsForJob("owner")).toBeNull();
  });
});
