/* Homeday reminders: on a saved timeline, the owner can ask for one email a year,
   a week before the homeday. Memorial timelines never offer it. Sending happens in the database. */
(function () {
  "use strict";
  var H = window.Homeday, $ = H.$;
  var m = /^\/t\/([a-z0-9]{6,12})\/?$/.exec(location.pathname);
  if (!m) return;
  var id = m[1];
  var form = $("remind-form");
  if (!form) return;
  var fmt = new Intl.DateTimeFormat(H.locale, { day: "numeric", month: "long", timeZone: "UTC" });

  /* app.js may still be storing a ?k= edit key, so read it from the URL too */
  function key() { return new URLSearchParams(location.search).get("k") || H.keyFor(id); }

  function showFor(row, emails) {
    if (!row || !row.owner || row.memorial) return;
    form.hidden = false;
    if (emails && emails.length) $("remind-note").textContent = H.t("Reminders go to {emails}. One email a year; every email has a link to stop them.", { emails: emails.join(", ") });
  }

  var k = key();
  if (!k) return;
  Promise.all([H.rpc("get_timeline", { p_id: id, p_key: k }), H.rpc("reminder_emails", { p_id: id, p_key: k }).catch(function () { return []; })])
    .then(function (r) { showFor(r[0], r[1]); })
    .catch(function () { /* the rest of the page still works */ });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("remind-email").value.trim(), note = $("remind-note"), btn = $("remind-btn");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { note.textContent = H.t("Enter an email address, like you@example.com."); $("remind-email").focus(); return; }
    btn.disabled = true; note.textContent = H.t("Saving…");
    H.rpc("add_reminder", { p_id: id, p_key: key(), p_email: email }).then(function (res) {
      btn.disabled = false; $("remind-email").value = ""; H.hit("remind_on");
      var next = res && res.next ? fmt.format(H.parse(res.next)) : null;
      note.textContent = H.t(next ? "Done. We'll email {email} a week before {date}." : "Done. We'll email {email} a week before each homeday.", { email: email, date: next });
    }).catch(function (e) {
      btn.disabled = false;
      var msg = String(e && e.message || "");
      note.textContent = H.t(/too many/.test(msg) ? "This timeline already sends reminders to 5 addresses."
        : /bad email/.test(msg) ? "That email address doesn't look right. Check it and try again."
        : /not owner/.test(msg) ? "Only the person with the edit link can turn on reminders."
        : "That didn't save. Check your connection and try again.");
    });
  });
})();
