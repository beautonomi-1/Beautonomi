/**
 * Beautonomi Booking Button Embed
 * Add to any website to let visitors book with your provider.
 *
 * Usage:
 * <script src="https://your-app.com/embed/booking-button.js"
 *   data-provider="your-provider-slug"
 *   data-utm-source="website">
 * </script>
 * <button id="beautonomi-book-now">Book Now</button>
 */
(function () {
  const script = document.currentScript;
  const provider = script.getAttribute("data-provider");
  const utmSource = script.getAttribute("data-utm-source") || "";
  const baseUrl = script.src.replace(/\/embed\/booking-button\.js.*$/, "");

  if (!provider) {
    console.warn("[Beautonomi] data-provider is required");
    return;
  }

  let url = baseUrl + "/book/" + encodeURIComponent(provider);
  const params = new URLSearchParams();
  if (utmSource) params.set("utm_source", utmSource);
  if (params.toString()) url += "?" + params.toString();

  function openBooking() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function init() {
    const btn = document.getElementById("beautonomi-book-now");
    if (btn) btn.addEventListener("click", openBooking);
    document.querySelectorAll("[data-beautonomi-book]").forEach(function (el) {
      el.addEventListener("click", openBooking);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
