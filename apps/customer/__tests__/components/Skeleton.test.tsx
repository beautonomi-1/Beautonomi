import React from "react";
import { render, screen } from "@testing-library/react-native";
import {
  Skeleton,
  ProviderCardSkeleton,
  BookingCardSkeleton,
  ConversationSkeleton,
} from "@/components/Skeleton";

describe("Skeleton", () => {
  it("renders with default props", () => {
    render(<Skeleton />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("renders with custom dimensions", () => {
    render(<Skeleton width={200} height={40} borderRadius={12} />);
    const skeleton = screen.getByRole("progressbar");
    expect(skeleton).toBeTruthy();
  });

  it("has accessible label", () => {
    render(<Skeleton />);
    expect(screen.getByLabelText("Loading content")).toBeTruthy();
  });
});

describe("ProviderCardSkeleton", () => {
  it("renders without crashing", () => {
    render(<ProviderCardSkeleton />);
    expect(screen.getByLabelText("Loading provider")).toBeTruthy();
  });
});

describe("BookingCardSkeleton", () => {
  it("renders without crashing", () => {
    render(<BookingCardSkeleton />);
    expect(screen.getByLabelText("Loading booking")).toBeTruthy();
  });
});

describe("ConversationSkeleton", () => {
  it("renders without crashing", () => {
    render(<ConversationSkeleton />);
    expect(screen.getByLabelText("Loading conversation")).toBeTruthy();
  });
});
