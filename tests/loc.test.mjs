// Plugin localization keys (js/loc.js): \REM_MAP[key] … resolved from the game's loc/ files.
// Fixtures are synthetic: made-up keys and text, never real game data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { c, load, plain } from './helpers.mjs';

const json = o => new TextEncoder().encode(JSON.stringify(o));
const fileOf = bytes => ({ text: async () => new TextDecoder().decode(bytes) });

function setup() {
  const run = load(['constants.js', 'loc.js', 'parser.js', 'state.js', 'scenes.js', 'scene-script.js', 'media.js']);
  run('S.actors = ["", "Harold"]');
  return run;
}

const MAP_EN = {
  testing: { text: ['test'] },
  scene1_msg_1: { text: ['', 'The rain stopped.', 'Harold looks up.'] },
  scene1_choice: { text: ['Take \\REM_DESC[item_lamp]'] },
  scene1_named: { text: ['\\n<Harold>Over here!'] },
};
const MAP_JP = { scene1_msg_1: { text: ['雨が止んだ。'] } };
const DESC = { item_lamp: { text: ['the lamp'] } };

test('locPick takes the English file of each kind, else the one without a language, else the first', () => {
  const run = setup();
  const pick = names => plain(run('locPick')(names));
  assert.deepEqual(pick(['RemMap_JP.json', 'RemMap_EN.json', 'RemDesc_KR.json', 'RemDesc.json', 'RemEff_SP.json', 'RemEff_RU.json', 'notes.txt']),
    { REM_MAP: 'RemMap_EN.json', REM_DESC: 'RemDesc.json', REM_EFF: 'RemEff_RU.json' });
  assert.deepEqual(pick(['remmap_en.JSON']), { REM_MAP: 'remmap_en.JSON' }, 'case does not matter');
  assert.deepEqual(pick([]), {});
});

test('locTable joins the lines of each key and skips other shapes', () => {
  const run = setup();
  const t = run('locTable')({ a: { text: ['one', 'two'] }, b: { text: 'single' }, c: { lines: ['x'] }, d: null });
  assert.deepEqual(plain([...t]), [['a', 'one\ntwo'], ['b', 'single']]);
  assert.equal(run('locTable')(null).size, 0);
});

test('locText replaces known keys, nested ones too, and leaves unknown keys as they are', () => {
  const run = setup();
  run('globalThis').__loc = { REM_MAP: run('locTable')(MAP_EN), REM_DESC: run('locTable')(DESC) };
  const t = s => run('locText')(s, run('__loc'));
  assert.equal(t('\\REM_MAP[scene1_msg_1]'), '\nThe rain stopped.\nHarold looks up.');
  assert.equal(t('\\rem_map[scene1_choice]'), 'Take the lamp', 'case-insensitive code, nested key');
  assert.equal(t('\\REM_MAP[missing_key]'), '\\REM_MAP[missing_key]');
  assert.equal(t('\\REM_EFF[x]'), '\\REM_EFF[x]', 'a kind with no file');
  assert.equal(t('plain text'), 'plain text');
  assert.equal(run('locText')('\\REM_MAP[scene1_msg_1]', null), '\\REM_MAP[scene1_msg_1]', 'no loc files');
  // A key whose text names itself does not loop forever.
  run('globalThis').__self = { REM_MAP: new Map([['k', 'a\\REM_MAP[k]']]) };
  assert.ok(run('locText')('\\REM_MAP[k]', run('__self')).startsWith('aaaa'));
});

test('locLoad reads the English loc/ files from the game root; none gives null', async () => {
  const run = setup();
  run('globalThis').__files = new Map([
    ['Game/www/data/Map001.json', fileOf(json({}))],
    ['Game/www/loc/RemMap_EN.json', fileOf(json(MAP_EN))],
    ['Game/www/loc/RemMap_JP.json', fileOf(json(MAP_JP))],
    ['Game/www/loc/RemDesc_EN.json', fileOf(new TextEncoder().encode('﻿' + JSON.stringify(DESC)))],
    ['Game/www/loc/RemEff.json', fileOf(new TextEncoder().encode('{ not json'))],
  ]);
  const loc = await run(`locLoad(filesRoot(__files, 'Game/www/'))`);
  assert.deepEqual(Object.keys(loc).sort(), ['REM_DESC', 'REM_MAP'], 'a file that does not parse is left out');
  assert.equal(loc.REM_MAP.get('scene1_msg_1'), '\nThe rain stopped.\nHarold looks up.');
  assert.equal(loc.REM_DESC.get('item_lamp'), 'the lamp');

  run('globalThis').__bare = new Map([['Game/www/data/Map001.json', fileOf(json({}))]]);
  assert.equal(await run(`locLoad(filesRoot(__bare, 'Game/www/'))`), null);
  assert.equal(await run('locLoad(null)'), null);
});

test('with S.loc the graph and the scene player show the text, not the key', () => {
  const run = setup();
  run('globalThis').__map = MAP_EN;
  run('globalThis').__desc = DESC;
  run('S.loc = { REM_MAP: locTable(__map), REM_DESC: locTable(__desc) }');

  // Graph / inspector: resolveTextCodes on each line of the dialogue node.
  const { nodes } = plain(run('parseEventPage')([c(101, 0, ['', 0, 0, 2]), c(401, 0, ['\\REM_MAP[scene1_msg_1]']), c(0, 0)], 'p'));
  assert.equal(run('resolveTextCodes')(nodes[0].lines[0]), '\nThe rain stopped.\nHarold looks up.');
  assert.equal(run('resolveTextCodes')('\\REM_MAP[nope]'), '\\REM_MAP[nope]');

  // Scene player: message text, the speaker tag inside the text, choices.
  const steps = plain(run('sceneTimeline')([
    c(101, 0, ['', 0, 0, 2]), c(401, 0, ['\\REM_MAP[scene1_msg_1]']),
    c(101, 0, ['', 0, 0, 2]), c(401, 0, ['\\REM_MAP[scene1_named]']),
    c(102, 0, [['\\REM_MAP[scene1_choice]', 'Leave'], 1, 0, 2, 0]),
    c(402, 0, [0, '']), c(0, 1), c(402, 0, [1, '']), c(0, 1), c(404, 0),
    c(0, 0),
  ], () => null));
  assert.equal(steps[0].msg.text, 'The rain stopped.\nHarold looks up.');
  assert.equal(steps[1].msg.name, 'Harold');
  assert.equal(steps[1].msg.text, 'Over here!');
  assert.deepEqual(steps[1].choices.items, ['Take the lamp', 'Leave']);

  // No loc files: the key stays (minus what the player already strips).
  run('S.loc = null');
  assert.equal(run('resolveTextCodes')('\\REM_MAP[scene1_msg_1]'), '\\REM_MAP[scene1_msg_1]');
});
