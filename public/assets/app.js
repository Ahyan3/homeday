(function () {
  "use strict";
  var H = window.Homeday, $ = H.$;
  var mode = "make";          /* make | edit | view */
  var current = null;         /* saved timeline when editing or viewing */
  var editKey = null;
  var photoFiles = [], previewUrls = [], keptPhotos = [];
  var lastGeo = { city: null, g: null };
  var touched = false, saving = false;

  /* ---------- form ---------- */
  function read() {
    return {
      name: $("pet-name").value.trim() || H.t("Your pet"),
      kind: $("pet-kind").value,
      home: H.parse($("home-date").value),
      birth: H.parse($("birth-date").value),
      city: $("home-city").value.trim(),
      memorial: $("is-memorial").checked,
      passed: H.parse($("passed-date").value),
      photos: previewUrls.length ? previewUrls : keptPhotos
    };
  }
  function validate(s) {
    var t = H.today();
    if (!$("pet-name").value.trim()) return H.t("Enter their name.");
    if (!s.home) return H.t("Enter the day they came home. That date is what the timeline is built from.");
    if (s.home > t) return H.t("The day they came home is in the future. Pick today or an earlier date.");
    if (s.birth && s.birth > s.home) return H.t("Their birthday is after the day they came home. Change one of the two dates.");
    if (s.memorial) {
      if (!s.passed) return H.t("Enter the day you said goodbye, or untick the memorial box.");
      if (s.passed < s.home) return H.t("The day you said goodbye is before the day they came home. Change one of the two dates.");
      if (s.passed > t) return H.t("The day you said goodbye is in the future. Pick today or an earlier date.");
    }
    return "";
  }
  function fillForm(r) {
    $("pet-name").value = r.name; $("pet-kind").value = r.kind;
    $("home-date").value = H.iso(r.home); $("birth-date").value = r.birth ? H.iso(r.birth) : "";
    $("home-city").value = r.city || ""; $("is-memorial").checked = r.memorial;
    $("passed-field").hidden = !r.memorial; $("passed-date").value = r.passed ? H.iso(r.passed) : "";
    keptPhotos = r.photos.slice();
    $("photo-count").textContent = keptPhotos.length ? H.t("{n} saved photos. Adding new ones replaces them.", { n: keptPhotos.length }) : H.t("Up to 12.");
    if (r.lat != null) lastGeo = { city: r.city, g: { lat: r.lat, lon: r.lon } };
  }

  /* ---------- drawing ---------- */
  function render(s) {
    var tl = H.timeline(s, mode !== "view" && !s.photos.length);
    var past = s.memorial, raw = s.name.slice(0, 16), len = raw.length;
    $("tag-name").textContent = raw;
    $("tag-name").style.fontSize = (len <= 5 ? 2.1 : len <= 8 ? 1.6 : len <= 12 ? 1.15 : 0.92) + "rem";
    $("tag-days").textContent = H.t(tl.days === 1 ? "{n} day" : "{n} days", { n: H.num(tl.days) });
    $("tag-since").textContent = H.t(past ? "loved since {d}" : "home since {d}", { d: H.short(s.home) });

    $("example-chip").hidden = touched || mode !== "make";
    $("story-title").textContent = H.t(past ? "In memory of {n}" : "{n}’s life with you", { n: s.name });
    $("story-count").innerHTML = H.num(tl.days) + "<small>" + (s.city ? H.t(tl.days === 1 ? "day together in {city}" : "days together in {city}", { city: H.esc(s.city) }) : H.t(tl.days === 1 ? "day together" : "days together")) + "</small>";
    $("timeline").classList.toggle("dusk", past);
    $("walk").innerHTML = tl.html;
    $("closing").textContent = past ? H.t("Loved for {d} days, and after.", { d: H.num(tl.days) }) : "";
    $("closing").hidden = !past;

    $("poster-name").textContent = s.name;
    $("poster-name").style.fontSize = "clamp(1.6rem, " + (len <= 5 ? 13 : len <= 9 ? 9 : 6) + "cqw, " + (len <= 5 ? 4.6 : len <= 9 ? 3.2 : 2.2) + "rem)";
    $("poster-art").innerHTML = H.posterSvg(tl.days, tl.years, s.home, past);
    $("poster-left").innerHTML = H.t("Came home") + "<br>" + H.short(s.home);
    $("poster-right").innerHTML = H.t("{d} days", { d: H.num(tl.days) }) + "<br>" + (past ? H.t("until {d}", { d: H.short(tl.end) }) : H.t("and counting"));

    var coords = lastGeo.city === s.city ? lastGeo.g : null;
    H.fillLive($("walk"), s, coords).then(function (g) { if (g && s.city) lastGeo = { city: s.city, g: g }; });
  }

  var liveTimer = 0;
  function update(scroll) {
    var s = read(), e = validate(s);
    $("form-error").textContent = e;
    if (e) return false;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { render(s); }, scroll ? 0 : 350); /* wait for typing to pause before looking up weather */
    if (scroll) { $("timeline").scrollIntoView(); $("story-title").focus({ preventScroll: true }); }
    $("savebar").hidden = !(touched || mode === "edit");
    return true;
  }
  function nudge() { var r = $("tagrig"); r.classList.remove("nudge"); void r.offsetWidth; r.classList.add("nudge"); }
  function touch() { if (!touched) { touched = true; $("example-chip").hidden = true; } }

  /* ---------- saving ---------- */
  function status(t) { $("save-status").textContent = t; }
  function save(stay) {
    if (saving) return Promise.reject(new Error("busy"));
    var s = read(), e = validate(s);
    if (e) { $("form-error").textContent = e; $("make").scrollIntoView(); return Promise.reject(new Error(e)); }
    saving = true; $("save-btn").disabled = true; $("make-btn").disabled = true;
    var photosP = photoFiles.length
      ? H.uploadPhotos(photoFiles, function (i, n) { status(H.t("Uploading photo {i} of {n}…", { i: i, n: n })); })
      : Promise.resolve(keptPhotos);
    var geoP = !s.city ? Promise.resolve(null) : lastGeo.city === s.city && lastGeo.g ? Promise.resolve(lastGeo.g) : H.geocode(s.city).catch(function () { return null; });
    return Promise.all([photosP, geoP]).then(function (r) {
      if (stay) keptPhotos = r[0];
      status(H.t("Saving…"));
      var payload = { name: s.name, kind: s.kind, home_date: H.iso(s.home), birth_date: s.birth ? H.iso(s.birth) : "", city: s.city,
        lat: r[1] ? r[1].lat : null, lon: r[1] ? r[1].lon : null, memorial: s.memorial, passed_date: s.memorial && s.passed ? H.iso(s.passed) : "", photos: r[0] };
      if (mode === "edit") {
        return H.rpc("update_timeline", { p_id: current.id, p_key: editKey, p: payload }).then(function (ok) {
          if (!ok) throw new Error("This browser doesn't have the edit link for that timeline");
          return { id: current.id, key: editKey };
        });
      }
      return H.rpc("create_timeline", { p: payload });
    }).then(function (res) {
      H.rememberKey(res.id, res.key);
      if (stay) {
        saving = false; $("save-btn").disabled = false; $("make-btn").disabled = false;
        photoFiles = []; /* photos are uploaded; edits from here update this timeline */
        if (mode !== "edit") { mode = "edit"; current = { id: res.id }; editKey = res.key; $("save-btn").textContent = H.t("Save changes"); }
        status(H.t("Saved. Your link: {url}", { url: location.origin + "/t/" + res.id }));
        return res.id;
      }
      location.href = "/t/" + res.id + (mode === "edit" ? "" : "?saved=1");
    }, function (err) {
      saving = false; $("save-btn").disabled = false; $("make-btn").disabled = false;
      status(H.t("Saving didn't work: {why}. Check your connection and press Save again.", { why: err && err.message ? err.message : H.t("unknown error") }));
      throw err;
    });
  }

  /* ---------- checkout (PayMongo) ---------- */
  var ITEMS = { digital: "Digital keepsake", print: "Framed print", book: "Memory book", gift: "Gift keepsake" };
  var PHYSICAL = { print: true, book: true }, pendingItem = null, paying = false;
  function priceButtons(on) { document.querySelectorAll(".price button, #ship-go").forEach(function (b) { b.disabled = !on; }); }
  function checkout(item, shipping) {
    if (paying) return;
    var note = $("checkout-note");
    paying = true; priceButtons(false);
    var go = function (id) {
      return H.payMode().then(function (mode) {
        if (mode === "manual") { note.textContent = ""; paying = false; priceButtons(true); H.openManual(id, item, $("manual-pay")); return; }
        if (mode === "off") throw new Error(H.t("Keepsakes go on sale soon. Your timeline is saved, so come back to it any time."));
        return card(id);
      });
    };
    var card = function (id) {
      note.textContent = H.t("Opening checkout…");
      return fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeline_id: id, item: item, shipping: shipping, currency: H.cur }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.url) throw new Error(j.error || H.t("Checkout didn't open. Try again in a minute.")); return j.url; }); })
        .then(function (url) { H.store.set("homeday:last", id); location.href = url; });
    };
    var p;
    if (mode === "view") p = go(current.id);
    else { note.textContent = H.t("Saving your timeline first, so the keepsake is made from it…"); p = save(true).then(go); }
    p.catch(function (e) {
      paying = false; priceButtons(true);
      note.textContent = e && e.message && !/busy/.test(e.message) ? e.message : H.t("Checkout didn't open. Fix anything marked in the form and try again.");
    });
  }
  function buy(item) {
    $("checkout-note").textContent = "";
    if (PHYSICAL[item]) {
      pendingItem = item;
      $("ship-title").textContent = ITEMS[item] + ": where should we send it?";
      $("ship-error").textContent = "";
      $("ship-form").hidden = false; $("ship-title").focus();
      return;
    }
    $("ship-form").hidden = true;
    checkout(item, null);
  }
  $("ship-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = function (id) { return $(id).value.trim(); };
    var ship = { name: v("ship-name"), phone: v("ship-phone"), line1: v("ship-line1"), line2: v("ship-line2"), city: v("ship-city"), province: v("ship-province"), postal: v("ship-postal") };
    var missing = [["ship-name", "your full name"], ["ship-phone", "a mobile number"], ["ship-line1", "the street address"], ["ship-city", "the city or municipality"], ["ship-province", "the province"]]
      .filter(function (f) { return !v(f[0]); });
    if (missing.length) { $("ship-error").textContent = "Enter " + missing[0][1] + "."; $(missing[0][0]).focus(); return; }
    if (!/^[0-9+()\-\s]{7,20}$/.test(ship.phone)) { $("ship-error").textContent = "Enter the mobile number as digits, like 0917 123 4567."; $("ship-phone").focus(); return; }
    if (!/^\d{4}$/.test(ship.postal)) { $("ship-error").textContent = "Enter the 4-digit ZIP code."; $("ship-postal").focus(); return; }
    $("ship-error").textContent = "";
    checkout(pendingItem, ship);
  });
  $("ship-cancel").addEventListener("click", function () { $("ship-form").hidden = true; pendingItem = null; });

  /* ---------- guestbook ---------- */
  function entryHtml(x, owner) {
    var when = new Date(x.created_at).toLocaleDateString(H.locale, { day: "numeric", month: "long", year: "numeric" });
    return '<li class="entry" data-id="' + x.id + '"><p class="msg">' + H.esc(x.message) + '</p><p class="by"><b>' + H.esc(x.author) + "</b> " + when +
      (owner ? ' <button type="button" class="linkish" data-hide="' + x.id + '">' + H.t("Hide") + '</button>' : "") + "</p></li>";
  }
  function loadGuestbook() {
    H.rpc("get_guestbook", { p_id: current.id }).then(function (list) {
      $("gb-list").innerHTML = list.length ? list.slice().reverse().map(function (x) { return entryHtml(x, current.owner); }).join("")
        : '<li class="entry empty">' + H.t("No messages yet. Be the first to write one.") + '</li>';
    }).catch(function () { $("gb-list").innerHTML = '<li class="entry empty">' + H.t("The guestbook didn't load. Refresh the page to try again.") + '</li>'; });
  }

  /* ---------- view mode ---------- */
  function shareLinks(id, key) {
    var url = location.origin + "/t/" + id, s = current, msg = H.t(s.memorial ? "In memory of {n}" : "{n}’s life with us", { n: s.name });
    $("share-url").value = url;
    $("edit-url").value = key ? location.origin + "/t/" + id + "?k=" + key : "";
    $("sh-wa").href = "https://wa.me/?text=" + encodeURIComponent(msg + " " + url);
    $("sh-fb").href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
    $("sh-x").href = "https://x.com/intent/post?text=" + encodeURIComponent(msg) + "&url=" + encodeURIComponent(url);
    $("sh-mail").href = "mailto:?subject=" + encodeURIComponent(msg) + "&body=" + encodeURIComponent(url);
  }
  function startView(id) {
    mode = "view";
    document.body.className = "mode-view";
    var qs = new URLSearchParams(location.search), k = qs.get("k");
    if (k) H.rememberKey(id, k);
    var key = k || H.keyFor(id), justSaved = qs.has("saved");
    if (k || justSaved) history.replaceState(null, "", "/t/" + id);
    $("view-title").textContent = H.t("Loading…");
    H.rpc("get_timeline", { p_id: id, p_key: key }).then(function (row) {
      if (!row) { notFound(); return; }
      current = H.fromRow(row); editKey = current.owner ? key : null;
      var s = current;
      document.title = H.t(s.memorial ? "In memory of {n}" : "{n}’s life with you", { n: s.name }) + " · Homeday";
      $("view-title").textContent = H.t(s.memorial ? "In memory of {n}" : "{n}’s life with you", { n: s.name });
      $("view-lead").textContent = H.t(s.city ? "Came home on {d} in {city}." : "Came home on {d}.", { d: H.long(s.home), city: s.city }) + (s.memorial ? " " + H.t("Said goodbye on {d}.", { d: H.long(s.passed) }) : "");
      $("gb-intro").textContent = H.t(s.memorial ? "Leave a few words in memory of {n}. Everyone who has this link can read them." : "Say hello to {n}. Everyone who has this link can read the guestbook.", { n: s.name });
      if (s.lat != null) lastGeo = { city: s.city, g: { lat: s.lat, lon: s.lon } };
      render(s);
      if (current.owner) {
        $("owner-bar").hidden = false;
        $("edit-link").href = "/?edit=" + id;
        shareLinks(id, editKey);
        if (justSaved) { $("share").hidden = false; $("open-share").textContent = H.t("Hide sharing"); }
      }
      if (current.paid) { $("keepsake-ready").hidden = false; $("keepsake-link").href = "/keepsake/" + id; }
      loadGuestbook();
    }).catch(function () { $("view-title").textContent = H.t("This timeline didn't load"); $("view-lead").textContent = H.t("Check your connection and refresh the page."); });
  }
  function notFound() {
    $("view-title").textContent = H.t("We couldn't find that timeline");
    $("view-lead").textContent = H.t("The link may be missing a letter. Ask whoever sent it to copy it again.");
    ["timeline", "guestbook", "keepsakes"].forEach(function (x) { $(x).hidden = true; });
    document.querySelector(".hang").hidden = true;
  }

  /* ---------- edit mode ---------- */
  function startEdit(id) {
    var key = H.keyFor(id);
    if (!key) { location.replace("/t/" + id); return; }
    mode = "edit";
    $("hero-title").textContent = H.t("Edit the timeline");
    $("make-btn").textContent = H.t("Preview changes");
    $("save-btn").textContent = H.t("Save changes");
    $("make-note").textContent = "";
    status(H.t("Saved changes show up at the same link."));
    H.rpc("get_timeline", { p_id: id, p_key: key }).then(function (row) {
      if (!row || !row.owner) { location.replace("/t/" + id); return; }
      current = H.fromRow(row); editKey = key; touched = true;
      fillForm(current); update(false);
    });
  }

  /* ---------- events ---------- */
  $("make").addEventListener("submit", function (ev) { ev.preventDefault(); touch(); if (update(true)) nudge(); });
  ["pet-name", "pet-kind", "home-date", "birth-date", "home-city", "passed-date"].forEach(function (id) {
    $(id).addEventListener("input", function () { touch(); if (update(false) && id === "pet-name") nudge(); });
  });
  $("is-memorial").addEventListener("change", function () {
    touch(); $("passed-field").hidden = !this.checked;
    if (this.checked && !$("passed-date").value) { $("form-error").textContent = ""; $("passed-date").focus(); return; }
    update(false);
  });
  $("photos").addEventListener("change", function () {
    previewUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    var files = Array.prototype.filter.call(this.files, function (f) { return /^image\//.test(f.type) || /\.heic$/i.test(f.name); });
    photoFiles = files.slice(0, 12);
    previewUrls = photoFiles.map(function (f) { return URL.createObjectURL(f); });
    $("photo-count").textContent = photoFiles.length
      ? H.t(photoFiles.length === 1 ? "{n} photo added." : "{n} photos added.", { n: photoFiles.length }) + (files.length > 12 ? " " + H.t("Only the first 12 are used.") : "")
      : H.t("No images in that selection. Choose JPG or PNG files.");
    touch(); update(false);
  });
  $("save-btn").addEventListener("click", function () { save().catch(function () {}); });
  $("start-memorial").addEventListener("click", function () {
    $("is-memorial").checked = true; $("passed-field").hidden = false; touch();
    $("make").scrollIntoView(); $("passed-date").focus({ preventScroll: true });
  });
  document.querySelectorAll(".price button").forEach(function (b) { b.addEventListener("click", function () { buy(b.dataset.item); }); });
  $("open-share").addEventListener("click", function () {
    var open = $("share").hidden; $("share").hidden = !open; this.textContent = H.t(open ? "Hide sharing" : "Share");
  });
  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var input = $(b.dataset.copy), done = function () { b.textContent = H.t("Copied"); setTimeout(function () { b.textContent = H.t("Copy link"); }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, function () { input.select(); });
      else { input.select(); try { document.execCommand("copy"); done(); } catch (e) { /* user can copy by hand */ } }
    });
  });
  $("gb-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("gb-name").value.trim(), msg = $("gb-msg").value.trim(), err = $("gb-error");
    if (!name) { err.textContent = H.t("Enter your name."); $("gb-name").focus(); return; }
    if (!msg) { err.textContent = H.t("Write a message first."); $("gb-msg").focus(); return; }
    err.textContent = ""; $("gb-btn").disabled = true;
    H.rpc("add_guestbook", { p_id: current.id, p_author: name, p_message: msg }).then(function () {
      $("gb-msg").value = ""; $("gb-btn").disabled = false; loadGuestbook();
    }).catch(function (e) {
      $("gb-btn").disabled = false;
      err.textContent = H.t(/busy/.test(e.message) ? "This guestbook has had a lot of messages in the last hour. Try again later." : "Your message wasn't saved. Check your connection and try again.");
    });
  });
  $("gb-list").addEventListener("click", function (ev) {
    var id = ev.target && ev.target.getAttribute("data-hide");
    if (!id) return;
    H.rpc("hide_guestbook", { p_id: current.id, p_key: editKey, p_entry: +id }).then(loadGuestbook);
  });

  /* ---------- start ---------- */
  $("poster").style.containerType = "inline-size";
  var m = /^\/t\/([a-z0-9]{6,12})\/?$/.exec(location.pathname);
  var editId = new URLSearchParams(location.search).get("edit");
  if (m) startView(m[1]);
  else if (editId && /^[a-z0-9]{6,12}$/.test(editId)) startEdit(editId);
  else update(false);
})();
