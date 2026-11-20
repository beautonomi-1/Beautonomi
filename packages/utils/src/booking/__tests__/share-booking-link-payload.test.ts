import { describe, expect, it } from "vitest";
import {
  buildShareBookingLinkPayload,
  buildWebNavigatorSharePayload,
} from "../share-booking-link-payload";

const url = "https://app.example.com/booking?slug=salon";

describe("buildShareBookingLinkPayload", () => {
  it("does not set url when message already contains the link (ios)", () => {
    const msg = `Book here: ${url}`;
    expect(buildShareBookingLinkPayload("ios", url, msg)).toEqual({ message: msg });
  });

  it("does not set url when message already contains the link (android)", () => {
    const msg = `Book here: ${url}`;
    expect(buildShareBookingLinkPayload("android", url, msg)).toEqual({ message: msg });
  });

  it("appends url to message when missing", () => {
    expect(buildShareBookingLinkPayload("android", url, "Hello")).toEqual({
      message: `Hello ${url}`,
    });
  });

  it("ios does not pass a separate url when the message includes the link", () => {
    expect(buildShareBookingLinkPayload("ios", url, "Hello")).toEqual({
      message: `Hello ${url}`,
    });
  });
});

describe("buildWebNavigatorSharePayload", () => {
  it("returns text only when link is embedded", () => {
    const msg = `Tap: ${url}`;
    expect(buildWebNavigatorSharePayload(url, msg)).toEqual({ text: msg });
  });
});