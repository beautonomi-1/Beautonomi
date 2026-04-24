import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import RecentlyAdd from "../recently-add";

describe("RecentlyAdd", () => {
  it("links to the recently-viewed account page", () => {
    render(<RecentlyAdd thumbnails={[]} />);
    const link = screen.getByRole("link", { name: /view recently viewed providers/i });
    expect(link).toHaveAttribute("href", "/account-settings/wishlists/recently-viewed");
  });

  it("shows section title for discoverability", () => {
    render(<RecentlyAdd thumbnails={["https://example.com/a.jpg"]} />);
    expect(screen.getByText("Recently viewed")).toBeInTheDocument();
  });
});
