import React from "react";
import { render, screen } from "@testing-library/react-native";
import {
  Skeleton,
  ProviderCardSkeleton,
  BookingCardSkeleton,
  ConversationSkeleton,
} from "@/components/Skeleton";

/** `Animated.View` + progressbar role is not always matched by `getByRole` in RN Testing Library — use label. */
describe("Skeleton", () => {
  it("renders with default props", () => {
    render(<Skeleton />);
    expect(screen.getByLabelText("Loading content")).toBeTruthy();
  });

  it("renders with custom dimensions", () => {
    render(<Skeleton width={200} height={40} borderRadius={12} />);
    expect(screen.getByLabelText("Loading content")).toBeTruthy();
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
