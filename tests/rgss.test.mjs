// RPG Maker XP / VX / VX Ace data (js/rgss.js) on synthetic Marshal bytes, built with
// tests/marshal-writer.mjs: never real game data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, plain, c } from './helpers.mjs';
import { marshal, obj, sym, tone, float, rgss3a } from './marshal-writer.mjs';

const run = load(['parser.js', 'decrypt-rgssad.js', 'rgss.js'], { TextDecoder, TextEncoder });
const js = run('({ marshalLoad, rgssData, rgssList, rgssEngine, readGameData, rgssMediaRoot, unionRoot, archiveFiles, parseMapJson })');
const cmd = (code, indent, parameters) => obj('RPG::EventCommand', { code, indent, parameters });
const file = (name, bytes) => ({ name, arrayBuffer: async () => bytes.buffer, text: async () => new TextDecoder().decode(bytes) });

test('marshalLoad reads the basic types', () => {
  const v = js.marshalLoad(marshal([null, true, false, 0, 1, -1, 122, 123, -123, -124, 255, 256, -256, 65536, -70000, 2 ** 30,
    'héllo', '', sym('abc'), sym('abc'), float(1.5), new Map([[1, 'a'], ['k', [2]]])]));
  assert.deepEqual(plain(v.slice(0, 20)), [null, true, false, 0, 1, -1, 122, 123, -123, -124, 255, 256, -256, 65536, -70000, 2 ** 30,
    'héllo', '', 'abc', 'abc']);
  assert.equal(v[20], 1.5);
  assert.equal(v[21].constructor.name, 'Map');
  assert.equal(v[21].get(1), 'a');
  assert.deepEqual(plain(v[21].get('k')), [2]);
});

test('marshalLoad: objects, Tone as numbers, object links', () => {
  const bytes = marshal(obj('RPG::Thing', { name: 'x', tone: tone(1, -2, 3, 4.5) }));
  assert.deepEqual(plain(js.marshalLoad(bytes)), { __class: 'RPG::Thing', name: 'x', tone: [1, -2, 3, 4.5] });
  // ['s', @1]: a link to the second object (index 0 is the array itself).
  const linked = new Uint8Array([4, 8, 0x5b, 7, 0x22, 6, 0x61, 0x40, 6]);
  assert.deepEqual(plain(js.marshalLoad(linked)), ['a', 'a']);
});

test('marshalLoad rejects other data and truncated bytes', () => {
  assert.throws(() => js.marshalLoad(new TextEncoder().encode('{"a":1}')), /Marshal 4.8/);
  const b = marshal(['abcdef']);
  assert.throws(() => js.marshalLoad(b.subarray(0, b.length - 2)), /ends early/);
  assert.throws(() => js.marshalLoad(new Uint8Array([4, 8, 0x21])), /unknown type/);
});

test('rgssEngine from the extension', () => {
  assert.equal(js.rgssEngine('Map001.rvdata2'), 'vxace');
  assert.equal(js.rgssEngine('System.rvdata'), 'vx');
  assert.equal(js.rgssEngine('MapInfos.RXDATA'), 'xp');
  assert.equal(js.rgssEngine('Map001.json'), null);
});

const vxaceMap = () => obj('RPG::Map', {
  width: 17, height: 13,
  events: new Map([[3, obj('RPG::Event', { id: 3, name: 'Guard', x: 4, y: 5, pages: [obj('RPG::Event::Page', { list: [
    cmd(101, 0, ['Actor1', 2, 0, 2]), cmd(401, 0, ['Hello \\N[1]']),
    cmd(102, 0, [['Yes', 'No'], 2]), cmd(402, 0, [0, 'Yes']), cmd(0, 1, []), cmd(402, 0, [1, 'No']), cmd(0, 1, []), cmd(404, 0, []),
    cmd(241, 0, [obj('RPG::BGM', { name: 'Town1', volume: 90, pitch: 100 })]),
    cmd(223, 0, [tone(-68, -68, 0, 68), 60, true]),
    cmd(205, 0, [-1, obj('RPG::MoveRoute', { repeat: false, skippable: true, wait: true, list: [obj('RPG::MoveCommand', { code: 1, parameters: [] })] })]),
    cmd(319, 0, [1, 0, 5]),
    cmd(0, 0, []),
  ] })] })]]),
});

