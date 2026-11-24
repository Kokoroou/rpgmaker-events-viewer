/* faq.html: the theme button of the new header. Same rule as the app (js/app.js): the default
   follows the OS (css/tokens.css), the button flips to the other theme, and picking the one the
   OS already uses clears the override. Stored under the family's shared key 'theme' (js/theme-init.js reads it; the old 'mle-theme' is read once and dropped). */
(function () {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var system = function () { return mq && mq.matches ? 'dark' : 'light'; };
  var current = function () { return root.getAttribute('data-theme') || system(); };
  var label = function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    btn.title = 'Switch to ' + next + ' theme';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
  };
  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    try {
      if (next === system()) { root.removeAttribute('data-theme'); localStorage.removeItem('theme'); localStorage.removeItem('mle-theme'); }
      else { root.setAttribute('data-theme', next); localStorage.setItem('theme', next); localStorage.removeItem('mle-theme'); }
    } catch (e) { root.setAttribute('data-theme', next); }
    label();
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', label);
  label();
}());
