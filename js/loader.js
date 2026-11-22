/* ── File loading ────────────────────────────────────── */
// Two rules keep slow machines responsive (same idea as MakerLens Assets):
// 1. Opening a game lists and reads data/*.json only: img/, audio/, movies/ are never
//    walked. The scene player reads its pictures and sounds later, one file at a time (media.js).
// 2. The map tree shows as soon as MapInfos/System/Actors/CommonEvents are read;
//    Map###.json files are read on demand (the map the user opens first) and the
//    rest in the background, which waits while a foreground read is running.
// 3. Every open goes through runLoad(), which drives the Loader overlay (loadui.js).
//    The new game only replaces the open one at commit, so Cancel or an error
//    before that keeps what was on screen.

const SPINNER = '<span class="status-spinner" aria-hidden="true"></span> ';
// MV/MZ .json, or XP/VX/VX Ace Ruby Marshal data (js/rgss.js).
// RPG Maker 2000/2003 (js/lcf.js): RPG_RT.lmt / RPG_RT.ldb and Map####.lmu at the game root.
const MAP_FILE  = /^Map(\d{3})\.(json|rvdata2|rvdata|rxdata)$|^Map(\d{4})\.(lmu)$/i;
const DATA_FILE = /^(MapInfos|Actors|System|CommonEvents|Map\d{3})\.(json|rvdata2|rvdata|rxdata)$|^(RPG_RT\.(ldb|lmt)|Map\d{4}\.lmu)$/i;
// Folders a game ships that never hold data/: skipped when looking for it.
const SKIP_DIRS = /^(img|audio|graphics|movies|fonts|effects|icon|js|css|save|locales?|node_modules|\.git|charset|chipset|faceset|picture|panorama|music|sound|battle2?|battlecharset|battleweapon|monster|backdrop|movie|system2?|title|gameover|frame)$/i;
const DATA_DEPTH = 3;   // root/, game/, game/www/, game/www/data/

let seq = 0;                // id of the latest load started
let current = 0;            // id of the load whose game is on screen (set by commit)
let mapReads = new Map();   // mapId → Promise<map|null>, one read per map
let loadInfo = null;        // progress of the current game's map reading
const Fg = { active: 0 };   // foreground reads in flight (the background waits)

const sleep = ms => new Promise(r => setTimeout(r, ms));
const abort = msg => new DOMException(msg, 'AbortError');

// Every way of opening a game goes through here: it drives the Loader overlay.
// The new game is built on the side and only replaces the open one at commit,
// so Cancel or a failure before that keeps what was on screen.
// `way` is the open-* event name (js/analytics.js); the outcome is counted too.
async function runLoad(name, getFiles, kind, way) {
  const id = ++seq;
  if (way) track(way);
  const guard = () => { if (id !== seq) throw abort('Superseded'); Loader.check(); };
  Fg.active++;   // the previous game's background reading yields meanwhile
  Loader.open({ name, steps: ['detect', 'read', 'map'], kind });
  Loader.step('detect', 'active');
  try {
    const files = await getFiles(guard);
    guard();
    await loadFiles(files, id, guard, name);
  } catch (e) {
    if (id !== seq) return;   // a newer load took over the overlay
    if (e && e.name === 'AbortError') { Loader.close(); setStatus('', ''); if (e.message !== 'Superseded') track('open-cancel'); }
    else failLoad('Could not open folder: ' + ((e && e.message) || e));
  } finally {
    Fg.active--;
  }
}

// <input webkitdirectory> and plain file drops: the File list is already in hand.
function loadFolder(files, way = 'open-input') {
  const first = files[0] && (files[0].webkitRelativePath || files[0]._dragPath || '');
  return runLoad(first.includes('/') ? first.split(/[\\/]/)[0] : '', async () => files, undefined, way);
}

