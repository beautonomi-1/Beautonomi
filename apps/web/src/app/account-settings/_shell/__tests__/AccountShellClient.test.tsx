import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AccountShellClient } from "../AccountShellClient";
import { CUSTOMER_PRIMARY_ROUTES } from "../primary-routes";

const prefetch = vi.fn();
const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { current: "/account-settings/bookings" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch }),
  usePathname: () => pathnameRef.current,
}));

describe("AccountShellClient", () => {
  beforeEach(() => {
    prefetch.mockClear();
    pathnameRef.current = "/account-settings/bookings";
  });

  it("prefetches each primary route exactly once on mount", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestIdleCallback",
      (cb: IdleRequestCallback) => {
        cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
        return 1;
      },
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());

    try {
      const { unmount } = render(
        <AccountShellClient>
          <div>child</div>
        </AccountShellClient>,
      );
      await vi.runAllTimersAsync();
      expect(prefetch.mock.calls.length).toBe(CUSTOMER_PRIMARY_ROUTES.length);
      for (const route of CUSTOMER_PRIMARY_ROUTES) {
        expect(prefetch.mock.calls.some((c) => c[0] === route)).toBe(true);
      }
      unmount();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("highlights the active quick link for the current path", () => {
    render(
      <AccountShellClient>
        <div>child</div>
      </AccountShellClient>,
    );
    const bookingsLink = screen.getByRole("link", { name: "Bookings" });
    expect(bookingsLink.getAttribute("class") || "").toContain("FF0077");
  });

  it("highlights Returns when pathname is /account-settings/returns", () => {
    pathnameRef.current = "/account-settings/returns";
    render(
      <AccountShellClient>
        <div>child</div>
      </AccountShellClient>,
    );
    const returnsLink = screen.getByRole("link", { name: "Returns" });
    expect(returnsLink.getAttribute("class") || "").toContain("FF0077");
  });
});
