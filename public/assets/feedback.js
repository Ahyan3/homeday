/* "Send feedback" box in the footer. Messages go to /admin; the email is optional. */
(function () {
  "use strict";
  var H = window.Homeday, $ = H.$, open = $("fb-open"), form = $("fb-form");
  if (!open || !form) return;
  open.addEventListener("click", function () { form.hidden = !form.hidden; if (!form.hidden) $("fb-msg").focus(); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var msg = $("fb-msg").value.trim(), email = $("fb-email").value.trim(), note = $("fb-note"), btn = form.querySelector("button[type=submit]");
    if (msg.length < 2) { note.textContent = H.t("Write a few words first."); $("fb-msg").focus(); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { note.textContent = H.t("That email address doesn't look right. Check it and try again."); $("fb-email").focus(); return; }
    btn.disabled = true; note.textContent = H.t("Sending…");
    H.rpc("send_feedback", { p_message: msg, p_email: email || null, p_page: location.pathname, p_lang: H.lang }).then(function () {
      btn.disabled = false; $("fb-msg").value = ""; note.textContent = H.t("Thank you. We read every message."); H.hit("feedback");
    }, function () { btn.disabled = false; note.textContent = H.t("That didn't send. Check your connection and try again."); });
  });
})();
