/**
 * Beautonomi booking embed
 *
 * Button (default): opens the booking page in a new tab.
 * Iframe: mounts the express widget on the host page and listens for resize /
 * payment / auth breakout messages.
 *
 * WordPress, Wix, and GTM often run this file without document.currentScript
 * (async/defer, delayed JS, injected tags). We fall back to the last
 * booking-button.js script that has data-provider.
 *
 * <script src="https://app.example/embed/booking-button.js"
 *   data-provider="your-slug"
 *   data-mode="iframe"
 *   data-target="#beautonomi-booking-widget"
 *   data-utm-source="website"></script>
 */
(function () {
  function findScript() {
    if (document.currentScript && document.currentScript.getAttribute) {
      return document.currentScript;
    }
    var nodes = document.querySelectorAll('script[src*="booking-button.js"][data-provider]');
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  var script = findScript();
  if (!script || !script.getAttribute) return;

  var provider = (script.getAttribute("data-provider") || "").trim();
  var utmSource = script.getAttribute("data-utm-source") || "";
  var mode = (script.getAttribute("data-mode") || "button").toLowerCase();
  var targetSel = script.getAttribute("data-target");
  var heightRaw = parseInt(script.getAttribute("data-height") || "800", 10);
  var height = Number.isFinite(heightRaw) ? Math.min(2400, Math.max(400, heightRaw)) : 800;
  var scriptSrc = script.getAttribute("src") || script.src || "";
  var baseUrl = scriptSrc.replace(/\/embed\/booking-button\.js(\?.*)?$/i, "");

  if (!provider) {
    console.warn("[Beautonomi] data-provider is required");
    return;
  }

  var params = new URLSearchParams();
  if (mode === "iframe") params.set("embed", "1");
  if (utmSource) params.set("utm_source", utmSource);
  var url = baseUrl + "/book/" + encodeURIComponent(provider);
  if (params.toString()) url += "?" + params.toString();

  var iframe = null;
  var allowedOrigin = "";
  try {
    allowedOrigin = new URL(baseUrl, window.location.href).origin;
  } catch (e) {
    allowedOrigin = "";
  }

  function openBooking(event) {
    if (event && event.preventDefault) event.preventDefault();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function navigateHost(nextUrl) {
    if (!nextUrl || !/^https?:\/\//i.test(nextUrl)) return;
    try {
      if (window.top) {
        window.top.location.href = nextUrl;
        return;
      }
    } catch (err) {
      /* cross-origin top; fall through */
    }
    window.location.href = nextUrl;
  }

  function handleMessage(event) {
    if (!event || event.origin !== allowedOrigin || !event.data) return;
    var data = event.data;
    if (data.source !== "beautonomi-booking-embed") return;
    if (data.type === "resize" && iframe && typeof data.height === "number") {
      var next = Math.min(2400, Math.max(400, Math.round(data.height)));
      iframe.style.height = next + "px";
      iframe.setAttribute("height", String(next));
    }
    if ((data.type === "payment_redirect" || data.type === "auth_required") && typeof data.url === "string") {
      navigateHost(data.url);
    }
    if (data.type === "booked") {
      try {
        document.dispatchEvent(new CustomEvent("beautonomi:booked", { detail: data }));
      } catch (err) {
        /* CustomEvent unavailable */
      }
    }
  }

  function mountIframe() {
    var host = targetSel ? document.querySelector(targetSel) : null;
    if (!host) {
      host = document.createElement("div");
      host.id = "beautonomi-booking-widget";
      if (script.parentNode) script.parentNode.insertBefore(host, script.nextSibling);
      else document.body.appendChild(host);
    }
    if (host.getAttribute("data-beautonomi-mounted") === "1") return;
    if (host.querySelector("iframe.beautonomi-booking-iframe")) return;
    host.setAttribute("data-beautonomi-mounted", "1");
    iframe = document.createElement("iframe");
    iframe.className = "beautonomi-booking-iframe";
    iframe.src = url;
    iframe.title = "Book an appointment";
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("allow", "payment *; clipboard-write");
    iframe.width = "100%";
    iframe.height = String(height);
    iframe.style.cssText =
      "width:100%;border:0;border-radius:12px;min-height:" + height + "px;height:" + height + "px;";
    host.appendChild(iframe);
    window.addEventListener("message", handleMessage);
  }

  function initButtons() {
    var btn = document.getElementById("beautonomi-book-now");
    if (btn && !btn.getAttribute("data-beautonomi-bound")) {
      btn.setAttribute("data-beautonomi-bound", "1");
      btn.addEventListener("click", openBooking);
    }
    document.querySelectorAll("[data-beautonomi-book]").forEach(function (el) {
      if (el.getAttribute("data-beautonomi-bound") === "1") return;
      el.setAttribute("data-beautonomi-bound", "1");
      el.addEventListener("click", openBooking);
    });
  }

  function init() {
    if (mode === "iframe") mountIframe();
    else initButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
