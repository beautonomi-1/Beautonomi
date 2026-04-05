/**
 * Minimal smoke test for the Provider app (runs without React Native/Expo runtime).
 * RN render tests live in smoke.test.tsx / smoke.rn.test.tsx; they are excluded from default Jest (see jest.config.js).
 */
describe("Provider app – smoke (node)", () => {
  it("runs in Jest", () => {
    expect(1 + 1).toBe(2);
  });

  it("has a valid test environment", () => {
    expect(typeof expect).toBe("function");
  });
});
