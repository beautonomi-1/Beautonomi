import { afterEach, expect, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

// Use matchers + vitest's `expect` directly. `@testing-library/jest-dom/vitest` calls
// `expect.extend` with a different expect import and breaks Vitest's internal
// `setState` (testPath becomes getter-only) → "Cannot set property testPath".
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as unknown as Storage;

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom lacks IntersectionObserver + ResizeObserver, which several Radix /
// Framer Motion / virtualization components rely on. Provide minimal no-op
// constructors so component tests don't crash at mount time.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "";
  thresholds: readonly number[] = [];
}
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = MockIntersectionObserver;
(globalThis as any).ResizeObserver = MockResizeObserver;
if (typeof window !== "undefined") {
  (window as any).IntersectionObserver = MockIntersectionObserver;
  (window as any).ResizeObserver = MockResizeObserver;
}
