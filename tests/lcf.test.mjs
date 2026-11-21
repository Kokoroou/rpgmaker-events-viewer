// RPG Maker 2000/2003 data (js/lcf.js) on synthetic LCF bytes from tests/lcf-writer.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';
import { load, plain, c } from './helpers.mjs';
import { ber, str, struct, array, int, commands, lmt, ldb, lmu } from './lcf-writer.mjs';

const run = load(['constants.js', 'parser.js', 'xyz.js', 'lcf.js'], { TextDecoder, TextEncoder, Blob, Response, CompressionStream, DecompressionStream });
const js = run('({ lcfReader, lcfEncoding, lcfSamples, lcfMapTree, lcfDatabase, lcfMap, lcfList, lcfMediaRoot, pngTransparent0, xyzToPng, parseMapJson })');
const shiftJis = { 'こんにちは': [0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd], '町': [0x92, 0xac], 'はい': [0x82, 0xcd, 0x82, 0xa2] };

test('BER integers and negatives as 32-bit values', () => {
  for (const n of [0, 1, 127, 128, 300, 16384, 2 ** 31 - 1]) assert.equal(js.lcfReader(new Uint8Array(ber(n))).ber(), n);
  const raw = new Uint8Array(commands([[10, 0, [], [-5, 7]]]));
  assert.deepEqual(plain(js.lcfList(raw, 'windows-1252')), [c(0, 0, [])], 'end of block');
});

test('lcfEncoding: Shift-JIS for Japanese, Windows-1252 for Western text, UTF-8', () => {
  assert.equal(js.lcfEncoding([new Uint8Array(shiftJis['こんにちは'])]), 'shift_jis');
  assert.equal(js.lcfEncoding([new Uint8Array(str('Café crème déjà vu'))]), 'windows-1252');
  assert.equal(js.lcfEncoding([new TextEncoder().encode('Café')]), 'utf-8');
  assert.equal(js.lcfEncoding([new Uint8Array(str('plain'))]), 'windows-1252');
});

test('lcfMapTree: maps only, parents, tree order', () => {
  const tree = lmt([
    [0, [[1, str('Project')], [4, int(0)]]],
    [1, [[1, shiftJis['町']], [2, int(0)], [4, int(1)], [7, int(1)]]],
    [2, [[1, str('Area')], [2, int(1)], [4, int(2)]]],
    [3, [[1, str('House')], [2, int(1)], [4, int(1)]]],
  ]);
  assert.deepEqual(plain(js.lcfMapTree(tree, 'shift_jis')), [null,
    { id: 1, name: '町', parentId: 0, order: 2, expanded: true }, null,
    { id: 3, name: 'House', parentId: 1, order: 4, expanded: false }]);
  assert.throws(() => js.lcfMapTree(new Uint8Array([...ber(4), ...str('Nope')])), /LcfMapTree/);
});

const msg = [
  [10130, 0, str('Face1'), [2, 0, 0]],
  [10110, 0, str('Hello \\N[1]')], [20110, 0, str('second line')],
  [10140, 0, str('Yes/No'), [1]],
  [20140, 0, str('Yes'), [0]], [10210, 1, [], [0, 3, 3, 0]], [10, 1],
  [20140, 0, str('No'), [1]], [10220, 1, [], [1, 4, 6, 1, 3, 2, 9]], [10, 1],
  [20141, 0],
  [12010, 0, [], [0, 3, 0, 0, 0, 1]], [10110, 1, str('on')], [10, 1], [22010, 0], [10110, 1, str('off')], [10, 1], [22011, 0],
  [12010, 0, [], [1, 4, 0, 5, 1, 0]], [10, 1], [22011, 0],
  [12010, 0, str('Alex'), [5, 1, 1, 0, 0, 0]], [10, 1], [22011, 0],
  [12010, 0, [], [10, 1, 0, 0, 0, 0]], [10, 1], [22011, 0],
  [11110, 0, str('cg1'), [1, 0, 160, 120, 0, 100, 25, 1, 100, 100, 100, 100, 0, 0]],
  [11120, 0, [], [1, 0, 100, 50, 0, 50, 0, 0, 100, 100, 100, 100, 0, 0, 10, 1]],
  [11130, 0, [], [1]],
  [11410, 0, [], [15]],
  [11510, 0, str('Town'), [0, 80, 100, 50]],
  [11550, 0, str('Bell'), [90, 120, 40]],
  [12110, 0, [], [2]], [12120, 0, [], [2]],
  [12330, 0, [], [0, 5, 0]],
  [11330, 0, [], [10001, 0, 0, 3, 1, 2]],   // move route: kept as is
  [10, 0],
];

