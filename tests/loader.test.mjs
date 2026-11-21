import assert from 'node:assert/strict';
import { test } from 'node:test';
import { c, load, plain } from './helpers.mjs';
import { marshal, obj, rgss3a } from './marshal-writer.mjs';
import * as L from './lcf-writer.mjs';

// A fake File: what loadFolder() reads from <input webkitdirectory> or the folder picker.
const file = (path, json) => ({
  name: path.split('/').pop(),
  webkitRelativePath: path,
  text: async () => (typeof json === 'string' ? json : JSON.stringify(json)),
});

function setup() {
  const calls = { status: [], sidebar: 0, selected: [], hidden: false, loader: [], failed: [], cancel: false, committed: 0, closed: 0 };
  const cls = () => ({ remove() { calls.hidden = false; }, add() { calls.hidden = true; } });
  // Stand-in for loadui.js's Loader: records the steps instead of touching the DOM.
  const Loader = {
    active: false,
    open(o) { Loader.active = true; calls.cancel = false; calls.loader.push(['open', o.name]); },
    step(id, state) { calls.loader.push([id, state]); },
    detail() {}, progress() {},
    commit() { calls.committed++; },
    fail(m) { calls.failed.push(m); },
    close() { Loader.active = false; calls.closed++; },
    check() { if (calls.cancel) throw new DOMException('cancelled', 'AbortError'); },
  };
  const get = load(['constants.js', 'parser.js', 'state.js', 'decrypt-rgssad.js', 'rgss.js', 'xyz.js', 'lcf.js', 'loader.js'], {
    EL: { scanStatus: {}, switchTool: {}, sidebar: { classList: cls() }, sbResizer: { classList: cls() } },
    setTimeout, clearTimeout, DOMException, Loader, TextDecoder, TextEncoder,
  });
  // UI functions from other files, replaced with recorders.
  get('globalThis').__calls = calls;
  get('setStatus = (k, h) => __calls.status.push([k, h]); renderSidebar = () => __calls.sidebar++; selectMap = id => __calls.selected.push(id);');
  return { get, calls };
}

const game = root => [
  file(`${root}data/MapInfos.json`, [null, { name: 'Town', parentId: 0, order: 1, expanded: false }, { name: 'Inn', parentId: 1, order: 2 }]),
  file(`${root}data/Actors.json`, [null, { name: 'Harold', classId: 2, equips: [1, 0, 0, 5, 0] }]),
  file(`${root}data/System.json`, { switches: ['', 'Met King'], variables: ['', 'Gold'], partyMembers: [1] }),
  file(`${root}data/CommonEvents.json`, [null, { id: 1, name: 'Heal', list: [c(0, 0)] }]),
  file(`${root}data/Map001.json`, { events: [null, { id: 1, name: 'Guard', x: 1, y: 2, pages: [{ list: [c(101, 0, ['']), c(401, 0, ['Halt']), c(0, 0)] }] }] }),
  file(`${root}data/Map002.json`, { events: [null, { id: 1, name: 'Keeper', x: 0, y: 0, pages: [{ list: [] }] }] }),
  file(`${root}data/Map003.json`, { events: [] }),          // no events: not listed
  file(`${root}data/Map004.json`, '{ broken json'),          // unreadable: skipped
  file(`${root}img/faces/Actor1.png`, ''),
];

test('loads a game folder: map tree, names, common events and maps with events', async () => {
  const { get, calls } = setup();
  await get('loadFolder')(game('MyGame/'));
  await get('S.bgDone');
  const S = get('S');
  assert.deepEqual(plain(S.mapInfos), {
    1: { name: 'Town', parentId: 0, order: 1, expanded: false },
    2: { name: 'Inn', parentId: 1, order: 2, expanded: true },
  });
  assert.deepEqual(plain([...S.collapsedFolders]), [1]);
  assert.deepEqual(plain(S.actors), ['', 'Harold']);
  assert.deepEqual(plain(S.actorStart), [null, { name: 'Harold', classId: 2, equips: [1, 0, 0, 5, 0] }]);
  assert.deepEqual(plain(S.party), [1]);
  assert.deepEqual(plain(S.switches), ['', 'Met King']);
  assert.deepEqual(plain(S.variables), ['', 'Gold']);
  assert.deepEqual(plain(S.commonEvents.map(e => e.name)), ['Heal']);
  assert.deepEqual(plain([...S.maps.keys()].sort()), [1, 2]);
  assert.equal(S.maps.get(1).mapName, 'Town');
  assert.equal(S.maps.get(1).events[0].pages[0].list.length, 3);
  assert.ok(calls.sidebar >= 1);
  assert.deepEqual(calls.selected, [1]);           // the first map with events opens by itself
  assert.equal(calls.committed, 1);
  assert.deepEqual(calls.loader.filter(l => l[0] !== 'open').map(l => l.join(':')),
    ['detect:active', 'detect:done', 'read:active', 'read:done', 'map:active', 'map:done']);
  assert.equal(calls.closed, 1);                   // the overlay closes once the first map is up
  assert.equal(calls.failed.length, 0);
  assert.equal(S.mapFiles.size, 0);                // every map was read in the background
  assert.equal(calls.status.at(-1)[0], 'ok');
  assert.match(calls.status.at(-1)[1], /2 maps with 2 events and 1 common event\./);
});