// The switch to MakerLens Assets (app.js, js/handoff.js): offered for a game link, or a folder
// behind a handle when the two tools are served side by side.
function syncSwitch() {
  const can = !!(S.remoteLink || (S.folderHandle && typeof Handoff !== 'undefined' && Handoff.ready('assets', location.pathname)));
  EL.switchTool.hidden = !can;
  if (EL.switchGo && EL.switchGo.removeAttribute) EL.switchGo.removeAttribute('aria-busy');
}

/* ── Sidebar (a column; on phones a drawer over the page) ── */
const PHONE = typeof matchMedia === 'function' ? matchMedia('(max-width: 600px)') : null;
function isPhone() { return !!(PHONE && PHONE.matches); }
function setSidebar(open) {
  const m = open ? 'remove' : 'add';
  EL.sidebar.classList[m]('hidden');
  EL.sbResizer.classList[m]('hidden');
  if (EL.sbScrim) EL.sbScrim.hidden = !(open && isPhone());
  if (EL.sidebarToggle) EL.sidebarToggle.setAttribute('aria-pressed', open ? 'true' : 'false');
}

// `ev`: the outcome counted (js/analytics.js); '' when the game was already open.
function failLoad(message, ev = 'open-fail-other') {
  if (ev) track(ev);
  setStatus('err', message);
  Loader.fail(message);
}

// XP / VX / VX Ace games usually ship Data/ inside Game.rgss3a (or .rgss2a/.rgssad):
// when no map file is in hand but an archive is, its Data/ files take their place and
// its Graphics/ (plus the folder's own Audio/) serve the scene player.
async function expandArchive(files, guard) {
  const isMap = f => MAP_FILE.test(f.name || '');
  const arch = files.find(f => RGSS_ARCHIVE.test(f.name || ''));
  if (!arch || files.some(isMap)) return files;
  Loader.detail('detect', 'reading ' + arch.name + '…');
  const entries = await archiveFiles(arch.file ? await arch.file() : arch);
  guard();
  const inArchive = new Map(entries.map(e => [e.path, e]));
  const out = entries.filter(e => /^data\/[^/]+$/i.test(e.path) && DATA_FILE.test(e.name))
    .map(e => ({ name: e.name, _dragPath: e.path, text: e.text, arrayBuffer: e.arrayBuffer }));
  if (typeof Media !== 'undefined') {   // the scene player's files (media.js)
    const rel = f => (f._dragPath || f.webkitRelativePath || f.name).replace(/\\/g, '/');
    const dir = rel(arch).replace(/[^/]*$/, '');   // the folder holding the archive (the game root)
    const folder = files.gameRoot ? treeRoot(files.gameRoot.fs, files.gameRoot.node)
      : filesRoot(new Map(files.filter(f => f !== arch).map(f => [rel(f), f])), dir);
    out.mediaRoot = unionRoot(filesRoot(inArchive, ''), folder);
  }
  out.folderHandle = files.folderHandle;
  out.remoteLink = files.remoteLink;
  return out;
}

// What to say when the picked folder holds no game: name the folder and say which one to pick.
// A folder inside the game (img/, audio/, Graphics/, img/pictures…) gets "the folder above it".
const INNER_DIRS = /^(pictures|faces|characters|enemies|sv_actors|sv_enemies|tilesets|titles[12]|parallaxes|battlebacks[12]|animations|bgm|bgs|me|se)$/i;
// Engines we recognise but do not read: said plainly instead of "no game data".
function otherEngine(paths) {
  for (const raw of paths || []) {
    const p = String(raw).replace(/\\/g, '/').toLowerCase();
    if (/(^|\/)[^/]*\.wolf$/.test(p)) return 'Wolf RPG Editor';
    if (/(^|\/)unityplayer\.dll$/.test(p) || /(^|\/)[^/]+_data\/(globalgamemanagers|level\d+|sharedassets\d+)/.test(p)) return 'Unity';
  }
  return '';
}
function notGameMessage(name, paths) {
  const other = otherEngine(paths);
  if (other) return `This looks like a ${other} game. MakerLens Events supports RPG Maker (2000/2003/XP/VX/VX Ace/MV/MZ) only.`;
  const top = name || ((paths && paths[0]) || '').split('/')[0];
  const where = 'the game\'s main folder: the one that holds data/ (or Data/, or RPG_RT.ldb), usually next to Game.exe';
  if (top && (SKIP_DIRS.test(top) || INNER_DIRS.test(top)))
    return `"${top}" is a folder inside the game. Select the folder above it instead, ${where}.`;
  return `No RPG Maker game data found${top ? ` in "${top}"` : ''}. Select ${where}.`;
}

