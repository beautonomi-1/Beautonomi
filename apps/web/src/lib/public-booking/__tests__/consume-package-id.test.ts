import { describe, it, expect } from "vitest";
import { resolveConsumePackageId } from "../consume-package-id";

const HOLD_PKG = "00000000-0000-4000-8000-000000000099";
const BODY_PKG = "00000000-0000-4000-8000-000000000088";

describe("resolveConsumePackageId", () => {
  it("opts out of hold metadata when body sends explicit null", () => {
    const body = { package_id: null, primary_package_id: null };
    expect(
      resolveConsumePackageId({
        body,
        packageId: null,
        primaryPackageId: null,
        holdMetaPackageId: HOLD_PKG,
      })
    ).toBeUndefined();
  });

  it("uses hold metadata when package keys are omitted", () => {
    expect(
      resolveConsumePackageId({
        body: {},
        packageId: undefined,
        primaryPackageId: undefined,
        holdMetaPackageId: HOLD_PKG,
      })
    ).toBe(HOLD_PKG);
  });

  it("uses explicit uuid from body", () => {
    const body = { package_id: BODY_PKG, primary_package_id: BODY_PKG };
    expect(
      resolveConsumePackageId({
        body,
        packageId: BODY_PKG,
        primaryPackageId: BODY_PKG,
        holdMetaPackageId: HOLD_PKG,
      })
    ).toBe(BODY_PKG);
  });
});