// RPG Maker XP data (Ruby Marshal, js/rgss.js) as Files of a picked folder.
const bin = (path, bytes) => ({ name: path.split('/').pop(), webkitRelativePath: path,
  arrayBuffer: async () => bytes.buffer, text: async () => new TextDecoder().decode(bytes) });
const cmd = (code, indent, parameters) => obj('RPG::EventCommand', { code, indent, parameters });
const xpData = {
  'MapInfos.rxdata': new Map([[1, obj('RPG::MapInfo', { name: 'Castle', parent_id: 0, order: 1, expanded: true })]]),
  'Actors.rxdata': [null, obj('RPG::Actor', { id: 1, name: 'Aluxes', class_id: 1, weapon_id: 1, armor1_id: 0, armor2_id: 0, armor3_id: 0, armor4_id: 0 })],
  'System.rxdata': obj('RPG::System', { switches: [null, 'Door open'], variables: [null, 'Steps'], party_members: [1] }),
  'CommonEvents.rxdata': [null, obj('RPG::CommonEvent', { id: 1, name: 'Bell', trigger: 0, switch_id: 1, list: [cmd(0, 0, [])] })],
  'Map001.rxdata': obj('RPG::Map', { events: new Map([[2, obj('RPG::Event', { id: 2, name: 'King', x: 1, y: 1,
    pages: [obj('RPG::Event::Page', { list: [cmd(101, 0, ['Welcome']), cmd(0, 0, [])] })] })]]) }),
};

test('loads an RPG Maker XP game: Data/*.rxdata through Marshal', async () => {
  const { get, calls } = setup();
  await get('loadFolder')(Object.entries(xpData).map(([n, v]) => bin('XPGame/Data/' + n, marshal(v))));
  await get('S.bgDone');
  const S = get('S');
  assert.equal(calls.failed.length, 0, calls.failed.join());
  assert.deepEqual(plain(S.mapInfos), { 1: { name: 'Castle', parentId: 0, order: 1, expanded: true } });
  assert.deepEqual(plain(S.actors), ['', 'Aluxes']);
  assert.deepEqual(plain(S.switches), ['', 'Door open']);
  assert.deepEqual(plain(S.commonEvents.map(e => e.name)), ['Bell']);
  const list = plain(S.maps.get(1).events[0].pages[0].list);
  assert.deepEqual(list.slice(0, 2), [c(101, 0, ['', 0, 0, 2]), c(401, 0, ['Welcome'])]);
  assert.equal(S.dataExt, 'rxdata');
});

test('loads a game whose Data/ is inside Game.rgss3a (only the archive in hand)', async () => {
  const { get, calls } = setup();
  const arch = rgss3a(Object.entries(xpData).map(([n, v]) => ['Data\\' + n.replace('rxdata', 'rvdata2'), marshal(v)]));
  await get('loadFolder')([{ ...arch, webkitRelativePath: 'AceGame/Game.rgss3a' }, bin('AceGame/Audio/BGM/x.ogg', new Uint8Array(1))]);
  await get('S.bgDone');
  const S = get('S');
  assert.equal(calls.failed.length, 0, calls.failed.join());
  assert.deepEqual(plain(S.actors), ['', 'Aluxes']);
  assert.equal(S.maps.get(1).events[0].name, 'King');
  assert.equal(S.dataExt, 'rvdata2');
});