async function loadFiles(files, id, guard, name) {
  const seen = files.seen || [];   // names findDataFiles saw, when it found nothing to list
  files = await expandArchive(files, guard);
  const fileMap = new Map();
  for (const f of files) {
    const rel = (f._dragPath || f.webkitRelativePath || f.name).replace(/\\/g, '/');
    fileMap.set(rel, f);
  }

  // Several data/ folders can be listed (mods/x/data/ next to the real one): prefer the shallowest
  // one that holds map files; with none holding maps, the first one listed.
  let dataPrefix = '';
  const withMaps = new Map();   // prefix → path segments
  for (const [path] of fileMap) {
    const m = path.match(/^(.+\/)?data\//i);
    if (!m) continue;
    if (!dataPrefix) dataPrefix = m[0];
    const rest = path.slice(m[0].length);
    if (!withMaps.has(m[0]) && rest.indexOf('/') < 0 && MAP_FILE.test(rest)) withMaps.set(m[0], m[0].split('/').length);
  }
  let best = Infinity;
  for (const [pre, depth] of withMaps) if (depth < best) { best = depth; dataPrefix = pre; }

  const mapFiles = new Map();   // mapId → file, in id order
  let ext = 'json';             // one engine per game: the map files' extension (json for MV/MZ)
  for (const [path, file] of fileMap) {
    const m = path.split('/').pop().match(MAP_FILE);
    if (m && (!dataPrefix || path.startsWith(dataPrefix))) { mapFiles.set(parseInt(m[1] || m[3], 10), file); ext = (m[2] || m[4]).toLowerCase(); }
  }

  if (!dataPrefix && mapFiles.size === 0) {
    return failLoad(notGameMessage(name, [...fileMap.keys(), ...seen]), 'open-fail-nomedia');
  }
  if (mapFiles.size === 0 && otherEngine([...fileMap.keys(), ...seen])) {
    return failLoad(notGameMessage(name, [...fileMap.keys(), ...seen]), 'open-fail-nomedia');
  }
  if (mapFiles.size === 0) return failLoad('No map files (Map###.json, .rvdata2, .rvdata or .rxdata) found in the data folder.');
  const engine = typeof rgssEngine === 'function' ? rgssEngine('.' + ext) : null;
  Loader.step('detect', 'done', `${mapFiles.size} map file${mapFiles.size === 1 ? '' : 's'}`);

  // ── read: the four small files, in parallel (RPG Maker 2000/2003: the map tree and the database) ──
  const lcf = ext === 'lmu';
  const names = lcf ? ['RPG_RT.lmt', 'RPG_RT.ldb'] : ['MapInfos', 'Actors', 'System', 'CommonEvents'].map(n => n + '.' + ext);
  let read = 0;
  Loader.step('read', 'active', `0/${names.length}`);
  Loader.progress(0, names.length);
  const got = await Promise.all(names.map(async name => {
    const f = findFile(fileMap, dataPrefix, name);
    let json = null;
    if (f) {
      try { json = lcf ? new Uint8Array(await f.arrayBuffer()) : await readGameData(f, name); } catch {}
    }
    Loader.detail('read', `${++read}/${names.length}`);
    Loader.progress(read, names.length);
    return json;
  }));
  let infos, actors, system, cevs, lcfEnc = null;
  if (lcf) {
    if (!got[1]) return failLoad('RPG_RT.ldb is missing or unreadable: it holds the database of an RPG Maker 2000/2003 game.');
    lcfEnc = lcfEncoding(lcfSamples(got[0] || new Uint8Array(0), got[1]));
    try { infos = got[0] ? lcfMapTree(got[0], lcfEnc) : null; } catch { infos = null; }
    let db;
    try { db = lcfDatabase(got[1], lcfEnc); } catch (e) { return failLoad('Could not read RPG_RT.ldb: ' + e.message); }
    ({ actors, system, commonEvents: cevs } = db);
  } else {
    [infos, actors, system, cevs] = got;
  }
  guard();   // last chance to cancel: from here the new game replaces the open one

  // ── commit ──
  current = id;
  S.mapInfos = {};
  S.collapsedFolders = new Set();
  (Array.isArray(infos) ? infos : []).forEach((info, i) => {
    if (!info) return;
    S.mapInfos[i] = { name: info.name, parentId: info.parentId ?? 0, order: info.order ?? i, expanded: info.expanded !== false };
    if (info.expanded === false) S.collapsedFolders.add(i);
  });
  S.actors       = Array.isArray(actors) ? actors.map(a => (a && a.name) || '') : [];
  S.actorStart   = Array.isArray(actors) ? actors.map(a => a ? { name: a.name || '', classId: a.classId || 0, equips: Array.isArray(a.equips) ? a.equips : [] } : null) : [];
  S.party        = (system && Array.isArray(system.partyMembers)) ? system.partyMembers : [];
  S.variables    = (system && system.variables) || [];
  S.switches     = (system && system.switches)  || [];
  S.commonEvents = cevs ? parseCommonEvents(cevs) : [];
  S.maps = new Map();
  S.dataExt = ext;
  S.lcfEncoding = lcfEnc;   // RPG Maker 2000/2003: the code page of the game's text
  S.save = null;   // a save belongs to the game it came from (save.js)
  if (typeof syncSave === 'function') syncSave();
  S.mapFiles = new Map([...mapFiles].sort((a, b) => a[0] - b[0]));
  // The game folder (parent of data/), for the scene player's pictures and audio (media.js).
  if (typeof Media !== 'undefined') {
    // RPG Maker 2000/2003 from a file list: the game root is the folder of RPG_RT.ldb.
    const lcfRoot = lcf && [...fileMap.keys()].find(k => /(^|\/)RPG_RT\.ldb$/i.test(k));
    let root = files.mediaRoot || (files.gameRoot ? treeRoot(files.gameRoot.fs, files.gameRoot.node)
      : lcfRoot ? filesRoot(fileMap, lcfRoot.replace(/RPG_RT\.ldb$/i, ''))
      : dataPrefix ? filesRoot(fileMap, dataPrefix.replace(/data\/$/i, '')) : null);
    if (engine) root = rgssMediaRoot(root);   // Graphics/ where MV has img/
    if (lcf) root = lcfMediaRoot(root);       // Picture/, FaceSet/, Music/, Sound/
    Media.reset(root, system);
    // Plugin text keys (\REM_MAP[…]) → the game's loc/ files (loc.js); the page on screen
    // is drawn again once they are in.
    S.loc = null;
    if (typeof locLoad === 'function') {
      locLoad(root).then(loc => {
        if (!loc || id !== current) return;
        S.loc = loc;
        if (typeof redrawPage === 'function') redrawPage();
      });
    }
  }
  S.remoteLink = files.remoteLink || null;   // only a game link keeps one
  S.folderHandle = files.folderHandle || null;   // a folder behind a directory handle keeps it
  syncSwitch();
  S.selectedMapId = null;
  S.selectedEvId = null;
  S.currentPage = null;
  mapReads = new Map();
  loadInfo = { total: S.mapFiles.size, done: 0, picked: false };

  Loader.step('read', 'done');
  Loader.step('map', 'active', `0/${loadInfo.total} maps read`);
  Loader.commit();
  setStatus('info', SPINNER + 'Reading maps…');
  track('open-ok');
  // engine: 'xp' | 'vx' | 'vxace' (rgss.js); MZ's System.json has "advanced", MV's does not.
  track(engine ? 'engine-' + engine : engineEvent(lcf ? 'RPG Maker 2000/2003' : system ? (system.advanced ? 'RPG Maker MZ' : 'RPG Maker MV') : 'MV/MZ'));
  renderSidebar();
  setSidebar(!isPhone());   // phones: a drawer, closed until the menu button opens it
  showMapProgress();

  S.bgDone = readMapsInBackground(id);
}

/* ── Map reading: the one on screen first, the rest in the background ── */
function ensureMap(mapId) {
  if (S.maps.has(mapId)) return Promise.resolve(S.maps.get(mapId));
  if (!mapReads.has(mapId)) {
    if (!S.mapFiles.has(mapId)) return Promise.resolve(null);
    mapReads.set(mapId, readMap(mapId, current));
  }
  return mapReads.get(mapId);
}

// Foreground read (the user opened this map): the background pauses meanwhile.
async function openMap(mapId) {
  Fg.active++;
  try { return await ensureMap(mapId); } finally { Fg.active--; }
}

async function readMap(mapId, id) {
  const file = S.mapFiles.get(mapId);
  let data = null;
  try {
    const json = S.dataExt === 'lmu' ? lcfMap(new Uint8Array(await file.arrayBuffer()), S.lcfEncoding)
      : await readGameData(file, `Map${String(mapId).padStart(3, '0')}.${S.dataExt || 'json'}`);
    data = parseMapJson(json, mapId, S.mapInfos);
  } catch {}
  if (id !== current) return null;   // another game was opened meanwhile
  S.mapFiles.delete(mapId);
  if (data && data.events.length > 0) S.maps.set(mapId, data);
  else data = null;
  mapRead(mapId, data);
  return data;
}

// Sidebar order (what the user sees from the top), then maps outside MapInfos.
function mapReadOrder() {
  const kids = {};
  for (const [id, info] of Object.entries(S.mapInfos)) (kids[info.parentId ?? 0] = kids[info.parentId ?? 0] || []).push(+id);
  const order = [], seen = new Set();
  const walk = pid => {
    (kids[pid] || []).sort((a, b) => (S.mapInfos[a].order ?? 0) - (S.mapInfos[b].order ?? 0)).forEach(id => {
      if (seen.has(id)) return;
      seen.add(id); order.push(id); walk(id);
    });
  };
  walk(0);
  for (const id of S.mapFiles.keys()) if (!seen.has(id)) order.push(id);
  return order.filter(id => S.mapFiles.has(id));
}

async function readMapsInBackground(id) {
  for (const mapId of mapReadOrder()) {
    while (Fg.active && id === current) await sleep(30);
    if (id !== current) return;
    await ensureMap(mapId);
    await sleep(0);   // let the page paint and handle input between maps
  }
  if (id === current) finishLoad();
}

function mapRead(mapId, data) {
  loadInfo.done++;
  showMapProgress();
  const count = EL.sbList && EL.sbList.querySelector(`[data-map-id="${mapId}"] .sb-count`);
  if (data && count) { count.textContent = data.events.length; count.classList.remove('pending'); count.removeAttribute('title'); }
  else refreshSidebarSoon();   // a map without events leaves the tree

  // Open the first map with events, unless the user already picked one.
  if (data && !loadInfo.picked && S.selectedMapId == null) {
    loadInfo.picked = true;
    if (typeof Feedback !== 'undefined') Feedback.noteOpen();   // may ask for a rating from the 2nd game (feedback.js)
    selectMap(mapId);
  }
  if (loadInfo.picked && Loader.active) {
    Loader.step('map', 'done');
    Loader.close();
  }
}

function showMapProgress() {
  EL.scanStatus.textContent = `Reading maps ${loadInfo.done}/${loadInfo.total}…`;
  if (Loader.active) {
    Loader.detail('map', `${loadInfo.done}/${loadInfo.total} maps read`);
    Loader.progress(loadInfo.done, loadInfo.total);
  }
}

function finishLoad() {
  clearTimeout(sidebarTimer); sidebarTimer = 0;
  if (S.maps.size === 0) {
    EL.scanStatus.textContent = '';
    EL.sidebar.classList.add('hidden');
    EL.sbResizer.classList.add('hidden');
    failLoad('No events found in any map file.', '');
    return;
  }
  const totalEvents = [...S.maps.values()].reduce((s, m) => s + m.events.length, 0);
  const n = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
  EL.scanStatus.textContent = `${n(S.maps.size, 'map')} · ${n(totalEvents, 'event')}`;
  setStatus('ok', `Loaded ${n(S.maps.size, 'map')} with ${n(totalEvents, 'event')} and ${n(S.commonEvents.length, 'common event')}.`);
  renderSidebar();
}

let sidebarTimer = 0;
function refreshSidebarSoon() {
  if (sidebarTimer) return;
  sidebarTimer = setTimeout(() => { sidebarTimer = 0; renderSidebar(); }, 400);
}

// The file in the chosen data folder first: a game can ship more (data-en/, data-tw/ …).
function findFile(fileMap, prefix, name) {
  const target = (prefix + name).toLowerCase();
  let fallback = null;
  for (const [path, file] of fileMap) {
    const p = path.toLowerCase();
    if (p === target) return file;
    if (!fallback && (p === name.toLowerCase() || p.endsWith('/' + name.toLowerCase()))) fallback = file;
  }
  return fallback;
}

function setStatus(cls, html) {
  const statusEl = EL.setupStatus;
  if (!statusEl) return;
  statusEl.className = cls;
  statusEl.innerHTML = html;
}

/* ── Finding data/ without walking the whole game ─────── */
// Directory adapters: folder picker handles and drag & drop entries.
const FS_HANDLE = {
  async list(dir) {
    const out = [];
    for await (const [name, node] of dir) out.push({ name, node, isDir: node.kind === 'directory' });
    return out;
  },
  file: node => node.getFile(),
};

const FS_ENTRY = {
  // readEntries() returns at most ~100 entries per call: keep calling until it returns none.
  list(dir) {
    const reader = dir.createReader(), out = [];
    return new Promise((resolve, reject) => {
      const next = () => reader.readEntries(batch => {
        if (!batch.length) return resolve(out);
        for (const node of batch) out.push({ name: node.name, node, isDir: node.isDirectory });
        next();
      }, reject);
      next();
    });
  },
  file: node => new Promise((resolve, reject) => node.file(resolve, reject)),
};

// Breadth-first from the selected folder: the first folder holding Map###.json wins
// (a folder named data first at each level). Returns lazy file-likes for the
// data/*.json files only; nothing is read until text() is called. The folder above
// it (the game root, where img/ and audio/ live) rides along as files.gameRoot.
async function findDataFiles(root, fs, onDir) {
  let level = [{ dir: root, path: '', parent: null }];
  const seen = [];   // every name listed, for notGameMessage() when nothing is found
  for (let depth = 0; depth <= DATA_DEPTH && level.length; depth++) {
    const next = [];
    for (const { dir, path, parent } of level) {
      if (onDir) onDir(path);
      const kids = await fs.list(dir);
      for (const k of kids) seen.push(path + k.name + (k.isDir ? '/' : ''));
      const files = kids.filter(k => !k.isDir && DATA_FILE.test(k.name));
      const arch = kids.find(k => !k.isDir && RGSS_ARCHIVE.test(k.name));
      if (arch && !files.some(k => MAP_FILE.test(k.name))) {   // XP/VX/VX Ace: Data/ is in the archive
        const out = [{ name: arch.name, _dragPath: path + arch.name, file: () => fs.file(arch.node) }];
        out.gameRoot = { fs, node: dir };
        return out;
      }
      if (files.some(k => MAP_FILE.test(k.name))) {
        const out = files.map(k => ({
          name: k.name,
          _dragPath: path + k.name,
          text: () => fs.file(k.node).then(f => f.text()),
          arrayBuffer: () => fs.file(k.node).then(f => f.arrayBuffer()),
        }));
        // data/'s parent is the game root; RPG Maker 2000/2003 keeps its data in the root itself.
        out.gameRoot = files.some(k => /\.lmu$/i.test(k.name)) ? { fs, node: dir } : parent ? { fs, node: parent } : null;
        return out;
      }
      kids.filter(k => k.isDir && !SKIP_DIRS.test(k.name))
        .sort((a, b) => (/^data$/i.test(b.name) ? 1 : 0) - (/^data$/i.test(a.name) ? 1 : 0))
        .forEach(k => next.push({ dir: k.node, path: path + k.name + '/', parent: dir }));
    }
    level = next;
  }
  const none = [];
  none.seen = seen;
  return none;
}

async function openWithFSAPI() {
  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: 'makerlens-game', mode: 'read' });
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('err', 'Could not open folder: ' + e.message);
    return;
  }
  await openFolder(dir, FS_HANDLE, 'open-picker');
}

