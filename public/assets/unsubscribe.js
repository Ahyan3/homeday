/* Unsubscribe page: stops homeday reminder emails from the link in an email. */
(function () {
  var H = window.Homeday, $ = H.$, t = new URLSearchParams(location.search).get("t") || "";
  function say(title, lead) { $("u-title").textContent = H.t(title); $("u-lead").textContent = H.t(lead); }
  if (!/^[a-z0-9]{10,40}$/.test(t)) { say("This link is incomplete", "Open the link from the bottom of the reminder email again, or reply to the email and we'll stop them for you."); return; }
  H.rpc("unsubscribe_reminder", { p_token: t }).then(function (r) {
    if (r === "done") say("Reminders stopped", "You won't get any more homeday emails for this pet. The timeline itself stays as it is.");
    else say("We couldn't find those reminders", "They may already be stopped. If emails keep coming, reply to one and we'll sort it out.");
  }).catch(function () { say("That didn't work", "Check your connection and refresh this page."); });
})();
