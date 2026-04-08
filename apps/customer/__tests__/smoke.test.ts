/**
 * Minimal smoke test (runs without React Native/Expo runtime).
 * RN component tests under __tests__/components/ are excluded in jest.config (see testPathIgnorePatterns).
 */
describe("Customer app – smoke (node)", () => {
  it("runs in Jest", () => {
    expect(1 + 1).toBe(2);
  });
});