test('loads an RPG Maker 2000/2003 game: RPG_RT.lmt, RPG_RT.ldb and Map####.lmu', async () => {
  const { get, calls } = setup();
  const sjTown = [0x92, 0xac], sjHello = [0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd];
  const tree = L.lmt([[0, [[1, L.str('Project')], [4, L.int(0)]]], [1, [[1, sjTown], [2, L.int(0)], [4, L.int(1)], [7, L.int(1)]]], [2, [[1, L.str('Empty')], [2, L.int(1)], [4, L.int(1)]]]]);
  const db = L.ldb([[0x0b, L.array([[1, [[1, L.str('Alex')]]]])], [0x17, L.array([[1, [[1, sjHello]]]])],
    [0x19, L.array([[1, [[1, L.str('Bell')], [0x16, L.commands([[10, 0]])]]]])]]);
  const map1 = L.lmu([[0x51, L.array([[1, [[1, L.str('Guard')], [5, L.array([[1, [[0x34, L.commands([[10110, 0, sjHello], [10, 0]])]]]])]]]])]]);
  const map2 = L.lmu([[0x51, L.array([])]]);
  await get('loadFolder')([bin('Yume/RPG_RT.lmt', tree), bin('Yume/RPG_RT.ldb', db), bin('Yume/Map0001.lmu', map1),
    bin('Yume/Map0002.lmu', map2), bin('Yume/Picture/a.png', new Uint8Array(1))]);
  await get('S.bgDone');
  const S = get('S');
  assert.equal(calls.failed.length, 0, calls.failed.join());
  assert.equal(S.dataExt, 'lmu');
  assert.equal(S.lcfEncoding, 'shift_jis');
  assert.deepEqual(plain(S.mapInfos), { 1: { name: '町', parentId: 0, order: 2, expanded: true }, 2: { name: 'Empty', parentId: 1, order: 3, expanded: false } });
  assert.deepEqual(plain(S.actors), ['', 'Alex']);
  assert.deepEqual(plain(S.switches), ['', 'こんにちは']);
  assert.deepEqual(plain(S.commonEvents.map(e => e.name)), ['Bell']);
  assert.deepEqual(plain([...S.maps.keys()]), [1], 'the map without events leaves the tree');
  assert.deepEqual(plain(S.maps.get(1).events[0].pages[0].list[1]), c(401, 0, ['こんにちは']));
});

test('an RPG Maker 2000/2003 folder without RPG_RT.ldb says so', async () => {
  const { get, calls } = setup();
  await get('loadFolder')([bin('G/Map0001.lmu', L.lmu([[0x51, L.array([])]]))]);
  assert.match(calls.failed.join(), /RPG_RT\.ldb/);
});

