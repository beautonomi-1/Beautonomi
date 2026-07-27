import { resolvePostLoginHref } from "@/lib/post-login-href";

const SAMPLE_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

describe("resolvePostLoginHref", () => {
  it("resolves explore post deep links after sign-in", () => {
    expect(resolvePostLoginHref(`/(app)/explore-post?id=${SAMPLE_ID}`)).toEqual({
      pathname: "/(app)/explore-post",
      params: { id: SAMPLE_ID },
    });
    expect(resolvePostLoginHref(`/(app)/explore/${SAMPLE_ID}`)).toEqual({
      pathname: "/(app)/explore-post",
      params: { id: SAMPLE_ID },
    });
  });
});