test('lcfList maps RPG Maker 2000 commands to MV codes', () => {
  const list = plain(js.lcfList(new Uint8Array(commands(msg)), 'windows-1252'));
  const byCode = code => list.filter(x => x.code === code);
  assert.deepEqual(list.slice(1, 4), [c(101, 0, ['Face1', 2, 0, 2]), c(401, 0, ['Hello \\N[1]']), c(401, 0, ['second line'])]);
  assert.deepEqual(byCode(102)[0], c(102, 0, [['Yes', 'No'], -1, 0, 2, 0]));
  assert.deepEqual(byCode(402), [c(402, 0, [0, 'Yes']), c(402, 0, [1, 'No'])]);
  assert.deepEqual(byCode(404), [c(404, 0, [])]);
  assert.deepEqual(byCode(121), [c(121, 1, [3, 3, 0])]);
  assert.deepEqual(byCode(122), [c(122, 1, [4, 6, 1, 2, 2, 9])], 'random 2..9');
  assert.deepEqual(byCode(111).map(x => x.parameters), [[0, 3, 0], [1, 4, 0, 5, 1], [4, 1, 1, 'Alex'], [99, 10, 1, 0, 0, 0, 0]]);
  assert.equal(byCode(411).length, 1);
  assert.equal(byCode(412).length, 4);
  assert.deepEqual(byCode(231)[0].parameters, [1, 'cg1', 1, 0, 320, 240, 200, 200, 191, 0], 'centre origin, doubled, 25% transparent');
  assert.deepEqual(byCode(232)[0].parameters, [1, 0, 1, 0, 200, 100, 100, 100, 255, 0, 60, true], '1 s = 60 frames');
  assert.deepEqual(byCode(235)[0].parameters, [1]);
  assert.deepEqual(byCode(230)[0].parameters, [90]);
  assert.deepEqual(byCode(241)[0].parameters, [{ name: 'Town', volume: 80, pitch: 100, pan: 0 }]);
  assert.deepEqual(byCode(250)[0].parameters, [{ name: 'Bell', volume: 90, pitch: 120, pan: -10 }]);
  assert.deepEqual([byCode(118)[0].parameters, byCode(119)[0].parameters], [['2'], ['2']]);
  assert.deepEqual(byCode(117)[0].parameters, [5]);
  assert.deepEqual(byCode(11330)[0].parameters, [10001, 0, 0, 3, 1, 2]);
});

test('lcfDatabase and lcfMap: names, actors, common events, events in MV shape', () => {
  const db = ldb([
    [0x0b, array([[1, [[1, str('Alex')], [0x33, [3, 0, 0, 0, 7, 0, 0, 0, 0, 0]]]]])],
    [0x16, struct([[0x16, [1, 0, 2, 0]]])],
    [0x17, array([[1, [[1, str('Met guard')]]], [3, [[1, str('Door')]]]])],
    [0x18, array([[2, [[1, str('Coins')]]]])],
    [0x19, array([[1, [[1, str('Intro')], [0x0b, int(3)], [0x16, commands([[10110, 0, str('Hi')], [10, 0]])]]]])],
  ]);
  const d = plain(js.lcfDatabase(db, 'windows-1252'));
  assert.deepEqual(d.actors, [null, { id: 1, name: 'Alex', classId: 0, equips: [3, 0, 7, 0, 0] }]);
  assert.deepEqual(d.system.switches, ['', 'Met guard', '', 'Door']);
  assert.deepEqual(d.system.variables, ['', '', 'Coins']);
  assert.deepEqual(d.system.partyMembers, [1, 2]);
  assert.equal(d.system.engine, 'rm2k');
  assert.deepEqual(d.system.advanced, { screenWidth: 640, screenHeight: 480 });
  assert.deepEqual(d.commonEvents, [{ id: 1, name: 'Intro', trigger: 3, switchId: 0, list: [c(101, 0, ['', 0, 0, 2]), c(401, 0, ['Hi']), c(0, 0, [])] }]);

  const map = lmu([[2, int(20)], [3, int(15)], [0x51, array([
    [4, [[1, shiftJis['町']], [2, int(5)], [3, int(6)], [5, array([[1, [[0x33, int(0)], [0x34, commands([[10110, 0, shiftJis['こんにちは']], [10, 0]])]]]])]]],
  ])]]);
  const m = plain(js.lcfMap(map, 'shift_jis'));
  assert.equal(m.events.length, 5);
  assert.deepEqual([m.width, m.height, m.events[4].name, m.events[4].x, m.events[4].y], [20, 15, '町', 5, 6]);
  assert.deepEqual(m.events[4].pages[0].list[1], c(401, 0, ['こんにちは']));
  const parsed = js.parseMapJson(m, 1, { 1: { name: 'Town' } });
  assert.equal(parsed.events[0].pages[0].list.length, 3);

  // The encoding is guessed from the database and map tree text.
  const sample = js.lcfSamples(lmt([[1, [[1, shiftJis['はい']], [4, int(1)]]]]), db);
  assert.equal(js.lcfEncoding(sample), 'shift_jis');
});

test('lcfMediaRoot maps MV folders to RM2k ones', async () => {
  const seen = [];
  const root = js.lcfMediaRoot({ list: async p => { seen.push(p); return new Map(); }, file: async e => e });
  for (const p of ['img/pictures', 'img/faces', 'audio/bgm', 'audio/se']) await root.list(p);
  assert.deepEqual(seen, ['picture', 'faceset', 'music', 'sound']);
});

test('pngTransparent0 makes palette entry 0 transparent, leaves other PNGs alone', async () => {
  const pal = new Uint8Array(768), idx = new Uint8Array(4);
  const xyz = new Uint8Array([0x58, 0x59, 0x5a, 0x31, 2, 0, 2, 0, ...deflateSync(Buffer.concat([pal, idx]))]);
  const png = await js.xyzToPng(xyz);
  const out = js.pngTransparent0(png);
  assert.equal(out.length, png.length + 13);
  const at = Buffer.from(out).indexOf('tRNS');
  assert.ok(at > Buffer.from(out).indexOf('PLTE') && at < Buffer.from(out).indexOf('IDAT'));
  assert.equal(out[at + 4], 0, 'alpha 0 for entry 0');
  assert.equal(js.pngTransparent0(out), out, 'already has tRNS');
  const rgb = new Uint8Array(png); rgb[25] = 2;   // colour type 2: not a palette image
  assert.equal(js.pngTransparent0(rgb), rgb);
});
