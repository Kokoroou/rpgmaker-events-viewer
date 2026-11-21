// Save files (js/save.js) and the scene player starting from them (scene-script.js).
// Saves are built here from synthetic contents, never real game saves.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { load, plain, c } from './helpers.mjs';
import { marshal, obj, sym } from './marshal-writer.mjs';

const run = load(['constants.js', 'scenes.js', 'decrypt-rgssad.js', 'rgss.js', 'save.js', 'scene-script.js'],
  { TextDecoder, TextEncoder, Blob, Response, DecompressionStream });
const js = run('({ readSave, lzDecompressFromBase64, jsonExDecode, sceneTimeline })');
const setS = v => run('globalThis').S = v;

// MV contents in JsonEx form (wrapped arrays, class names, a reference), compressed with
// lz-string 1.5 compressToBase64 like StorageManager does.
const MV_SAVE = 'N4IgAgxiBcCMA0IDOBPJAXApgWxqMMIA4gIbaYD6AymlropDAEyIVIkBumAwgPYCuAO3QxYAX0RIA7gEt0EABaYkecIVLlqs+UpUMo0AMysAJiXQlVjaABYGl6AG1B/ADav46AE79M8AGYkrkh+3r4AumISIBwkXjIkAEauylbqZJQAanEJyan6MACspuYO+AYAbPYwzm4eAAzwAOyI6AAeIpHRIa7+VNqKqdD46ZpUmL39coN64AYtIBRmFlYGAByICMYAgjBhfiBb8ABCMIHBmFGIJBDovF4qw2rQxBkU27f3s9YAnCUrT2ssEa4ActXc8BGLw0lA+dy8IAKcAQixu8IAkiZRKxBBlCAAlTAyLGsCCuEhIJCY5isTAAR34MgADo9yqIWKCalDXpp0XREXNRMZFssSNxyZTCFJMCQmbxBAKKHIcNTbBJuTCKHycAKgXYRaVxRTHiA4th7orldhVfUxJFWD1/FYEciol1EEy4ugUGloW8AApen1I2DFVGfB6rURVTlOWDukDYWW+nmUACyyZDCwoSaZqsMUSAA==';
const MV_JSON = '{"@c":1,"system":{"@":"Game_System","@c":2,"_saveCount":1},"switches":{"@":"Game_Switches","@c":3,"_data":{"@c":4,"@a":[null,true,false,true]}},"variables":{"@":"Game_Variables","@c":5,"_data":{"@c":6,"@a":[null,0,7,"txt"]}},"selfSwitches":{"@":"Game_SelfSwitches","@c":7,"_data":{"@c":8,"1,3,A":true,"1,3,B":false}},"actors":{"@":"Game_Actors","@c":9,"_data":{"@c":10,"@a":[null,{"@":"Game_Actor","@c":11,"_actorId":1,"_name":"Reid","_classId":2,"_equips":{"@c":12,"@a":[{"@":"Game_Item","@c":13,"_dataClass":"weapon","_itemId":4},{"@":"Game_Item","@c":14,"_dataClass":"armor","_itemId":0}]},"_self":{"@r":11}}]}},"party":{"@":"Game_Party","@c":15,"_actors":{"@c":16,"@a":[1]}},"map":{"@":"Game_Map","@c":17,"_mapId":3}}';
const enc = s => new TextEncoder().encode(s);
const expected = {
  switches: { 1: true, 2: false, 3: true }, variables: { 1: 0, 2: 7, 3: 'txt' },
  self: { '1,3,A': true, '1,3,B': false }, actors: { 1: { name: 'Reid', classId: 2, equips: [4, 0] } },
  party: [1], mapId: 3,
};

test('lzDecompressFromBase64 reads lz-string output', () => {
  assert.equal(js.lzDecompressFromBase64(MV_SAVE), MV_JSON);
  assert.equal(js.lzDecompressFromBase64(''), null);
});

test('MV .rpgsave', async () => {
  const save = plain(await js.readSave('www/save/file1.rpgsave', enc(MV_SAVE + '\n')));
  assert.deepEqual(save, { ...expected, name: 'file1.rpgsave' });
});

test('MZ .rmmzsave: zlib written as a UTF-8 binary string, or raw zlib', async () => {
  const zip = deflateSync(MV_JSON, { level: 1 });
  const asNw = Buffer.from(zip.toString('latin1'), 'utf8');   // what NW.js writes
  assert.ok(asNw.length > zip.length, 'the fixture really has multi-byte characters');
  for (const bytes of [asNw, zip]) {
    const save = plain(await js.readSave('file2.rmmzsave', new Uint8Array(bytes)));
    assert.deepEqual(save, { ...expected, name: 'file2.rmmzsave' });
  }
});

