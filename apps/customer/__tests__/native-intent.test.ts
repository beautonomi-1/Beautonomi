import { redirectSystemPath } from "../app/+native-intent";

describe("redirectSystemPath", () => {
  it("maps /booking?slug= to in-app book flow", () => {
    expect(
      redirectSystemPath({
        path: "https://www.beautonomi.com/booking?slug=luxe-salon&embed=1",
        initial: true,
      }),
    ).toBe("/(app)/book?slug=luxe-salon&embed=1");
  });

  it("maps /book/{slug} to book provider slug route", () => {
    expect(
      redirectSystemPath({
        path: "https://beautonomi.com/book/luxe-salon?embed=1",
        initial: true,
      }),
    ).toBe("/(app)/book/luxe-salon?embed=1");
  });

  it("maps express /book/l/{code}", () => {
    expect(
      redirectSystemPath({
        path: "https://beautonomi.com/book/l/abc123?embed=1",
        initial: true,
      }),
    ).toBe("/(app)/book/l/abc123?embed=1");
  });
});
