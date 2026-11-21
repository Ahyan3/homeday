/* Owner page: confirm or reject GCash/Maya payments. Confirming unlocks the buyer's keepsake.
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
  function load() {
    $("adm-lead").textContent = "Loading…";
    return H.rpc("admin_orders", { p_key: key }).then(function (r) {
      H.store.set(KEY, key);
      $("adm-login").hidden = true; $("adm-main").hidden = false; $("adm-refresh").hidden = false; $("adm-forget").hidden = false;
      var p = $("adm-pending"), d = $("adm-recent"); p.innerHTML = ""; d.innerHTML = "";
      r.pending.forEach(function (o) { p.appendChild(li(o, true)); });
      r.recent.forEach(function (o) { d.appendChild(li(o, false)); });
      $("adm-lead").textContent = r.pending.length
        ? r.pending.length + (r.pending.length === 1 ? " payment" : " payments") + " to check. Open GCash or Maya, find each reference number in your transactions, and check the amount is ₱699."
        : "Nothing to check. New payments appear here.";
      if (!r.recent.length) d.innerHTML = '<li class="small">None yet.</li>';
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
