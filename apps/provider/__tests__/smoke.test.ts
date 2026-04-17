/**
 * Minimal node smoke test. RN render tests: `smoke.test.tsx` (jest-expo + test Babel in `jest.config.js`).
 */
describe("Provider app – smoke (node)", () => {
  it("runs in Jest", () => {
    expect(1 + 1).toBe(2);
  });

  it("has a valid test environment", () => {
    expect(typeof expect).toBe("function");
  });
});
