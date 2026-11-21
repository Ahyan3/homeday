/* Homeday shared code: dates, moon, weather, number one song, database calls, timeline and poster drawing. */
(function (global) {
  "use strict";
  var SB = "https://qvdeqzdgyloqyyiqnbrh.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2ZGVxemRneWxvcXl5aXFuYnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzI5OTAsImV4cCI6MjExMDc0ODk5MH0.hE1M5lCSydmP6uogb7GdNRvHs9N0eGnZ0zhF1c31lq4";
  var DAY = 86400000;
  var H = {};

  /* ---------- small helpers ---------- */
  H.$ = function (id) { return document.getElementById(id); };
  H.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  H.num = function (n) { return n.toLocaleString("en-US"); };
  H.store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  /* ---------- region: currency, date style and units ----------
     Visitors in the Philippines see pesos; everyone else sees US dollars. US visitors also get
     US-style dates and Fahrenheit. A visitor can switch currency; the choice is remembered. */
  var TZ = "", LANG = "en";
  try { TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* old browser */ }
  try { LANG = String(navigator.language || "en").toLowerCase(); } catch (e) { /* no navigator */ }
  H.inPH = TZ === "Asia/Manila" || /-ph$/.test(LANG) || LANG === "fil";
  H.us = !H.inPH && LANG === "en-us" && TZ.indexOf("America/") === 0;
  H.locale = H.us ? "en-US" : "en-GB";
  H.cur = (function () { var c = H.store.get("homeday:cur"); return c === "PHP" || c === "USD" ? c : (H.inPH ? "PHP" : "USD"); })();
  H.setCur = function (c) { if (c === "PHP" || c === "USD") { H.store.set("homeday:cur", c); location.reload(); } };
  /* Shown prices. Charged prices live in lib/shared.js; keep them the same. */
  H.PRICES = { PHP: { digital: "₱699", gift: "₱699", print: "₱2,999", book: "₱3,999" }, USD: { digital: "US$12", gift: "US$12" } };
  H.price = function (item, cur) { var t = H.PRICES[cur || H.cur]; return (t && t[item]) || H.PRICES.PHP[item]; };
  /* How people pay. "card" = PayMongo checkout. "manual" = QR code (GCash, Maya or GoTyme), checked by
     hand, used until PayMongo is live. "off" = neither. All three are QR Ph codes, so any Philippine
     bank or e-wallet app can pay any of them; the buyer just tells us which one they used. */
  H.MANUAL_PAY = {
    on: true,
    account: "Ryan Francis Romano",
    wallets: [
      { id: "gcash", name: "GCash", qr: "/assets/pay/gcash.png" },
      { id: "maya", name: "Maya", qr: "/assets/pay/maya.png" },
      { id: "gotyme", name: "GoTyme", qr: "/assets/pay/gotyme.png" }
    ]
  };
  var payInfo = null;
  H.payInfo = function () {
    if (!payInfo) payInfo = fetch("/api/checkout").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    return payInfo;
  };
  H.payMode = function () { return H.payInfo().then(function (j) { return j.card ? "card" : H.MANUAL_PAY.on ? "manual" : "off"; }); };
  /* the line under the prices that says how this visitor will pay */
  H.chargeNote = function (item) {
    return H.payInfo().then(function (j) {
      if (!j.card && H.MANUAL_PAY.on) {
        return "Pay " + H.price(item, "PHP") + " by scanning our QR code with GCash, Maya, GoTyme or your bank's app. We check each payment by hand, usually within a few hours."
          + (H.inPH ? "" : " This needs a Philippine bank or e-wallet account; card payments from abroad open soon.");
      }
      if (H.cur !== "USD" || !j.card) return "";
      return j.usd ? "Charged in US dollars by card."
        : "Paid by card in Philippine pesos (" + H.price(item, "PHP") + "). Your bank converts it, usually to about " + H.price(item, "USD") + ".";
    });
  };
  /* weather line in the visitor's units: "Dry, 31° / 23°C" */
  H.wxLine = function (w, withRain) {
    var f = function (c) { return H.us ? Math.round(c * 9 / 5 + 32) : Math.round(c); };
    var s = w.text + ", " + f(w.hi) + "° / " + f(w.lo) + (H.us ? "°F" : "°C");
    if (withRain && w.rain >= 1) s += ", " + (H.us ? (w.rain / 25.4).toFixed(1) + " in" : Math.round(w.rain) + " mm") + " of rain";
    return s;
  };
  H.keyFor = function (id) { var m = H.store.get("homeday:keys") || {}; return m[id] || null; };
  H.rememberKey = function (id, key) { var m = H.store.get("homeday:keys") || {}; m[id] = key; H.store.set("homeday:keys", m); H.store.set("homeday:last", id); };

  /* ---------- dates (UTC calendar maths so daylight saving never shifts a day) ---------- */
  H.parse = function (v) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ""); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
  H.iso = function (d) { return d.toISOString().slice(0, 10); };
  H.today = function () { var n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };
  H.addDays = function (d, n) { return new Date(d.getTime() + n * DAY); };
  H.diff = function (a, b) { return Math.round((b - a) / DAY); };
  H.addYears = function (d, n) {
    var r = new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()));
    if (r.getUTCMonth() !== d.getUTCMonth()) r = new Date(Date.UTC(d.getUTCFullYear() + n, 2, 1));
    return r;
  };
  H.yearsBetween = function (a, b) { var y = b.getUTCFullYear() - a.getUTCFullYear(); if (H.addYears(a, y) > b) y--; return y; };
  var fLong = new Intl.DateTimeFormat(H.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  var fShort = new Intl.DateTimeFormat(H.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  var fDow = new Intl.DateTimeFormat(H.locale, { weekday: "long", timeZone: "UTC" });
  H.long = function (d) { return fLong.format(d); };
  H.short = function (d) { return fShort.format(d); };
  H.dow = function (d) { return fDow.format(d); };
  H.span = function (a, b) {
    var d = H.diff(a, b);
    if (d < 14) return d + (d === 1 ? " day" : " days");
    if (d < 84) return Math.round(d / 7) + " weeks";
    var y = H.yearsBetween(a, b);
    if (y < 1) return Math.round(d / 30.44) + " months";
    var mo = Math.floor(H.diff(H.addYears(a, y), b) / 30.44);
    return y + (y === 1 ? " year" : " years") + (mo ? " and " + mo + (mo === 1 ? " month" : " months") : "");
  };

  /* ---------- moon ---------- */
  H.moonPhase = function (d) {
    var p = ((d.getTime() + DAY / 2 - Date.UTC(2000, 0, 6, 18, 14)) / DAY / 29.530588853) % 1;
    return p < 0 ? p + 1 : p;
  };
  H.moonName = function (p) {
    if (p < 0.03 || p > 0.97) return "New moon";
    if (p < 0.22) return "Waxing crescent";
    if (p < 0.28) return "First quarter";
    if (p < 0.47) return "Waxing gibbous";
    if (p < 0.53) return "Full moon";
    if (p < 0.72) return "Waning gibbous";
    if (p < 0.78) return "Last quarter";
    return "Waning crescent";
  };
  H.moonSvg = function (p) {
    var r = 17, waning = p > 0.5, q = waning ? 1 - p : p;
    var rx = Math.abs(Math.cos(2 * Math.PI * q)) * r;
    var lit = "M0," + (-r) + " A" + r + "," + r + " 0 0 1 0," + r + " A" + rx.toFixed(2) + "," + r + " 0 0 " + (q < 0.25 ? 0 : 1) + " 0," + (-r) + " Z";
    return '<svg class="moon" viewBox="-19 -19 38 38" aria-hidden="true"><circle r="17" fill="#2b3350"/><path d="' + lit + '" fill="#F3EBC2"' +
      (waning ? ' transform="scale(-1,1)"' : "") + '/><circle r="17" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  };

  /* ---------- age rule of thumb ---------- */
  H.humanYears = function (kind, y) {
    if (kind !== "dog" && kind !== "cat") return null;
    var step = kind === "dog" ? 5 : 4;
    return Math.round(y <= 1 ? 15 * y : y <= 2 ? 15 + 9 * (y - 1) : 24 + step * (y - 2));
  };

  /* ---------- number one song (Billboard Hot 100, US) ---------- */
  var songCache = {};
  H.songFor = function (d) {
    var k = H.iso(d);
    if (!songCache[k]) songCache[k] = H.rpc("song_on", { p_date: k }).then(function (x) { return x ? { title: x.title, artist: x.artist } : null; });
    return songCache[k];
  };

  /* ---------- weather (NASA POWER, from 1981) and places (OpenStreetMap), through this site's own /api ---------- */
  var geoCache = {};
  H.geocode = function (city) {
    var k = city.toLowerCase();
    if (!geoCache[k]) geoCache[k] = fetch("/api/geocode?q=" + encodeURIComponent(city))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (g) { return g && g.lat != null ? g : null; }, function () { delete geoCache[k]; return null; });
    return geoCache[k];
  };
  /* while someone is still typing a city, wait until they pause so the free lookup isn't flooded */
  var geoTimer = 0;
  H.geocodeSoon = function (city) {
    return new Promise(function (res) { clearTimeout(geoTimer); geoTimer = setTimeout(function () { res(H.geocode(city)); }, 900); });
  };
  H.weatherOn = function (lat, lon, d) {
    return fetch("/api/weather?lat=" + lat + "&lon=" + lon + "&date=" + H.iso(d))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (w) {
        if (!w || w.hi == null) return null;
        var rain = w.rain || 0;
        return { text: rain >= 10 ? "Heavy rain" : rain >= 1 ? "Some rain" : "Dry", hi: w.hi, lo: w.lo, rain: rain };
      });
  };

  /* ---------- database ---------- */
  H.rpc = function (name, args) {
    return fetch(SB + "/rest/v1/rpc/" + name, {
      method: "POST", headers: { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json" }, body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = t ? JSON.parse(t) : null;
        if (!r.ok) { var e = new Error((j && j.message) || "Request failed"); e.status = r.status; throw e; }
        return j;
      });
    });
  };
  H.photoUrl = function (path) { return /^(blob:|data:|https?:)/.test(path) ? path : SB + "/storage/v1/object/public/photos/" + path; };
  function rid(n) { var a = "abcdefghjkmnpqrstuvwxyz23456789", s = "", b = crypto.getRandomValues(new Uint8Array(n)); for (var i = 0; i < n; i++) s += a[b[i] % a.length]; return s; }
  H.shrink = function (file) {
    /* resize to at most 1600px on the long side, as JPEG */
    return createImageBitmap(file).then(function (bmp) {
      var k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error("resize")); }, "image/jpeg", 0.85); });
    });
  };
  H.uploadPhotos = function (files, onStep) {
    var folder = rid(12), out = [], i = 0;
    function next() {
      if (i >= files.length) return Promise.resolve(out);
      var f = files[i++];
      if (onStep) onStep(i, files.length);
      return H.shrink(f).then(function (blob) {
        var path = "u/" + folder + "/" + rid(10) + ".jpg";
        return fetch(SB + "/storage/v1/object/photos/" + path, {
          method: "POST", headers: { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "image/jpeg", "x-upsert": "false" }, body: blob
        }).then(function (r) { if (!r.ok) throw new Error("A photo could not be uploaded."); out.push(path); });
      }).then(next);
    }
    return next();
  };

  /* ---------- timeline ---------- */
  function stop(date, title, body, cls) {
    return '<li class="stop ' + (cls || "") + '"><div class="when"><b>' + H.dow(date) + "</b> " + H.long(date) + '</div><div class="what"><h3>' + title + "</h3>" + body + "</div></li>";
  }
  function frames(list, startTilt) {
    var tilts = [-2.5, 1.8, -1.2, 2.6];
    return '<li class="stop pics"><div class="when"></div><div class="what"><div class="frames">' + list.map(function (u, i) {
      return '<div class="frame" style="--r:' + tilts[(i + startTilt) % 4] + 'deg"><img src="' + H.esc(H.photoUrl(u)) + '" alt="Photo ' + (i + 1 + startTilt) + '" loading="lazy"></div>';
    }).join("") + "</div></div></li>";
  }

  /* s: {name, kind, home, birth, city, memorial, passed, photos[]}; returns {html, days, years, end} */
  H.timeline = function (s, showEmptyPhotos) {
    var t = H.today(), end = s.memorial ? s.passed : t, n = H.esc(s.name), past = s.memorial;
    var days = H.diff(s.home, end), photos = s.photos || [];
    var ev = [], p = H.moonPhase(s.home);
    var homeBody = "<p>" + (s.birth && H.diff(s.birth, s.home) > 0
      ? n + " was " + H.span(s.birth, s.home) + " old on the day " + (past ? "your life together began." : "everything changed.")
      : "The first day of your life together.") + "</p>" +
      '<ul class="facts">' +
      '<li>' + H.moonSvg(p) + '<span><span class="k">Moon that night</span>' + H.moonName(p) + "</span></li>" +
      '<li class="live" data-live="weather"><span><span class="k">Weather' + (s.city ? " in " + H.esc(s.city) : "") + '</span><span class="v">' + (s.city ? "Looking it up…" : "Add a city to see it") + "</span></span></li>" +
      '<li class="live" data-live="song"><span><span class="k">Number one in the US</span><span class="v">Looking it up…</span></span></li>' +
      "</ul>";
    if (s.birth && H.diff(s.birth, s.home) > 0) ev.push({ d: s.birth, h: stop(s.birth, n + " was born", "<p>Before you knew each other.</p>") });
    ev.push({ d: s.home, h: stop(s.home, "The day " + n + " came home", homeBody) });
    ev.push({ d: H.addDays(s.home, 0.5), photo: true });
    [[7, "First week home", "Seven days in. The house already worked differently."],
     [100, "100 days together", "Long enough to have routines neither of you agreed to."],
     [1000, "1,000 days together", "A thousand mornings."]].forEach(function (m) {
      ev.push({ d: H.addDays(s.home, m[0]), h: stop(H.addDays(s.home, m[0]), m[1], "<p>" + m[2] + "</p>") });
    });
    var yrs = H.yearsBetween(s.home, end), shown = [1, 2, 3, 5, 10, 15, 20];
    for (var y = 1; y <= yrs; y++) {
      if (shown.indexOf(y) < 0 && y !== yrs) continue;
      var ad = H.addYears(s.home, y), age = s.birth ? H.yearsBetween(s.birth, ad) : null;
      ev.push({ d: ad, h: stop(ad, y === 1 ? "First homeday" : y + " years home", "<p>" + (y === 1 ? "One full year since " + n + " came home." : "Homeday number " + y + ".") + (age !== null && age > 0 ? " " + n + " was " + age + "." : "") + "</p>") });
    }
    var topK = Math.floor(days / 1000) * 1000;
    if (topK > 1000) ev.push({ d: H.addDays(s.home, topK), h: stop(H.addDays(s.home, topK), H.num(topK) + " days together", "<p>Another thousand, mostly ordinary, which is the point.</p>") });
    ev = ev.filter(function (e) { return e.d <= end; }).sort(function (a, b) { return a.d - b.d; });

    var html = "", used = 0, rows = Math.ceil(photos.length / 3), slots = Math.max(1, ev.length - 1), row = 0;
    ev.forEach(function (e, i) {
      if (e.photo) {
        if (!photos.length && showEmptyPhotos) html += '<li class="stop pics"><div class="when"></div><div class="what"><div class="frames"><div class="frame empty">Your photos<br>go here</div><div class="frame empty" style="--r:1.8deg">Add them in<br>the form above</div></div></div></li>';
        return;
      }
      html += e.h;
      while (row < rows && row < Math.round((i + 1) * rows / slots)) { html += frames(photos.slice(used, used + 3), used); used += 3; row++; }
    });
    while (used < photos.length) { html += frames(photos.slice(used, used + 3), used); used += 3; }

    var bit = "";
    if (s.birth) {
      var ay = H.diff(s.birth, end) / 365.25, hy = H.humanYears(s.kind, ay);
      bit = n + (past ? " lived " : " is ") + H.span(s.birth, end) + (past ? "" : " old") + (hy !== null && ay >= 0.5 ? ", about " + hy + " in human years by the usual rule of thumb" : "") + ".";
    }
    var facts = '<ul class="facts"><li><span><span class="k">Weekends together</span>' + H.num(Math.floor(days / 7)) + "</span></li>" +
      (s.kind === "dog" ? '<li><span><span class="k">Walks, at two a day</span>about ' + H.num(days * 2) + "</span></li>" : "") +
      '<li><span><span class="k">Homedays celebrated</span>' + yrs + "</span></li></ul>";
    if (past) {
      html += stop(end, "The day you said goodbye", "<p>" + bit + " You were together for " + H.num(days) + " days.</p>" + facts, "now");
    } else {
      html += stop(end, "Today", "<p>" + (bit ? bit + " " : "") + "Day " + H.num(days) + " with you.</p>" + facts, "now");
      var nextA = H.addYears(s.home, yrs + 1), nextK = H.addDays(s.home, (Math.floor(days / 1000) + 1) * 1000);
      [{ d: nextA, h: stop(nextA, yrs + 1 === 1 ? "First homeday" : "Homeday number " + (yrs + 1), "<p>In " + H.num(H.diff(t, nextA)) + " days. Worth a treat.</p>", "ahead") },
       { d: nextK, h: stop(nextK, "Day " + H.num(H.diff(s.home, nextK)), "<p>In " + H.num(H.diff(t, nextK)) + " days.</p>", "ahead") }]
        .sort(function (a, b) { return a.d - b.d; }).forEach(function (x) { html += x.h; });
    }
    return { html: html, days: days, years: yrs, end: end };
  };

  /* fill the weather and song slots after the timeline is on the page */
  var liveToken = 0;
  H.fillLive = function (root, s, coords) {
    var token = ++liveToken;
    function put(kind, text) {
      if (token !== liveToken) return;
      var el = root.querySelector('[data-live="' + kind + '"] .v'); if (el) el.textContent = text;
    }
    H.songFor(s.home).then(function (x) { put("song", x ? "“" + x.title + "”, " + x.artist : "The chart started in 1958"); }, function () { put("song", "Unavailable right now"); });
    if (!s.city) return Promise.resolve(null);
    var c = coords && coords.lat != null ? Promise.resolve(coords) : H.geocodeSoon(s.city);
    return c.then(function (g) {
      if (!g) { put("weather", "We couldn't find that city"); return null; }
      if (s.home < new Date(Date.UTC(1981, 0, 1))) { put("weather", "Records start in 1981"); return g; }
      return H.weatherOn(g.lat, g.lon, s.home).then(function (w) {
        put("weather", w ? H.wxLine(w, true) : "No record for that day yet");
        return g;
      });
    }).catch(function () { put("weather", "Unavailable right now"); return null; });
  };

  /* ---------- poster art: the walk together, one dot per year ---------- */
  H.posterSvg = function (days, yrs, home, past) {
    var pts = [], dots = "", N = 120, total = Math.max(days, 1);
    var at = function (f) { return [150 + 104 * Math.sin(f * Math.PI * 3.2 + 0.6) * (0.55 + 0.45 * f), 18 + f * 214]; };
    for (var i = 0; i <= N; i++) { var q = at(i / N); pts.push(q[0].toFixed(1) + "," + q[1].toFixed(1)); }
    for (var k = 1; k <= yrs; k++) { var c = at(H.diff(home, H.addYears(home, k)) / total); dots += '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="4.2" fill="#14302A"/>'; }
    var a0 = at(0), a1 = at(1);
    return '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#14302A" stroke-width="2.2" stroke-dasharray="1 7" stroke-linecap="round"/>' + dots +
      '<circle cx="' + a0[0].toFixed(1) + '" cy="' + a0[1].toFixed(1) + '" r="6" fill="#fff" stroke="#14302A" stroke-width="2.2"/>' +
      '<circle cx="' + a1[0].toFixed(1) + '" cy="' + a1[1].toFixed(1) + '" r="9" fill="' + (past ? "#F1E7A8" : "#D3E24A") + '" stroke="#14302A" stroke-width="2.2"/>';
  };

  /* database row -> timeline input */
  H.fromRow = function (r) {
    return { id: r.id, name: r.name, kind: r.kind, home: H.parse(r.home_date), birth: H.parse(r.birth_date), city: r.city || "",
      memorial: !!r.memorial, passed: H.parse(r.passed_date), photos: r.photos || [], lat: r.lat, lon: r.lon, paid: !!r.paid, owner: !!r.owner };
  };

  global.Homeday = H;
})(window);
