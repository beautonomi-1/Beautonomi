import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AccountHubSkeleton from "../account-hub-skeleton";

describe("AccountHubSkeleton", () => {
  it("renders a static placeholder grid for deferred hub loading", () => {
    const { container } = render(<AccountHubSkeleton />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(container.querySelector(".grid")).toBeTruthy();
  });
});
