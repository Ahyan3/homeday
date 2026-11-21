/* Keepsake page: shows the poster and certificate, watermarked until paid, and opens checkout. */
(function () {
  "use strict";
  var H = window.Homeday, $ = H.$;
  var m = /^\/keepsake\/([a-z0-9]{6,12})\/?$/.exec(location.pathname);
  var id = m && m[1], s = null, tries = 0;
  if (!id) { $("ks-lead").textContent = "This link is missing the timeline. Open the keepsake from your timeline page."; return; }
  $("back-link").href = "/t/" + id;
  $("buy-btn").textContent = "Buy the keepsake, " + H.price("digital");

  function draw() {
    var end = s.memorial ? s.passed : H.today(), days = H.diff(s.home, end), yrs = H.yearsBetween(s.home, end), len = s.name.length;
    $("p-name").textContent = s.name;
    $("p-name").style.fontSize = (len <= 5 ? 5.6 : len <= 9 ? 4 : len <= 14 ? 2.8 : 2.1) + "rem";
    $("p-art").innerHTML = H.posterSvg(days, yrs, s.home, s.memorial);
    $("p-left").innerHTML = "Came home<br>" + H.short(s.home);
    $("p-right").innerHTML = H.num(days) + " days<br>" + (s.memorial ? "until " + H.short(end) : "and counting");
    $("c-kicker").textContent = s.memorial ? "In loving memory" : "Certificate of homecoming";
    $("c-name").textContent = s.name;
    $("c-line").textContent = s.name + " came home on " + H.long(s.home) + (s.city ? " in " + s.city : "") + (s.memorial ? " and was loved every day until " + H.long(end) + "." : ", and has been home ever since.");
    $("c-dow").textContent = H.dow(s.home);
    $("c-moon").textContent = H.moonName(H.moonPhase(s.home));
    $("c-days-k").textContent = s.memorial ? "Days together" : "Days together so far";
    $("c-days").textContent = H.num(days);
    $("c-years").textContent = yrs;
    $("c-seal").textContent = s.home.getUTCFullYear();
    $("c-url").textContent = location.host + "/t/" + id;
    H.songFor(s.home).then(function (x) { $("c-song").textContent = x ? "“" + x.title + "”, " + x.artist : "Before the chart began"; }, function () { $("c-song").textContent = "Unavailable"; });
    if (!s.city) $("c-weather").textContent = "No city given";
    else (s.lat != null ? Promise.resolve({ lat: s.lat, lon: s.lon }) : H.geocode(s.city)).then(function (g) {
      return g ? H.weatherOn(g.lat, g.lon, s.home) : null;
    }).then(function (w) { $("c-weather").textContent = w ? H.wxLine(w) : "No record for that day"; }, function () { $("c-weather").textContent = "Unavailable"; });
  }

  function load() {
    H.rpc("get_timeline", { p_id: id, p_key: H.keyFor(id) }).then(function (row) {
      if (!row) { $("ks-lead").textContent = "We couldn't find that timeline. Check the link and try again."; return; }
      s = H.fromRow(row);
      $("ks-title").textContent = s.memorial ? "Keepsake for " + s.name : s.name + "’s keepsake";
      $("sheets").hidden = false;
      document.body.classList.toggle("paid", s.paid);
      draw();
      if (s.paid) {
        $("ks-lead").textContent = "Your poster and certificate are ready. Print them, or choose “Save as PDF” in the print window to keep a file.";
        $("print-btn").hidden = false; $("buy-btn").hidden = true; $("ks-note").textContent = "";
      } else if (new URLSearchParams(location.search).has("paid") && tries < 12) {
        $("ks-lead").textContent = "Payment received. Your keepsake unlocks in a few seconds…";
        tries++; setTimeout(load, 5000);
      } else {
        $("ks-lead").textContent = "This is a preview. Buy the keepsake to print the poster and certificate without the watermark.";
        $("buy-btn").hidden = false;
        H.rpc("manual_pending", { p_id: id }).then(function (waiting) {
          if (!waiting) return;
          $("ks-lead").textContent = "We're checking your payment. This page unlocks by itself once it's confirmed, and we'll email you.";
          $("buy-btn").hidden = true;
          setTimeout(load, 60000);
        }, function () { /* preview still works */ });
        H.chargeNote("digital").then(function (t) { $("ks-charge").textContent = t; $("ks-charge").hidden = !t; });
        if (tries >= 12) $("ks-note").textContent = "We haven't received confirmation of your payment yet. Refresh this page in a minute. If it still doesn't unlock, email us your PayMongo receipt and we'll sort it out.";
      }
    }).catch(function () { $("ks-lead").textContent = "The keepsake didn't load. Check your connection and refresh the page."; });
  }
  $("print-btn").addEventListener("click", function () { window.print(); });
  $("buy-btn").addEventListener("click", function () {
    var b = $("buy-btn"); b.disabled = true;
    H.payMode().then(function (mode) {
      b.disabled = false;
      if (mode === "manual") { H.openManual(id, "digital", $("ks-manual")); return; }
      if (mode === "off") { $("ks-note").textContent = "Keepsakes go on sale soon. Come back to this page any time."; return; }
      card(b);
    });
  });
  function card(b) {
    b.disabled = true; $("ks-note").textContent = "Opening checkout…";
    fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeline_id: id, item: "digital", currency: H.cur }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.url) throw new Error(j.error || "Checkout didn't open."); return j.url; }); })
      .then(function (url) { H.store.set("homeday:last", id); location.href = url; })
      .catch(function (e) { b.disabled = false; $("ks-note").textContent = e.message; });
  }
  load();
})();