test('rgssData: a VX Ace map in MV shape', () => {
  const m = js.rgssData('Map', js.marshalLoad(marshal(vxaceMap())), 'vxace');
  assert.equal(m.events.length, 4);
  assert.deepEqual(plain(m.events.slice(0, 3)), [null, null, null]);
  const ev = m.events[3];
  assert.deepEqual([ev.id, ev.name, ev.x, ev.y], [3, 'Guard', 4, 5]);
  const list = plain(ev.pages[0].list);
  assert.deepEqual(list[0], c(101, 0, ['Actor1', 2, 0, 2]));
  assert.deepEqual(list[2], c(102, 0, [['Yes', 'No'], 2]));
  assert.deepEqual(list[8], c(241, 0, [{ name: 'Town1', volume: 90, pitch: 100, pan: 0 }]));
  assert.deepEqual(list[9], c(223, 0, [[-68, -68, 0, 68], 60, true]));
  assert.deepEqual(list[10].parameters[1], { list: [{ code: 1, parameters: [] }], repeat: false, skippable: true, wait: true });
  assert.deepEqual(list[11], c(319, 0, [1, 1, 5]), 'equipment slot 0 → MV equipment type 1');

  // The parser reads it like MV data: one dialogue node with the line, one choice node.
  const parsed = js.parseMapJson(m, 1, { 1: { name: 'Town' } });
  assert.equal(parsed.mapName, 'Town');
  assert.equal(parsed.events[0].pages[0].list.length, 13);
});

test('rgssList: XP messages, Control Variables operands and actor conditions', () => {
  const xp = plain(js.rgssList(js.marshalLoad(marshal([
    cmd(101, 0, ['First line']), cmd(401, 0, ['Second']),
    cmd(122, 0, [5, 5, 0, 4, 2, 1]),    // actor 2's parameter 1
    cmd(122, 0, [6, 6, 0, 3, 7]),       // item 7 count
    cmd(122, 0, [7, 7, 0, 7, 2]),       // other: 2
    cmd(122, 0, [8, 8, 0, 2, 1, 5]),    // random 1..5: unchanged
    cmd(111, 0, [4, 1, 2, 9]),          // actor 1 has skill 9
    cmd(111, 0, [4, 1, 1, 'Al']),       // name: unchanged
  ])), 'xp'));
  assert.deepEqual(xp.slice(0, 3), [c(101, 0, ['', 0, 0, 2]), c(401, 0, ['First line']), c(401, 0, ['Second'])]);
  assert.deepEqual(xp[3].parameters, [5, 5, 0, 3, 3, 2, 1]);
  assert.deepEqual(xp[4].parameters, [6, 6, 0, 3, 0, 7, 0]);
  assert.deepEqual(xp[5].parameters, [7, 7, 0, 3, 7, 2, 0]);
  assert.deepEqual(xp[6].parameters, [8, 8, 0, 2, 1, 5]);
  assert.deepEqual(xp[7].parameters, [4, 1, 3, 9]);
  assert.deepEqual(xp[8].parameters, [4, 1, 1, 'Al']);

  // VX Ace already numbers them like MV.
  const ace = plain(js.rgssList(js.marshalLoad(marshal([cmd(122, 0, [5, 5, 0, 3, 3, 2, 1]), cmd(111, 0, [4, 1, 2, 3])])), 'vxace'));
  assert.deepEqual(ace.map(x => x.parameters), [[5, 5, 0, 3, 3, 2, 1], [4, 1, 2, 3]]);
});