test('also works when only the data/ folder is selected, or with Windows separators', async () => {
  for (const files of [game(''), game('G\\').map(f => ({ ...f, webkitRelativePath: f.webkitRelativePath.replace(/\//g, '\\') }))]) {
    const { get } = setup();
    await get('loadFolder')(files);
    await get('S.bgDone');
    assert.equal(get('S.maps.size'), 2);
    assert.equal(get('S.mapInfos[1].name'), 'Town');
  }
});

test('a folder without RPG Maker data reports an error and loads nothing', async () => {
  const { get, calls } = setup();
  await get('loadFolder')([file('Photos/cat.png', '')]);
  assert.equal(calls.status.at(-1)[0], 'err');
  assert.match(calls.status.at(-1)[1], /No RPG Maker game data found in "Photos"\. Select the game's main folder/);
  assert.match(calls.failed[0], /No RPG Maker game data found/);   // shown in the overlay too
  assert.equal(calls.sidebar, 0);
});

test('a folder inside the game (img/, img/pictures/) says to pick the folder above it', async () => {
  for (const [path, top] of [['img/pictures/a.png_', 'img'], ['pictures/a.png_', 'pictures'], ['Graphics/x.png', 'Graphics']]) {
    const { get, calls } = setup();
    await get('loadFolder')([file(path, '')]);
    assert.match(calls.failed[0], new RegExp(`"${top}" is a folder inside the game\\. Select the folder above it`));
  }
});

test('maps without any event report an error', async () => {
  const { get, calls } = setup();
  await get('loadFolder')([file('G/data/Map001.json', { events: [null] })]);
  await get('S.bgDone');
  assert.match(calls.status.at(-1)[1], /No events found/);
  assert.equal(calls.hidden, true);                // the sidebar shown early is hidden again
  assert.deepEqual(calls.selected, []);
});

test('findFile matches names case-insensitively, under the data prefix or any folder', () => {
  const { get } = setup();
  const findFile = get('findFile');
  const m = new Map([['G/DATA/mapinfos.JSON', 'a'], ['other/System.json', 'b']]);
  assert.equal(findFile(m, 'G/data/', 'MapInfos.json'), 'a');
  assert.equal(findFile(m, 'G/data/', 'System.json'), 'b');
  assert.equal(findFile(m, 'G/data/', 'Actors.json'), null);
});

test('the map tree shows before any Map###.json is read; maps are read lazily', async () => {
  const { get, calls } = setup();
  const reads = [];
  const files = game('G/').map(f => ({ ...f, text: async () => { reads.push(f.name); return f.text(); } }));
  await get('loadFolder')(files);
  assert.equal(calls.sidebar, 1);
  assert.equal(get('S.maps.size'), 0);                        // tree first, before any map is parsed
  assert.ok(reads.filter(n => /^Map\d/.test(n)).length <= 1);  // at most the background's first map started
  assert.deepEqual(plain([...get('S.mapFiles.keys()')]), [1, 2, 3, 4]);
  // Opening a map reads it at once, ahead of the background.
  const map = await get('openMap')(2);
  assert.equal(map.events[0].name, 'Keeper');
  await get('S.bgDone');
  assert.equal(reads.filter(n => n === 'Map002.json').length, 1);   // read once, not again by the background
  assert.equal(await get('ensureMap')(3), null);                     // no events
});

test('opening another folder stops the previous background reading', async () => {
  const { get } = setup();
  let release;
  const slow = new Promise(r => { release = r; });
  const first = game('A/').map(f => /Map00[2-4]/.test(f.name) ? { ...f, text: async () => { await slow; return f.text(); } } : f);
  await get('loadFolder')(first);
  const firstDone = get('S.bgDone');
  await get('loadFolder')([file('B/data/Map007.json', { events: [null, { id: 1, name: 'Other', pages: [] }] })]);
  release();
  await firstDone;
  await get('S.bgDone');
  assert.deepEqual(plain([...get('S.maps.keys()')]), [7]);
});

// A fake directory tree for the folder picker (FileSystemDirectoryHandle) adapter.
function dir(tree, log, path = '') {
  return {
    kind: 'directory',
    async *[Symbol.asyncIterator]() {
      log.push(path || '/');
      for (const [name, v] of Object.entries(tree)) {
        yield [name, typeof v === 'object' ? dir(v, log, path + name + '/') : { kind: 'file', getFile: async () => ({ text: async () => v }) }];
      }
    },
  };
}

test('findDataFiles finds www/data without walking img/ or audio/, and reads nothing', async () => {
  const listed = [];
  const root = dir({
    'Game.exe': '', img: { faces: { 'a.png': '' } }, audio: { bgm: { 'b.ogg': '' } },
    www: { img: {}, data: { 'Map001.json': '{"events":[]}', 'System.json': '{}', 'Tilesets.json': '[]' } },
  }, listed);
  const files = await get0('findDataFiles')(root, get0('FS_HANDLE'));
  assert.deepEqual(plain(files.map(f => f._dragPath).sort()), ['www/data/Map001.json', 'www/data/System.json']);
  assert.deepEqual(listed, ['/', 'www/', 'www/data/']);
  assert.equal(await files.find(f => f.name === 'Map001.json').text(), '{"events":[]}');
});

test('findDataFiles: an XP/VX/VX Ace game folder gives its archive, or its Data/*.rvdata2', async () => {
  const listed = [];
  const root = dir({ 'Game.exe': '', 'Game.rgss3a': 'x', Graphics: { Pictures: { 'a.png': '' } }, Audio: { BGM: {} } }, listed);
  const files = await get0('findDataFiles')(root, get0('FS_HANDLE'));
  assert.deepEqual(plain(files.map(f => f._dragPath)), ['Game.rgss3a']);
  assert.deepEqual(listed, ['/'], 'Graphics/ and Audio/ are never walked');
  assert.ok(files.gameRoot && typeof files[0].file === 'function');

  const project = dir({ Data: { 'Map001.rvdata2': 'm', 'System.rvdata2': 's', 'Scripts.rvdata2': '' }, Graphics: {} }, []);
  const data = await get0('findDataFiles')(project, get0('FS_HANDLE'));
  assert.deepEqual(plain(data.map(f => f._dragPath).sort()), ['Data/Map001.rvdata2', 'Data/System.rvdata2']);
});

test('findDataFiles: an RPG Maker 2000/2003 game root, without walking its asset folders', async () => {
  const listed = [];
  const root = dir({ 'RPG_RT.exe': '', 'RPG_RT.ldb': 'd', 'RPG_RT.lmt': 't', 'Map0001.lmu': 'm', 'RPG_RT.ini': '',
    CharSet: { 'a.xyz': '' }, Picture: {}, Music: {} }, listed);
  const files = await get0('findDataFiles')(root, get0('FS_HANDLE'));
  assert.deepEqual(plain(files.map(f => f._dragPath).sort()), ['Map0001.lmu', 'RPG_RT.ldb', 'RPG_RT.lmt']);
  assert.deepEqual(listed, ['/']);
  assert.ok(files.gameRoot && files.gameRoot.node === root, 'the game root is the folder itself');
});

test('FS_ENTRY keeps calling readEntries until it returns an empty batch (more than 100 files)', async () => {
  const entries = Array.from({ length: 250 }, (_, i) => ({ name: `f${i}`, isDirectory: false }));
  let at = 0;
  const d = { createReader: () => ({ readEntries(ok) { const b = entries.slice(at, at + 100); at += b.length; ok(b); } }) };
  assert.equal((await get0('FS_ENTRY').list(d)).length, 250);
});

function get0(name) { return setup().get(name); }

test('the overlay names the game folder', async () => {
  const { get, calls } = setup();
  await get('loadFolder')(game('MyGame/'));
  assert.deepEqual(calls.loader[0], ['open', 'MyGame']);
});

test('Cancel before the commit keeps the game that was open', async () => {
  const { get, calls } = setup();
  await get('loadFolder')(game('First/'));
  await get('S.bgDone');
  const before = plain([...get('S.maps.keys()')]);
  calls.sidebar = 0;
  const second = game('Second/').map(f => ({ ...f, text: async () => { calls.cancel = true; return f.text(); } }));
  await get('loadFolder')(second);   // Cancel is pressed while the small files are read
  assert.deepEqual(plain([...get('S.maps.keys()')]), before);
  assert.equal(get('S.mapInfos[1].name'), 'Town');
  assert.equal(calls.sidebar, 0);
  assert.equal(calls.closed, 2);     // overlay closed, no error shown
  assert.equal(calls.failed.length, 0);
  // The open game still works: its maps load on demand.
  assert.equal((await get('ensureMap')(2)).events[0].name, 'Keeper');
});

test('an error before the commit keeps the game that was open', async () => {
  const { get, calls } = setup();
  await get('loadFolder')(game('First/'));
  await get('S.bgDone');
  await get('loadFolder')([file('Photos/cat.png', '')]);
  assert.equal(get('S.maps.size'), 2);
  assert.equal(calls.failed.length, 1);
});

test('a load that is replaced by a newer one never commits', async () => {
  const { get } = setup();
  let release;
  const gate = new Promise(r => { release = r; });
  const slow = [file('A/data/Map001.json', { events: [null, { id: 1, name: 'A', pages: [] }] }),
                { ...file('A/data/MapInfos.json', []), text: async () => { await gate; return '[]'; } }];
  const first = get('loadFolder')(slow);
  const second = get('loadFolder')([file('B/data/Map002.json', { events: [null, { id: 1, name: 'B', pages: [] }] })]);
  release();
  await Promise.all([first, second]);
  await get('S.bgDone');
  assert.deepEqual(plain([...get('S.maps.keys()')]), [2]);
});

/* ── Game link (the game’s Share menu) ── */
test('opens a game from a link: data over the key, pictures read later from the game file list', async () => {
  const TOKEN = 'aabbccddeeff.' + 's'.repeat(32);
  const requests = [];
  const files = {
    'data/MapInfos.json': JSON.stringify([null, { name: 'Town', parentId: 0, order: 1 }]),
    'data/Actors.json': '[null]',
    'data/System.json': JSON.stringify({ switches: [''], variables: [''], encryptionKey: '' }),
    'data/CommonEvents.json': '[null]',
    'data/Map001.json': JSON.stringify({ events: [null, { id: 1, name: 'Guard', x: 0, y: 0, pages: [{ list: [c(101, 0, ['']), c(401, 0, ['Halt']), c(0, 0)] }] }] }),
    'img/pictures/Hero.png': 'PNGDATA',
  };
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    requests.push([path, init.headers.authorization, init.credentials]);
    if (path === '/_lens/ping') return Response.json({ ok: true });
    if (path === '/_lens/manifest') return Response.json({ title: 'G', engine: 'MZ', files: Object.fromEntries(Object.keys(files).map(k => [k, files[k].length])) });
    const rel = decodeURIComponent(path.slice('/_lens/file/'.length));
    return rel in files ? new Response(files[rel]) : new Response('', { status: 404 });
  };
  const { calls } = setup();
  // remote.js and media.js load into the same scope as the page's scripts do.
  const load2 = (await import('./helpers.mjs')).load(['constants.js', 'parser.js', 'state.js', 'remote.js', 'media.js', 'decrypt-rgssad.js', 'rgss.js', 'xyz.js', 'lcf.js', 'loader.js'], {
    EL: { scanStatus: {}, switchTool: {}, sidebar: { classList: { remove() {}, add() {} } }, sbResizer: { classList: { remove() {}, add() {} } } },
    setTimeout, clearTimeout, DOMException, URL, URLSearchParams, File, Blob, Response, encodeURIComponent, fetch: fetchImpl,
    Loader: { active: false, open(o) { calls.loader.push(['open', o.name, o.kind]); }, step() {}, detail() {}, progress() {}, commit() {}, fail(m) { calls.failed.push(m); }, close() {}, check() {} },
  });
  load2('globalThis').__calls = calls;
  load2('setStatus = (k, h) => __calls.status.push([k, h]); renderSidebar = () => {}; selectMap = id => __calls.selected.push(id);');

  const link = load2(`Remote.parseLink('https://makerlens.kokoroou.workers.dev/events/#game=${encodeURIComponent('https://my-game.alice.workers.dev')}&t=${TOKEN}')`);
  load2('globalThis').__link = link;
  await load2('openRemote(__link)');
  await load2('S.bgDone');

  assert.deepEqual(calls.loader[0], ['open', 'my-game.alice.workers.dev', 'remote']);
  assert.equal(calls.failed.length, 0);
  assert.deepEqual(plain([...load2('S.maps').keys()]), [1]);
  assert.deepEqual(calls.selected, [1]);
  assert.equal(load2('EL.switchTool.hidden'), false, 'a game link offers the switch to Assets');
  assert.equal(load2('S.remoteLink.origin'), 'https://my-game.alice.workers.dev');

  // The scene player's picture comes through the same link, when it is first asked for.
  const before = requests.length;
  const media = load2('Media');
  const dir = await media.root.list('img/pictures');
  assert.deepEqual([...dir.keys()], ['hero.png']);
  assert.equal(requests.length, before, 'listing a folder reads nothing');
  const bytes = await (await media.root.file(dir.get('hero.png'))).arrayBuffer();
  assert.equal(new TextDecoder().decode(bytes), 'PNGDATA');
  assert.equal(requests.at(-1)[0], '/_lens/file/img/pictures/Hero.png');

  for (const [, auth, credentials] of requests) {
    assert.equal(auth, `Bearer ${TOKEN}`);
    assert.equal(credentials, 'omit');
  }
  assert.ok(!requests.some(([p]) => p.includes('Map00') && !p.endsWith('Map001.json')));
});

test('a link that does not work ends in the loader’s error, not a crash', async () => {
  const { calls } = setup();
  const get = (await import('./helpers.mjs')).load(['constants.js', 'parser.js', 'state.js', 'remote.js', 'media.js', 'decrypt-rgssad.js', 'rgss.js', 'xyz.js', 'lcf.js', 'loader.js'], {
    EL: { scanStatus: {}, switchTool: {}, sidebar: { classList: { remove() {}, add() {} } }, sbResizer: { classList: { remove() {}, add() {} } } },
    setTimeout, clearTimeout, DOMException, URL, URLSearchParams, File, Blob, encodeURIComponent,
    fetch: async () => new Response('', { status: 401 }),
    Loader: { active: false, open() {}, step() {}, detail() {}, progress() {}, commit() {}, fail(m) { calls.failed.push(m); }, close() {}, check() {} },
  });
  get('globalThis').__calls = calls;
  get('setStatus = (k, h) => __calls.status.push([k, h]);');
  get('globalThis').__link = get(`Remote.parseLink('https://x/#game=${encodeURIComponent('https://g.alice.workers.dev')}&t=aabbccddeeff.${'s'.repeat(32)}')`);
  await get('openRemote(__link)');
  assert.match(calls.failed[0], /expired or was stopped/);
});