// A directory handle (picker) or entry (drag & drop): only data/*.json is listed.
function openFolder(root, fs, way = 'open-picker') {
  return runLoad(root.name || '', async guard => {
    const out = await findDataFiles(root, fs, path => {
      guard();
      Loader.detail('detect', path ? path : 'looking in the folder…');
    });
    if (fs === FS_HANDLE) out.folderHandle = root;   // kept for the switch to Assets
    return out;
  }, undefined, way);
}

/* ── Game link (js/remote.js) ───────────────────────────
   A game published with rpgmaker-web-toolkit, opened through the read-only link
   the game’s Share menu makes. data/*.json are read through the same path as a folder; the scene
   player's pictures and audio come from the game's file list, one file at a time.
   Only the game's own site is contacted, with the key in a header (no cookies). */
function remoteMedia(list, api) {
  const files = new Map();
  for (const rel of Object.keys(list)) {
    if (!/^(img|audio)\//.test(rel) && rel !== 'js/plugins.js') continue;
    files.set(rel, {
      name: rel.split('/').pop(),
      arrayBuffer: () => api.blob(rel).then(b => b.arrayBuffer()),
      text: () => api.blob(rel).then(b => b.text()),
    });
  }
  return filesRoot(files, '');
}

function openRemote(link) {
  const api = Remote.client(link);
  return runLoad(api.host, async guard => {
    Loader.detail('detect', 'connecting…');
    await api.ping();
    guard();
    Loader.detail('detect', 'reading the file list…');
    const manifest = await api.manifest();
    guard();
    const out = Object.keys(manifest.files)
      .filter(rel => /^data\/[^/]+$/.test(rel) && DATA_FILE.test(rel.slice(5)))
      .map(rel => ({
        name: rel.slice(5),
        _dragPath: rel,
        text: () => api.blob(rel).then(b => b.text()),
      }));
    out.mediaRoot = remoteMedia(manifest.files, api);
    out.remoteLink = link;   // kept for the switch button (memory only)
    return out;
  }, 'remote', 'open-link');
}

// The link in the address (the one the game’s Share menu shows): open it, and take the key
// out of the address bar and the history.
function openFromAddress() {
  const link = Remote.fromLocation(location.hash);
  if (!link) return;
  history.replaceState(null, '', location.pathname + location.search);
  openRemote(link);
}
