// ─── Anonymous page-view counter (GoatCounter) ────────
// Same counter as the rest of the MakerLens family (see MakerLens Assets
// js/analytics.js and https://makerlens.kokoroou.workers.dev/assets/privacy.html#analytics).
// Sends ONE request per page load to GoatCounter's documented /count endpoint
// (https://www.goatcounter.com/help/pixel). No cookies, no localStorage,
// no fingerprinting. GoatCounter does not store IP addresses.
//
// Sent:       page path, referrer, and the traffic-source query params below.
// NEVER sent: file or folder names, game titles, map/event names, dialogue or
//             any other game data. Do not add any of those here (CLAUDE.md).
//
// Events: countEvent(name) counts one of the fixed names in EVENTS: how a game was opened and
// whether that worked, the engine family, which features were used and the switch to MakerLens
// Assets. Only the name is sent (never a file, map or event name, text or search words), and each
// name at most ONCE per page load, so a count means "page loads where this happened". It returns
// a Promise that resolves once the request has been answered (or after 400 ms), so a page that
// navigates right after can wait.
//
// The Content-Security-Policy in index.html allows only this host in img-src.
var countEvent = function () { return Promise.resolve(); };
(function () {
  'use strict';
  var GC_ENDPOINT = 'https://makerlens.goatcounter.com/count';
  var PUBLIC_HOST = 'makerlens.kokoroou.workers.dev';
  var EVENTS = [
    // How a game was opened (the way, never what): folder picker, folder or file drop,
    // <input webkitdirectory>, data files picked one by one, game link, handed over from Assets.
    'open-picker', 'open-drop', 'open-input', 'open-files', 'open-link', 'open-handoff',
    // How it ended. nomedia = the picked folder holds no game data (wrong folder picked).
    'open-ok', 'open-cancel', 'open-fail-nomedia', 'open-fail-other',
    // The folder picker is missing in this browser (Firefox, Safari, Android): the fallback runs.
    'picker-unsupported',
    // Engine family of an opened game (mvmz: MV or MZ, not told apart).
    'engine-mv', 'engine-mz', 'engine-mvmz', 'engine-xp', 'engine-vx', 'engine-vxace', 'engine-2k', 'engine-other',
    // Features used.
    'graph-view', 'scene-preview', 'save-used', 'search-used',
    'switch-to-assets'
  ];
  var sentOnce = {};
  // Query params GoatCounter reads as traffic source / campaign. Nothing else is sent.
  var SOURCE_PARAMS = ['utm_source', 'ref', 'src', 'source', 'utm_campaign', 'campaign'];

  // Only count the public site, not local copies or previews.
  if (location.hostname !== PUBLIC_HOST) return;
  // Respect Do Not Track / Global Privacy Control.
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;

  var here = new URLSearchParams(location.search), q = new URLSearchParams();
  SOURCE_PARAMS.forEach(function (k) { if (here.get(k)) q.set(k, here.get(k)); });

  var params = new URLSearchParams({
    p: location.pathname,
    r: document.referrer,
    rnd: Math.random().toString(36).slice(2)
  });
  if (q.toString()) params.set('q', '?' + q.toString());
  new Image().src = GC_ENDPOINT + '?' + params.toString();

  countEvent = function (name) {
    if (EVENTS.indexOf(name) < 0 || sentOnce[name]) return Promise.resolve();
    sentOnce[name] = true;
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = img.onerror = function () { resolve(); };
      setTimeout(resolve, 400);
      img.src = GC_ENDPOINT + '?' + new URLSearchParams({
        p: name, t: name, e: 'true', rnd: Math.random().toString(36).slice(2)
      }).toString();
    });
  };
}());
