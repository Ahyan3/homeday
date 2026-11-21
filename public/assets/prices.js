/* Keepsake prices in the visitor's currency, how they pay, and a switch between pesos and US dollars. */
(function () {
  "use strict";
  var H = window.Homeday, $ = H.$, usd = H.cur === "USD";
  document.querySelectorAll("[data-price]").forEach(function (el) { el.textContent = H.price(el.getAttribute("data-price")); });
  var ways = $("pay-ways");
  if (ways && usd) ways.textContent = "Made from the timeline above. Pay by Visa or Mastercard through PayMongo, our payment provider.";
  H.chargeNote("digital").then(function (t) { var n = $("charge-note"); if (n) { n.textContent = t; n.hidden = !t; } });
  document.querySelectorAll("[data-cur]").forEach(function (b) {
    var on = b.getAttribute("data-cur") === H.cur;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.addEventListener("click", function () { if (!on) H.setCur(b.getAttribute("data-cur")); });
  });
})();
