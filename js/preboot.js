/* Early folder picking. This is the first script after the page, tiny on purpose: the
   Select Game Folder button works as soon as it is on screen, while the rest of the
   scripts (and the graph libraries) are still downloading. What the user picks or drops
   is kept here, and app.js takes it over with Preboot.attach() once it is ready. */
var Preboot = (function () {
  'use strict';
  var P = { ready: false, handlers: null, pending: null };

  function deliver(kind, value) {
    if (P.ready) P.handlers[kind](value);
    else P.pending = { kind: kind, value: value };
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

  // app.js: from now on its own handlers run; hand over anything picked meanwhile.
  P.attach = function (handlers) {
    P.handlers = handlers;
    P.ready = true;
    if (P.pending) { var p = P.pending; P.pending = null; handlers[p.kind](p.value); }
  };
  return P;
}());
