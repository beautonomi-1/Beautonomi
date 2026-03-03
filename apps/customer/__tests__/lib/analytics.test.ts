import {
  trackLogin,
  trackSignUp,
  trackLogout,
  trackBookingStarted,
  trackBookingConfirmed,
  trackPaymentFailed,
  trackSearch,
  trackProviderViewed,
  trackWishlistToggle,
  trackReviewSubmitted,
  trackPaymentMethodSelected,
  trackNotificationOpened,
} from "@/lib/analytics";

describe("analytics tracking", () => {
  it("trackLogin does not throw", () => {
    expect(() => trackLogin("email")).not.toThrow();
  });

  it("trackSignUp does not throw", () => {
    expect(() => trackSignUp("phone")).not.toThrow();
  });

  it("trackLogout does not throw", () => {
    expect(() => trackLogout()).not.toThrow();
  });

  it("trackBookingStarted does not throw", () => {
    expect(() => trackBookingStarted("p1", "Salon ABC")).not.toThrow();
  });

  it("trackBookingConfirmed does not throw", () => {
    expect(() => trackBookingConfirmed("b1", "card", 250)).not.toThrow();
  });

  it("trackPaymentFailed does not throw", () => {
    expect(() => trackPaymentFailed("Payment declined")).not.toThrow();
  });

  it("trackSearch does not throw", () => {
    expect(() => trackSearch("hair", "Hair", 10)).not.toThrow();
  });

  it("trackProviderViewed does not throw", () => {
    expect(() => trackProviderViewed("p1", "Salon ABC")).not.toThrow();
  });

  it("trackWishlistToggle does not throw", () => {
    expect(() => trackWishlistToggle("p1", true)).not.toThrow();
  });

  it("trackReviewSubmitted does not throw", () => {
    expect(() => trackReviewSubmitted("p1", 5)).not.toThrow();
  });

  it("trackPaymentMethodSelected does not throw", () => {
    expect(() => trackPaymentMethodSelected("card")).not.toThrow();
  });

  it("trackNotificationOpened does not throw", () => {
    expect(() => trackNotificationOpened("booking_reminder", { id: "1" })).not.toThrow();
  });
});
