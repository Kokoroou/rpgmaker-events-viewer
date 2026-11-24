/* Applied before first paint to avoid a theme flash. External file so the CSP needs no inline script.
   Same rule and same key ('theme') as MakerLens Assets and the landing page, so the choice follows the visitor across the family: a stored 'light' / 'dark' is an explicit choice, otherwise
   css/tokens.css follows prefers-color-scheme. */
(function () {
  try {
    var t = localStorage.getItem('theme') || localStorage.getItem('mle-theme'); /* 'mle-theme': older choice */
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system theme */ }
}());
