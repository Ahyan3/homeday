/* Keepsake prices in the visitor's currency, how they pay, and a switch between pesos and US dollars.
   While payments are by QR code (before PayMongo is live), everyone sees peso prices. */
(function () {
  "use strict";
  var H = window.Homeday, $ = H.$;
  function show(cur) { document.querySelectorAll("[data-price]").forEach(function (el) { el.textContent = H.price(el.getAttribute("data-price"), cur); }); }
  show(H.cur);
  var ways = $("pay-ways"), sw = document.querySelector(".cur-switch");
  if (ways && H.cur === "USD") ways.textContent = H.t("Made from the timeline above. Pay by Visa or Mastercard through PayMongo, our payment provider.");
  H.payMode().then(function (mode) {
    show(H.cur);  /* again, now that we know whether the price test is running */
    if (mode !== "manual") return;
    show("PHP");
    if (ways) ways.textContent = H.t("Made from the timeline above. Pay with GCash, Maya, GoTyme or your bank's app by scanning our QR code.");
    if (sw) sw.hidden = true;
  });
  H.chargeNote("digital").then(function (t) { var n = $("charge-note"); if (n) { n.textContent = t; n.hidden = !t; } });
  document.querySelectorAll("[data-cur]").forEach(function (b) {
    var on = b.getAttribute("data-cur") === H.cur;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.addEventListener("click", function () { if (!on) H.setCur(b.getAttribute("data-cur")); });
  });
})();
