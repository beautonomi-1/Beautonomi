import { describe, expect, it } from "vitest";
import { parseStaffJobPreset, resolveStaffJobPreset } from "../staff-job-presets";

/** Mirrors PATCH /api/provider/staff/[id] job branch (role_id must clear; bookable flags unchanged). */
function patchFieldsForJob(job: unknown) {
  const presetKey = parseStaffJobPreset(job);
  if (!presetKey) return null;
  const preset = resolveStaffJobPreset(presetKey);
  return {
    role: preset.dbRole,
    permissions: preset.permissions,
    role_id: null,
    work_hours_enabled: preset.work_hours_enabled,
  };
}

describe("PATCH job preset fields", () => {
  it("clears role_id and does not copy bookable flags", () => {
    const fields = patchFieldsForJob("front_desk");
    expect(fields?.role_id).toBeNull();
    expect(fields).not.toHaveProperty("is_service_provider");
    expect(fields).not.toHaveProperty("enable_in_online_booking");
  });

  it("returns null when job is absent", () => {
    expect(patchFieldsForJob(undefined)).toBeNull();
  });

  it("does not mutate when job is invalid", () => {
    expect(patchFieldsForJob("owner")).toBeNull();
  });
});
