import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MessagesPageClient } from "../MessagesPageClient";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    channel: () => ({
      on: () => ({ subscribe: () => "ok" }),
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("@/components/messaging/conversation-list", () => ({
  __esModule: true,
  default: () => <div data-testid="conversation-list" />,
}));

vi.mock("@/components/messaging/whatsapp-chat", () => ({
  __esModule: true,
  default: () => <div data-testid="whatsapp-chat" />,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("MessagesPageClient", () => {
  it("renders messages chrome and conversation list with hydrated initial data", async () => {
    render(
      <MessagesPageClient
        initial={{
          conversations: [],
          currentUserId: "user-1",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Messages" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Messages");

    await waitFor(() => {
      expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
    });
  });
});
