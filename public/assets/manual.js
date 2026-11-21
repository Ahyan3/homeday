/* GCash/Maya payment by QR code, checked by hand. Used until PayMongo checkout is live.
   H.openManual(id, item, box) fills `box` with the QR, the steps and a form for the reference number. */
(function () {
  "use strict";
  var H = window.Homeday;
  var ERR = {
    "bad reference": "Enter the reference number from your GCash or Maya receipt. It has 8 to 30 letters and numbers.",
    "reference used": "That reference number was already sent. If you paid twice, email us and we'll refund one.",
    "bad email": "Check your email address. We send the keepsake link there.",
    "bad name": "Enter the name on your GCash or Maya account.",
    "too many": "Too many tries for now. Wait an hour, or email us.",
    "no timeline": "We couldn't find this timeline. Save it first."
  };
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }
  function field(id, label, type, extra) {
    var f = el("div", { "class": "f" }), l = el("label", { "for": id }, label), i = el("input", Object.assign({ id: id, type: type }, extra || {}));
    f.appendChild(l); f.appendChild(i); return f;
  }

  H.openManual = function (id, item, box) {
    var amount = H.price(item, "PHP");
    box.innerHTML = ""; box.hidden = false; box.className = "manualpay";
    var h = el("h3", { tabindex: "-1" }, "Pay " + amount + " with GCash or Maya");
    var grid = el("div", { "class": "mp-grid" });
    var fig = el("figure", { "class": "mp-qr" });
    var img = el("img", { src: H.MANUAL_PAY.qr, alt: "Homeday's QR code for GCash and Maya", width: "220", height: "220" });
    fig.appendChild(img);
    if (H.MANUAL_PAY.account) fig.appendChild(el("figcaption", {}, H.MANUAL_PAY.account));
    var steps = el("ol", { "class": "mp-steps" });
    ["Open GCash or Maya and scan this QR code. On a phone, screenshot it and choose Upload QR in your app.",
     "Pay exactly " + amount + ".",
     "Copy the reference number from your receipt into the form below."].forEach(function (t) { steps.appendChild(el("li", {}, t)); });
    grid.appendChild(fig); grid.appendChild(steps);

    var form = el("form", { "class": "mp-form", novalidate: "" });
    form.appendChild(field("mp-name", "Name on your GCash or Maya account", "text", { autocomplete: "name", maxlength: "80" }));
    form.appendChild(field("mp-email", "Email for the keepsake link", "email", { autocomplete: "email", maxlength: "254", inputmode: "email" }));
    form.appendChild(field("mp-ref", "Reference number", "text", { autocomplete: "off", maxlength: "40", inputmode: "text", placeholder: "e.g. 1009 876 543 210" }));
    var err = el("p", { "class": "err", role: "alert" });
    var btn = el("button", { "class": "btn", type: "submit" }, "Send for checking");
    var cancel = el("button", { "class": "btn quiet", type: "button" }, "Cancel");
    var acts = el("div", { "class": "actions" }); acts.appendChild(btn); acts.appendChild(cancel);
    form.appendChild(err); form.appendChild(acts);
    cancel.addEventListener("click", function () { box.hidden = true; box.innerHTML = ""; });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = H.$("mp-name").value.trim(), email = H.$("mp-email").value.trim(), ref = H.$("mp-ref").value.trim();
      if (name.length < 2) { err.textContent = ERR["bad name"]; H.$("mp-name").focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = ERR["bad email"]; H.$("mp-email").focus(); return; }
      if (!/^[A-Za-z0-9]{8,30}$/.test(ref.replace(/[\s-]/g, ""))) { err.textContent = ERR["bad reference"]; H.$("mp-ref").focus(); return; }
      err.textContent = ""; btn.disabled = true; btn.textContent = "Sending…";
      H.rpc("submit_manual_payment", { p_id: id, p_item: item, p_name: name, p_email: email, p_ref: ref }).then(function () {
        H.store.set("homeday:last", id);
        box.innerHTML = "";
        var done = el("h3", { tabindex: "-1" }, "Thank you. We're checking your payment.");
        var p = el("p", {}, "We'll unlock the keepsake once we see your " + amount + " in our account, usually within a few hours and always within a day. We'll email " + email + " when it's ready.");
        var a = el("a", { "class": "btn", href: "/keepsake/" + id }, "Go to the keepsake");
        box.appendChild(done); box.appendChild(p); box.appendChild(a); done.focus();
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = "Send for checking";
        var m = String(e && e.message || ""), key = Object.keys(ERR).filter(function (k) { return m.indexOf(k) >= 0; })[0];
        err.textContent = key ? ERR[key] : "That didn't send. Check your connection and try again.";
      });
    });
    box.appendChild(h); box.appendChild(grid); box.appendChild(form);
    h.focus();
  };
})();
