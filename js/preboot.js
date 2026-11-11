/* Early folder picking. This is the first script after the page, tiny on purpose: the
   Select Game Folder button works as soon as it is on screen, while the rest of the
   scripts (and the graph libraries) are still downloading. What the user picks or drops
   is kept here, and app.js takes it over with Preboot.attach() once it is ready. */
var Preboot = (function () {
  'use strict';
  var P = { ready: false, handlers: null, pending: [] };

  function deliver(kind, value) {
    if (P.ready) P.handlers[kind](value);
    else P.pending.push({ kind: kind, value: value });
  }

  function pick() {
    if (P.ready) return;                    // the app's own handler does it from now on
    if (window.showDirectoryPicker) {
      window.showDirectoryPicker({ id: 'makerlens-game', mode: 'read' }).then(
        function (dir) { deliver('dir', dir); },
        function (e) { if (e && e.name !== 'AbortError') deliver('error', e); }
      );
    } else {
      document.getElementById('folder-input').click();
    }
  }

  // Not a click on the nested button twice: the drop zone and the header button both pick.
  ['open-btn', 'drop-zone'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', pick);
  });

  var input = document.getElementById('folder-input');
  if (input) input.addEventListener('change', function (e) {
    if (!P.ready && e.target.files.length) deliver('files', Array.prototype.slice.call(e.target.files));
  });

  // A folder dropped before the app is ready (the entry must be read inside the event).
  var overlay = document.getElementById('drag-overlay');
  document.addEventListener('dragover', function (e) {
    e.preventDefault();
    if (!P.ready && overlay) overlay.classList.add('active');
  });
  document.addEventListener('dragleave', function (e) {
    if (!P.ready && !e.relatedTarget && overlay) overlay.classList.remove('active');
  });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    if (P.ready) return;
    if (overlay) overlay.classList.remove('active');
    var items = Array.prototype.slice.call(e.dataTransfer.items || []), entry = null;
    for (var i = 0; i < items.length && !entry; i++) {
      var en = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (en && en.isDirectory) entry = en;
    }
    if (entry) deliver('entry', entry);
    else if (e.dataTransfer.files.length) deliver('files', Array.prototype.slice.call(e.dataTransfer.files));
  });


  // ── "View another way" dialog: opens at once; the work waits for the app if needed ──
  var alt = document.getElementById('alt-dialog');
  if (alt) {
    var byId = function (id) { return document.getElementById(id); };
    var linkInput = byId('alt-link-input'), linkError = byId('alt-link-error'), openBtn = byId('alt-open');
    var openLabel = openBtn.textContent, waiting = false;
    var show = function (panel) {
      byId('alt-menu').hidden = panel !== 'menu';
      byId('alt-link-panel').hidden = panel !== 'link';
      byId('alt-title').textContent = panel === 'link' ? 'Open a game link' : 'View another way';
      linkError.textContent = '';
      if (panel === 'link') linkInput.focus();
    };
    var runLink = function () {                 // the app is ready: it parses, we show its error
      waiting = false; openBtn.disabled = false; openBtn.textContent = openLabel;
      var err = P.handlers.link(linkInput.value);
      if (err) { linkError.textContent = err; return; }
      alt.close(); linkInput.value = '';
    };
    var submit = function () {
      if (P.ready) { runLink(); return; }
      waiting = true; openBtn.disabled = true; openBtn.textContent = 'Opening…';
      linkError.textContent = '';
    };
    byId('alt-btn').addEventListener('click', function () {
      if (P.ready && P.handlers.busy()) return;
      show('menu');
      if (!alt.open) alt.showModal();
    });
    byId('alt-close').addEventListener('click', function () { alt.close(); });
    alt.addEventListener('click', function (e) { if (e.target === alt) alt.close(); });   // the backdrop
    byId('alt-link').addEventListener('click', function () { show('link'); });
    byId('alt-back').addEventListener('click', function () { show('menu'); });
    openBtn.addEventListener('click', submit);
    linkInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    byId('alt-files').addEventListener('click', function () { alt.close(); byId('files-input').click(); });
    var fin = byId('files-input');
    fin.addEventListener('change', function () {
      if (P.ready) return;
      var files = slice.call(fin.files); fin.value = '';
      if (files.length) deliver('loose', files);
    });
    P.flushLink = function () { if (waiting) runLink(); };
  }

  // app.js: from now on its own handlers run; hand over anything picked meanwhile.
  P.attach = function (handlers) {
    P.handlers = handlers;
    P.ready = true;
    var q = P.pending; P.pending = [];
    q.forEach(function (p) { handlers[p.kind](p.value); });
    if (P.flushLink) P.flushLink();
  };
  return P;
}());
