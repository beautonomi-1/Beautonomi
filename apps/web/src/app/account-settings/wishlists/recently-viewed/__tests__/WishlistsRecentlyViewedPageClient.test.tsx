import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import WishlistsRecentlyViewedPageClient from "../WishlistsRecentlyViewedPageClient";

const getMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/account-settings/wishlists/recently-viewed",
  useRouter: () => ({
    back: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/http/fetcher", () => ({
  fetcher: {
    get: (...args: unknown[]) => getMock(...args),
  },
  FetchError: class FetchError extends Error {
    status = 500;
  },
  FetchTimeoutError: class FetchTimeoutError extends Error {},
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt?: string; src?: string }) => <img alt={props.alt ?? ""} src={props.src as string} />,
}));

vi.mock("@/app/home/components/provider-card-dynamic", () => ({
  __esModule: true,
  default: () => <div data-testid="provider-card" />,
}));

describe("WishlistsRecentlyViewedPageClient", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("shows empty state when SSR provided an empty list", () => {
    render(<WishlistsRecentlyViewedPageClient initialProviders={[]} />);
    expect(screen.getByText("No recently viewed providers")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recently Viewed" })).toBeInTheDocument();
  });

  it("loads from API when initial is null then renders cards", async () => {
    getMock.mockResolvedValueOnce({
      data: [{ id: "p1", business_name: "Test Salon", slug: "test-salon" }],
    });
    render(<WishlistsRecentlyViewedPageClient initialProviders={null} />);
    expect(screen.getByText(/loading recently viewed/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith(
        "/api/me/recently-viewed",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
    await waitFor(() => {
      expect(screen.getAllByTestId("provider-card")).toHaveLength(1);
    });
  });
});
