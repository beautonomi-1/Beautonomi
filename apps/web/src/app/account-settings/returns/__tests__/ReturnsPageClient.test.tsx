import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import MyReturnsPage from "../ReturnsPageClient";
import type { ReturnRequestListItem } from "../return-list-types";

const getMock = vi.fn();
const patchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/lib/http/fetcher", () => ({
  fetcher: {
    get: (...args: unknown[]) => getMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

const sampleReturn: ReturnRequestListItem = {
  id: "ret-1",
  product_name: "Test product",
  reason: "changed_mind",
  quantity: 1,
  refund_amount: 42.5,
  status: "pending",
  created_at: "2026-01-15T12:00:00.000Z",
  order: {
    order_number: "BN-1001",
    provider: { business_name: "Studio A" },
  },
};

describe("ReturnsPageClient (MyReturnsPage)", () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset();
  });

  it("shows empty state when SSR provided an empty list", () => {
    render(<MyReturnsPage initialReturns={[]} />);
    expect(screen.getByRole("heading", { name: "My Returns" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Returns");
    expect(screen.getByText("No return requests yet")).toBeInTheDocument();
  });

  it("fetches when initial is null then lists returns", async () => {
    getMock.mockResolvedValueOnce({
      data: { returns: [sampleReturn] },
    });
    render(<MyReturnsPage initialReturns={null} />);
    expect(screen.getByText(/loading returns/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/api/me/returns", expect.objectContaining({ staleTimeMs: 15_000 }));
    });
    await waitFor(() => {
      expect(screen.getByText("BN-1001")).toBeInTheDocument();
      expect(screen.getByText("Test product")).toBeInTheDocument();
    });
  });
});
