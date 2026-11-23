import { describe, expect, it } from "vitest";
import { deriveProviderPortalNotificationUrl } from "../derive-provider-notification-url";

const BOOKING = "98945c09-4964-488e-a9eb-d2df1918c109";
const GROUP = "50604050-1111-4111-8111-111111111111";
const CLIENT = "0350ad64-f317-4464-9a19-6c39be1f1255";

describe("deriveProviderPortalNotificationUrl", () => {
  it("keeps a provider booking link, including the confirm action", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: `/provider/bookings/${BOOKING}?action=confirm`,
      }),
    ).toBe(`/provider/bookings/${BOOKING}?action=confirm`);
  });

  it("sends a customer booking path to the provider booking", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: `/account-settings/bookings/${BOOKING}`,
      }),
    ).toBe(`/provider/bookings/${BOOKING}`);
  });

  it("sends an app booking path to the provider booking", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: `/(app)/(tabs)/more/bookings/${BOOKING}?action=confirm`,
      }),
    ).toBe(`/provider/bookings/${BOOKING}?action=confirm`);
  });

  it("sends subscription reminders to the provider subscription page", () => {
    expect(
      deriveProviderPortalNotificationUrl({ link: "/settings/subscription" }),
    ).toBe("/provider/subscription");
    expect(
      deriveProviderPortalNotificationUrl({ link: "/provider/subscription" }),
    ).toBe("/provider/subscription");
  });

  it("opens a group booking from a deep link that has no page", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: `/provider/group-bookings/${GROUP}`,
      }),
    ).toBe(`/provider/group-bookings?open_group_id=${GROUP}`);
  });

  it("opens the client list for a client id, because there is no client detail route", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        data: { client_id: CLIENT },
      }),
    ).toBe(`/provider/clients?client=${CLIENT}`);
  });

  it("sends low-stock alerts to the catalogue", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: "/provider/products?low_stock=true",
      }),
    ).toBe("/provider/catalogue/products?low_stock=true");
  });

  it("sends a full site booking URL to the provider booking", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: `https://www.beautonomi.co.za/bookings/${BOOKING}`,
      }),
    ).toBe(`/provider/bookings/${BOOKING}`);
  });

  it("opens the group sheet from the customer group link", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: `https://www.beautonomi.co.za/group-booking-detail?id=${GROUP}`,
      }),
    ).toBe(`/provider/group-bookings?open_group_id=${GROUP}`);
  });

  it("rewrites the close-out filter to the status the bookings list reads", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: "/provider/bookings?filter=close_out",
      }),
    ).toBe("/provider/bookings?status=close_out");
  });

  it("opens the message thread from a customer messages link", () => {
    const conversation = "8adda800-6d2e-47c8-bcab-caa2feb4f323";
    expect(
      deriveProviderPortalNotificationUrl({
        link: `/account-settings/messages?conversation=${conversation}`,
      }),
    ).toBe(`/provider/messaging?conversationId=${conversation}`);
  });

  it("uses booking_id when the stored link is an app-only path without a booking segment", () => {
    expect(
      deriveProviderPortalNotificationUrl({
        link: "/(app)/(tabs)/bookings",
        data: { booking_id: BOOKING },
      }),
    ).toBe(`/provider/bookings/${BOOKING}`);
  });
});