const rgssObjects = xp => [
  obj('Game_System', { magic_number: 1 }),
  obj('Game_Switches', { data: [null, true, false, true] }),
  obj('Game_Variables', { data: [null, 0, 7, 'txt'] }),
  obj('Game_SelfSwitches', { data: new Map([[[1, 3, 'A'], true], [[1, 3, 'B'], false]]) }),
  obj('Game_Actors', { data: [null, xp
    ? obj('Game_Actor', { actor_id: 1, name: 'Reid', class_id: 2, weapon_id: 4, armor1_id: 0, armor2_id: 0, armor3_id: 0, armor4_id: 0 })
    : obj('Game_Actor', { actor_id: 1, name: 'Reid', class_id: 2, equips: [obj('Game_BaseItem', { item_id: 4 }), obj('Game_BaseItem', { item_id: 0 })] })] }),
  obj('Game_Party', { actors: xp ? [obj('Game_Actor', { actor_id: 1 })] : [1] }),
  obj('Game_Map', { map_id: 3 }),
];

test('XP .rxdata: one Marshal stream per object', async () => {
  const parts = [marshal([]), marshal(120), ...rgssObjects(true).map(marshal)];
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { bytes.set(p, at); at += p.length; }
  const save = plain(await js.readSave('Save1.rxdata', bytes));
  assert.deepEqual(save, { ...expected, actors: { 1: { name: 'Reid', classId: 2, equips: [4, 0, 0, 0, 0] } }, name: 'Save1.rxdata' });
});

test('VX Ace .rvdata2: header, then the contents Hash', async () => {
  const [system, switches, variables, self, actors, party, map] = rgssObjects(false);
  const header = marshal(new Map([[sym('playtime_s'), '00:10:00']]));
  const contents = marshal(new Map([[sym('system'), system], [sym('switches'), switches], [sym('variables'), variables],
    [sym('self_switches'), self], [sym('actors'), actors], [sym('party'), party], [sym('map'), map]]));
  const save = plain(await js.readSave('Save01.rvdata2', new Uint8Array([...header, ...contents])));
  assert.deepEqual(save, { ...expected, name: 'Save01.rvdata2' });
});

test('readSave rejects other files', async () => {
  await assert.rejects(js.readSave('notes.txt', enc('x')), /Not an RPG Maker save/);
  await assert.rejects(js.readSave('config.rpgsave', enc('not lz')), /./);
  await assert.rejects(js.readSave('Save1.rxdata', marshal([1, 2])), /not a game save/);
});

// A scene checking switch 2 (OFF in the save), variable 2 (7 in the save) and self switch A.
const msg = (t, i = 0) => [c(101, i, ['', 0, 0, 2]), c(401, i, [t])];
const scene = [
  c(111, 0, [0, 2, 0]), ...msg('sw2 on', 1), c(0, 1), c(411, 0), ...msg('sw2 off', 1), c(0, 1), c(412, 0),
  c(111, 0, [1, 2, 0, 7, 0]), ...msg('var2 is 7', 1), c(0, 1), c(411, 0), ...msg('var2 other', 1), c(0, 1), c(412, 0),
  c(111, 0, [2, 'A', 0]), ...msg('self A on', 1), c(0, 1), c(411, 0), ...msg('self A off', 1), c(0, 1), c(412, 0),
  c(111, 0, [4, 1, 1, 'Reid']), ...msg('named Reid', 1), c(0, 1), c(411, 0), ...msg('other name', 1), c(0, 1), c(412, 0),
  c(0, 0),
];
const texts = steps => steps.map(s => s.msg && s.msg.text).filter(Boolean);

test('scenes start from the save: switches, variables, self switches, actors', async () => {
  setS({ switches: [], variables: [], actorStart: [null, { name: 'Harold', classId: 1, equips: [] }], party: [1], save: null });
  const without = texts(js.sceneTimeline(scene, () => null, { mapId: 1, evId: 3 }));
  assert.deepEqual(plain(without), ['sw2 on', 'var2 is 7', 'self A on', 'other name'], 'unknown values: the branch that shows');

  const save = await js.readSave('file1.rpgsave', enc(MV_SAVE));
  setS({ switches: [], variables: [], actorStart: [null, { name: 'Harold', classId: 1, equips: [] }], party: [1], save });
  assert.deepEqual(plain(texts(js.sceneTimeline(scene, () => null, { mapId: 1, evId: 3 }))), ['sw2 off', 'var2 is 7', 'self A on', 'named Reid']);
  // Another event: its self switch A is OFF in the save.
  assert.deepEqual(plain(texts(js.sceneTimeline(scene, () => null, { mapId: 1, evId: 4 }))), ['sw2 off', 'var2 is 7', 'self A off', 'named Reid']);
  setS({});
});
