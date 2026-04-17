import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("../account-settings-client", () => ({
  __esModule: true,
  default: function AccountSettingsClientMock() {
    return <div data-testid="account-settings-client">client</div>;
  },
}));

import AccountSettingsPage from "../page";

describe("account-settings page", () => {
  it("is a server-friendly shell that suspense-wraps the client entry", async () => {
    render(<AccountSettingsPage />);
    expect(await screen.findByTestId("account-settings-client")).toBeInTheDocument();
  });
});
