/* Owner page: confirm or reject QR code payments. Confirming unlocks the buyer's keepsake.
   The admin key is checked by the database; this browser keeps it after it works once. */
(function () {
  "use strict";
  var H = window.Homeday, $ = H.$, KEY = "homeday:admin", key = H.store.get(KEY);
  var ago = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  function when(iso) {
    var m = Math.round((new Date(iso) - Date.now()) / 60000);
    return Math.abs(m) < 60 ? ago.format(m, "minute") : Math.abs(m) < 1440 ? ago.format(Math.round(m / 60), "hour") : ago.format(Math.round(m / 1440), "day");
  }
  function li(o, pending) {
    var item = document.createElement("li");
    item.className = "adm-item" + (pending ? "" : " " + o.status);
    var ref = String(o.payer_ref || "").replace(/(.{4})(?=.)/g, "$1 ");
    item.innerHTML =
      '<div class="adm-ref"><span class="small">Reference</span><b></b></div>' +
      '<div class="adm-who"><b class="nm"></b><span class="small em"></span></div>' +
      '<div class="small adm-what"></div>';
    item.querySelector(".adm-ref b").textContent = ref;
    item.querySelector(".nm").textContent = o.payer_name || "";
    item.querySelector(".em").textContent = pending ? (o.email || "") : (o.status === "paid" ? "Confirmed" : "Rejected") + " " + when(o.reviewed_at);
    var what = item.querySelector(".adm-what");
    var WALLET = { gcash: "GCash", maya: "Maya", gotyme: "GoTyme" };
    if (o.payer_wallet) item.querySelector(".adm-ref span").textContent = "Reference · paid to " + WALLET[o.payer_wallet];
    what.textContent = (o.item === "gift" ? "Gift keepsake" : "Digital keepsake") + " for " + (o.pet || "a deleted timeline") + " · ₱" + ((o.expected_amount || 69900) / 100) + (pending ? " · sent " + when(o.created_at) : "") + " · ";
    var a = document.createElement("a"); a.href = "/t/" + o.timeline_id; a.textContent = "timeline"; a.target = "_blank"; a.rel = "noopener"; what.appendChild(a);
    if (pending) {
      var acts = document.createElement("div"); acts.className = "actions";
      [["Received, unlock it", true, "btn"], ["Not in my account", false, "btn quiet"]].forEach(function (b) {
        var btn = document.createElement("button"); btn.type = "button"; btn.className = b[2]; btn.textContent = b[0];
        var armed = false;
        btn.addEventListener("click", function () {
          if (!armed) { armed = true; btn.textContent = b[1] ? "Tap again to unlock" : "Tap again to reject"; setTimeout(function () { armed = false; btn.textContent = b[0]; }, 4000); return; }
          acts.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
          H.rpc("admin_review", { p_key: key, p_order: o.id, p_ok: b[1] }).then(load, function () { $("adm-lead").textContent = "That didn't save. Check your connection and try again."; acts.querySelectorAll("button").forEach(function (x) { x.disabled = false; }); });
        });
        acts.appendChild(btn);
      });
      item.appendChild(acts);
    }
    return item;
  }
  /* a button that needs two taps, so nothing happens by accident */
  function twoTap(label, armedLabel, cls, act) {
    var b = document.createElement("button"), armed = false;
    b.type = "button"; b.className = cls; b.textContent = label;
    b.addEventListener("click", function () {
      if (!armed) { armed = true; b.textContent = armedLabel; setTimeout(function () { armed = false; b.textContent = label; }, 4000); return; }
      b.disabled = true; act().then(load, function () { b.disabled = false; $("adm-lead").textContent = "That didn't save. Check your connection and try again."; });
    });
    return b;
  }
  function text(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = t; return e; }
  function link(href, t) { var a = document.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = t; return a; }
  function inbox(r) {
    if (!r || !r.gallery_pending) return;
    var gp = $("adm-gal-pending"), gs = $("adm-gal-shown"), fb = $("adm-feedback");
    gp.innerHTML = ""; gs.innerHTML = ""; fb.innerHTML = "";
    r.gallery_pending.forEach(function (g) {
      var li = document.createElement("li"); li.className = "adm-item adm-gal";
      if (g.photo) { var img = document.createElement("img"); img.src = H.photoUrl(g.photo); img.alt = ""; img.className = "adm-thumb"; li.appendChild(img); }
      var who = document.createElement("div"); who.className = "adm-who";
      who.appendChild(text("b", "nm", g.name + (g.memorial ? " (memorial)" : "")));
      var meta = text("span", "small", (g.photo_count || 0) + " photos · offered " + when(g.gallery_at) + " · "); meta.appendChild(link("/t/" + g.id, "open timeline")); who.appendChild(meta);
      li.appendChild(who);
      var acts = document.createElement("div"); acts.className = "actions";
      acts.appendChild(twoTap("Approve", "Tap again to show it", "btn", function () { return H.rpc("admin_gallery", { p_key: key, p_id: g.id, p_show: true }); }));
      acts.appendChild(twoTap("Decline", "Tap again to decline", "btn quiet", function () { return H.rpc("admin_gallery", { p_key: key, p_id: g.id, p_show: false }); }));
      li.appendChild(acts); gp.appendChild(li);
    });
    if (!r.gallery_pending.length) gp.appendChild(text("li", "small", "No requests."));
    r.gallery_shown.forEach(function (g) {
      var li = document.createElement("li"); li.className = "adm-item paid";
      var who = document.createElement("div"); who.className = "adm-who";
      var nm = text("b", "nm", g.name + " "); who.appendChild(nm);
      var meta = text("span", "small", "approved " + when(g.gallery_at) + " · "); meta.appendChild(link("/t/" + g.id, "open")); who.appendChild(meta);
      li.appendChild(who);
      var acts = document.createElement("div"); acts.className = "actions";
      acts.appendChild(twoTap("Remove from home page", "Tap again to remove", "btn quiet", function () { return H.rpc("admin_gallery", { p_key: key, p_id: g.id, p_show: false }); }));
      li.appendChild(acts); gs.appendChild(li);
    });
    if (!r.gallery_shown.length) gs.appendChild(text("li", "small", "Nothing yet."));
    r.feedback.forEach(function (f) {
      var li = document.createElement("li"); li.className = "adm-item paid";
      li.appendChild(text("p", "adm-msg", f.message));
      var meta = text("span", "small", when(f.created_at) + (f.lang === "tl" ? " · Taglish" : "") + (f.page ? " · on " + f.page : "") + (f.email ? " · " : ""));
      if (f.email) { var a = document.createElement("a"); a.href = "mailto:" + f.email; a.textContent = f.email; meta.appendChild(a); }
      li.appendChild(meta);
      var acts = document.createElement("div"); acts.className = "actions";
      acts.appendChild(twoTap("Delete", "Tap again to delete", "btn quiet", function () { return H.rpc("admin_feedback_delete", { p_key: key, p_id: f.id }); }));
      li.appendChild(acts); fb.appendChild(li);
    });
    if (!r.feedback.length) fb.appendChild(text("li", "small", "No feedback yet."));
  }
  function stats(r) {
    if (!r || !r.days) return;
    var peso = function (c) { return "₱" + H.num(Math.round(c / 100)); };
    var a = r.all_time;
    $("adm-alltime").textContent = "All time: " + H.num(a.timelines) + " timelines, " + H.num(a.paid) + " paid keepsakes (" + peso(a.paid_php_centavos) + "), " + H.num(a.reminders) + " reminder sign-ups, " + H.num(a.gallery) + " in the gallery.";
    var max = Math.max.apply(null, r.days.map(function (d) { return d.visitors; }).concat([1]));
    var fmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    var head = "<thead><tr><th scope=\"col\">Day</th><th scope=\"col\">Visitors</th><th scope=\"col\">Abroad</th><th scope=\"col\">Taglish</th><th scope=\"col\">Saved</th><th scope=\"col\">Buy taps</th><th scope=\"col\">Paid</th></tr></thead>";
    var body = r.days.map(function (d) {
      var w = Math.round(d.visitors / max * 100);
      return "<tr><th scope=\"row\">" + fmt.format(H.parse(d.day)) + "</th><td class=\"bar\"><span style=\"--w:" + w + "%\"></span><b>" + H.num(d.visitors) + "</b></td><td>" + H.num(d.abroad) + "</td><td>" + H.num(d.taglish) + "</td><td>" + H.num(d.saved) + "</td><td>" + H.num(d.buy_clicks) + "</td><td>" + (d.paid ? H.num(d.paid) + " · " + peso(d.paid_php_centavos) : "0") + "</td></tr>";
    }).join("");
    $("adm-stats").innerHTML = head + "<tbody>" + body + "</tbody>";
  }
  function load() {
    $("adm-lead").textContent = "Loading…";
    return H.rpc("admin_orders", { p_key: key }).then(function (r) {
      H.store.set(KEY, key);
      $("adm-login").hidden = true; $("adm-main").hidden = false; $("adm-refresh").hidden = false; $("adm-forget").hidden = false;
      var p = $("adm-pending"), d = $("adm-recent"); p.innerHTML = ""; d.innerHTML = "";
      r.pending.forEach(function (o) { p.appendChild(li(o, true)); });
      r.recent.forEach(function (o) { d.appendChild(li(o, false)); });
      $("adm-lead").textContent = r.pending.length
        ? r.pending.length + (r.pending.length === 1 ? " payment" : " payments") + " to check. Open the app it was paid to, find the reference number in your transactions, and check the amount is ₱699."
        : "Nothing to check. New payments appear here.";
      if (!r.recent.length) d.innerHTML = '<li class="small">None yet.</li>';
      return Promise.all([H.rpc("admin_inbox", { p_key: key }).then(inbox), H.rpc("admin_stats", { p_key: key }).then(stats)]);
    });
  }
  $("adm-login").addEventListener("submit", function (ev) {
    ev.preventDefault(); key = $("adm-key").value.trim();
    load().catch(function () { $("adm-login-err").textContent = "That key didn't work. Check it and try again."; });
  });
  $("adm-refresh").addEventListener("click", function () { load().catch(function () { $("adm-lead").textContent = "That didn't load. Check your connection."; }); });
  $("adm-forget").addEventListener("click", function () { H.store.set(KEY, null); location.reload(); });
  if (key) load().catch(function () { H.store.set(KEY, null); key = null; });
})();
