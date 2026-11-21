/* Thank-you page after PayMongo checkout: links back to the keepsake and the timeline. */
(function () {
  var H = window.Homeday, id = new URLSearchParams(location.search).get("t") || H.store.get("homeday:last");
  if (!id || !/^[a-z0-9]{6,12}$/.test(id)) return;
  H.$("t-actions").innerHTML = '<a class="btn" href="/keepsake/' + id + '?paid=1">Open the keepsake</a> <a class="btn quiet" href="/t/' + id + '">Back to the timeline</a>';
})();
