/**
 * Minimal smoke test. Full suite uses `jest-expo` + test Babel config (see `jest.config.js`, `babel.config.js`).
 */
describe("Customer app – smoke (node)", () => {
  it("runs in Jest", () => {
    expect(1 + 1).toBe(2);
  });
});
