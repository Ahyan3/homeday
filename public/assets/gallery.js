/* Gallery of real timelines. On a saved timeline, the owner can offer it as an example for the home
   page; it shows only after the site owner approves it on /admin, and the owner can take it down any
   time. On the home page, approved timelines appear in the "Real timelines" row. */
(function () {
  "use strict";
  var H = window.Homeday, $ = H.$;

  /* owner switch, inside the Share panel of /t/<id> */
  var m = /^\/t\/([a-z0-9]{6,12})\/?$/.exec(location.pathname), row = $("gal-row");
  if (m && row) {
    var id = m[1], key = new URLSearchParams(location.search).get("k") || H.keyFor(id);
    var TEXT = {
      none: ["Your timeline can appear on Homeday's home page, so new visitors see what one looks like. We look at each one first, and you can take it down any time.", "Offer it"],
      pending: ["Waiting for approval. It shows on the home page once we've had a look.", "Take back the offer"],
      shown: ["Showing on Homeday's home page now.", "Take it down"],
      declined: ["We kept this one off the home page this time. Thank you for offering.", ""]
    };
    var show = function (state) {
      var t = TEXT[state] || TEXT.none;
      $("gal-note").textContent = H.t(t[0]);
      $("gal-btn").textContent = H.t(t[1]); $("gal-btn").hidden = !t[1];
      $("gal-btn").setAttribute("data-on", state === "none" ? "1" : "0");
      row.hidden = false;
    };
    if (key) H.rpc("gallery_status", { p_id: id, p_key: key }).then(function (state) { if (state) show(state); }, function () { /* not shown */ });
    $("gal-btn").addEventListener("click", function () {
      var b = $("gal-btn"), on = b.getAttribute("data-on") === "1"; b.disabled = true;
      H.rpc("set_gallery", { p_id: id, p_key: key, p_on: on }).then(function (state) {
        b.disabled = false; show(state); if (on) H.hit("gallery_offer");
      }, function () { b.disabled = false; $("gal-note").textContent = H.t("That didn't save. Check your connection and try again."); });
    });
  }

  /* home page row */
  var list = $("gal-list");
  if (list && location.pathname === "/") {
    H.rpc("gallery_list", {}).then(function (items) {
      if (!items || !items.length) return;
      var today = H.today();
      items.forEach(function (x, i) {
        var home = H.parse(x.home_date), end = x.memorial && x.passed_date ? H.parse(x.passed_date) : today, d = H.num(H.diff(home, end));
        var li = document.createElement("li"), a = document.createElement("a");
        a.href = "/t/" + x.id; a.className = "gal-card"; a.style.setProperty("--r", [-1.6, 1.2, -0.8, 1.8][i % 4] + "deg");
        var pic = document.createElement("div"); pic.className = "gal-pic";
        if (x.photo) { var img = document.createElement("img"); img.src = H.photoUrl(x.photo); img.alt = ""; img.loading = "lazy"; pic.appendChild(img); }
        else { pic.className += " gal-tag"; pic.textContent = String(x.name || "?").trim().charAt(0).toUpperCase(); }
        var name = document.createElement("b"); name.textContent = x.name;
        var line = document.createElement("span"); line.textContent = H.t(x.memorial ? "Loved for {d} days" : "{d} days home", { d: d });
        a.appendChild(pic); a.appendChild(name); a.appendChild(line); li.appendChild(a); list.appendChild(li);
      });
      $("gallery").hidden = false;
    }, function () { /* the row just stays hidden */ });
  }
})();
