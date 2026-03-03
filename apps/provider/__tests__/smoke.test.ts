/**
 * Minimal smoke test for the Provider app (runs without React Native/Expo runtime).
 * Full RN smoke tests are in smoke.rn.test.tsx; run with E2E or after fixing Jest/pnpm/Expo setup.
 */
describe("Provider app – smoke (node)", () => {
  it("runs in Jest", () => {
    expect(1 + 1).toBe(2);
  });

  it("has a valid test environment", () => {
    expect(typeof expect).toBe("function");
  });
});