test('rgssData: MapInfos, CommonEvents, Actors, System', () => {
  const infos = js.rgssData('MapInfos', js.marshalLoad(marshal(new Map([
    [2, obj('RPG::MapInfo', { name: 'House', parent_id: 1, order: 2, expanded: false })],
    [1, obj('RPG::MapInfo', { name: 'Town', parent_id: 0, order: 1, expanded: true })],
  ]))), 'vxace');
  assert.deepEqual(plain(infos), [null, { id: 1, name: 'Town', parentId: 0, order: 1, expanded: true },
    { id: 2, name: 'House', parentId: 1, order: 2, expanded: false }]);

  const ces = js.rgssData('CommonEvents', js.marshalLoad(marshal([null,
    obj('RPG::CommonEvent', { id: 1, name: 'Intro', trigger: 0, switch_id: 1, list: [cmd(101, 0, ['Hi']), cmd(0, 0, [])] })])), 'xp');
  assert.deepEqual(plain(ces), [{ id: 1, name: 'Intro', trigger: 0, switchId: 1,
    list: [c(101, 0, ['', 0, 0, 2]), c(401, 0, ['Hi']), c(0, 0, [])] }]);

  const xpActors = js.rgssData('Actors', js.marshalLoad(marshal([null,
    obj('RPG::Actor', { id: 1, name: 'Aluxes', class_id: 1, weapon_id: 1, armor1_id: 0, armor2_id: 3, armor3_id: 4, armor4_id: 0 })])), 'xp');
  assert.deepEqual(plain(xpActors), [null, { id: 1, name: 'Aluxes', classId: 1, equips: [1, 0, 3, 4, 0] }]);
  const aceActors = js.rgssData('Actors', js.marshalLoad(marshal([null,
    obj('RPG::Actor', { id: 1, name: 'Eric', class_id: 2, equips: [1, 1, 2, 3, 0] })])), 'vxace');
  assert.deepEqual(plain(aceActors)[1].equips, [1, 1, 2, 3, 0]);

  const sys = js.rgssData('System', js.marshalLoad(marshal(obj('RPG::System', {
    game_title: 'Demo', switches: [null, 'Met guard', ''], variables: [null, 'Gold count'], party_members: [1, 2] }))), 'xp');
  assert.deepEqual(plain(sys), { gameTitle: 'Demo', switches: ['', 'Met guard', ''], variables: ['', 'Gold count'],
    partyMembers: [1, 2], advanced: { screenWidth: 640, screenHeight: 480 } });
});

test('readGameData: json as is, RGSS data through Marshal', async () => {
  const json = file('MapInfos.json', new TextEncoder().encode('[null,{"name":"A"}]'));
  assert.deepEqual(plain(await js.readGameData(json, 'MapInfos.json')), [null, { name: 'A' }]);
  const m = await js.readGameData(file('Map004.rvdata2', marshal(vxaceMap())), 'Map004.rvdata2');
  assert.equal(m.events[3].name, 'Guard');
});

test('archiveFiles lists an RGSSAD v3 archive and decrypts each file on read', async () => {
  const map = marshal(vxaceMap());
  const files = await js.archiveFiles(rgss3a([['Data\\Map001.rvdata2', map], ['Graphics\\Pictures\\a.png', new Uint8Array([1, 2, 3])]]));
  assert.deepEqual(plain(files.map(f => [f.path, f.name, f.size])), [['Data/Map001.rvdata2', 'Map001.rvdata2', map.length], ['Graphics/Pictures/a.png', 'a.png', 3]]);
  assert.equal((await js.readGameData(files[0], files[0].name)).events[3].name, 'Guard');
  assert.deepEqual([...new Uint8Array(await files[1].arrayBuffer())], [1, 2, 3]);
});

test('rgssMediaRoot maps img/ to Graphics/, unionRoot prefers the first root', async () => {
  const seen = [];
  const root = { list: async p => { seen.push(p); return new Map(); }, file: async e => e };
  await js.rgssMediaRoot(root).list('img/pictures');
  await js.rgssMediaRoot(root).list('audio/bgm');
  assert.deepEqual(seen, ['graphics/pictures', 'audio/bgm']);

  const a = { list: async () => new Map([['x.png', { name: 'x.png', id: 'a' }]]), file: async e => 'A:' + e.id };
  const b = { list: async () => new Map([['x.png', { name: 'x.png', id: 'b' }], ['y.ogg', { name: 'y.ogg', id: 'b' }]]), file: async e => 'B:' + e.id };
  const u = js.unionRoot(a, b);
  const dir = await u.list('');
  assert.equal(await u.file(dir.get('x.png')), 'A:a');
  assert.equal(await u.file(dir.get('y.ogg')), 'B:b');
});
