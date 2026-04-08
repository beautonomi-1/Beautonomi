/**
 * react-native's package entry is Flow/ESM-heavy; Jest in "node" env cannot parse it.
 * App modules (e.g. lib/analytics) import Platform from "react-native" — mock before any test file loads them.
 */
jest.mock("react-native", () => {
  const Platform = {
    OS: "ios",
    Version: 17,
    select: (spec) =>
      spec && typeof spec === "object" ? spec.ios ?? spec.default : undefined,
  };
  return { Platform };
});
