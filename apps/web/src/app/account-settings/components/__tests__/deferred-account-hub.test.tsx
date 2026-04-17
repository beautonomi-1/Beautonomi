import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: (
    loader: () => Promise<{ default: React.ComponentType<{ embeddedInProfile?: boolean }> }>
  ) => {
    const Lazy = React.lazy(loader);
    return function DynamicHub(props: { embeddedInProfile?: boolean }) {
      return (
        <React.Suspense fallback={<div data-testid="hub-dynamic-fallback">loading</div>}>
          <Lazy {...props} />
        </React.Suspense>
      );
    };
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: null }),
}));

import DeferredAccountHub from "../deferred-account-hub";

describe("DeferredAccountHub", () => {
  let OriginalIO: typeof IntersectionObserver;

  beforeEach(() => {
    OriginalIO = global.IntersectionObserver;
    global.IntersectionObserver = class MockIO implements IntersectionObserver {
      readonly root: Element | Document | null = null;
      readonly rootMargin = "";
      readonly thresholds: ReadonlyArray<number> = [];
      constructor(private readonly cb: IntersectionObserverCallback) {}
      observe(target: Element) {
        queueMicrotask(() => {
          this.cb(
            [{ isIntersecting: true, target, intersectionRatio: 1 } as IntersectionObserverEntry],
            this
          );
        });
      }
      disconnect() {}
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    global.IntersectionObserver = OriginalIO;
  });

  it("exposes #account-management when embedded so deep links can target it before the hub chunk loads", async () => {
    const { container } = render(<DeferredAccountHub embeddedInProfile />);
    const anchor = container.querySelector("#account-management");
    expect(anchor).toBeTruthy();
    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
  });

  it("eventually renders the More section heading after the hub loads", async () => {
    render(<DeferredAccountHub embeddedInProfile />);
    await waitFor(
      () => {
        expect(screen.getByRole("heading", { name: /^more$/i })).toBeInTheDocument();
      },
      { timeout: 15_000 }
    );
  });
});
