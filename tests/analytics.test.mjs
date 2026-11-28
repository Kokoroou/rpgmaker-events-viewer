import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './helpers.mjs';

// Runs js/analytics.js with a fake browser and returns the URLs it requested.
function setup({ host = 'makerlens.kokoroou.com', path = '/events/', search = '', referrer = '', dnt, gpc } = {}) {
  const sent = [], images = [];
  class Image { set src(u) { sent.push(new URL(u)); images.push(this); } }
  const get = load(['analytics.js'], {
    location: { hostname: host, pathname: path, search },
    navigator: { doNotTrack: dnt, globalPrivacyControl: gpc },
    document: { referrer },
    Image, URLSearchParams, Math, setTimeout, Promise,
  });
  return { sent, images, countEvent: get('countEvent') };
}
const run = opts => setup(opts).sent;

test('sends one page view with only path, referrer and the random cache-buster', () => {
  const sent = run({ referrer: 'https://makerlens.kokoroou.com/assets/' });
  assert.equal(sent.length, 1);
  const u = sent[0];
  assert.equal(u.origin + u.pathname, 'https://makerlens.goatcounter.com/count');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['p', 'r', 'rnd']);
  assert.equal(u.searchParams.get('p'), '/events/');
  assert.equal(u.searchParams.get('r'), 'https://makerlens.kokoroou.com/assets/');
});

test('forwards only the listed traffic-source params', () => {
  const [u] = run({ search: '?utm_source=reddit&map=Map001&ref=forum' });
  assert.equal(u.searchParams.get('q'), '?utm_source=reddit&ref=forum');
  assert.doesNotMatch(u.href, /Map001/);
});

test('sends nothing on local copies, previews, Do Not Track or GPC', () => {
  assert.equal(run({ host: 'localhost' }).length, 0);
  assert.equal(run({ host: 'kokoroou.github.io' }).length, 0);
  assert.equal(run({ dnt: '1' }).length, 0);
  assert.equal(run({ gpc: true }).length, 0);
});

test('countEvent: only the fixed switch name is sent, as an event with no other data', async () => {
  const { sent, images, countEvent } = setup();
  sent.length = 0; images.length = 0;
  const done = countEvent('switch-to-assets');
  assert.equal(sent.length, 1);
  assert.deepEqual([...sent[0].searchParams.keys()].sort(), ['e', 'p', 'rnd', 't']);
  assert.equal(sent[0].searchParams.get('p'), 'ev-switch-to-assets');   // page code first
  assert.equal(sent[0].searchParams.get('t'), 'ev-switch-to-assets');
  assert.equal(sent[0].searchParams.get('e'), 'true');
  images[0].onload();
  await done;                                   // resolves once the pixel is answered
  await countEvent('Map001');                   // anything else is dropped
  await countEvent('ev-switch-to-assets');      // the prefix is added by countEvent, never passed in
  assert.equal(sent.length, 1);
});

test('countEvent resolves after a short wait when the request never answers, and is a no-op off the public site', async () => {
  const a = setup(); a.sent.length = 0;
  await a.countEvent('switch-to-assets');       // no onload: the 400 ms cap resolves it
  assert.equal(a.sent.length, 1);
  const b = setup({ host: 'localhost' });
  await b.countEvent('switch-to-assets');
  assert.equal(b.sent.length, 0);
  const c = setup({ dnt: '1' });
  await c.countEvent('switch-to-assets');
  assert.equal(c.sent.length, 0);
});

test('countEvent sends each name at most once per page load', async () => {
  const { sent, countEvent } = setup();
  sent.length = 0;
  await countEvent('graph-view');
  await countEvent('graph-view');
  await countEvent('open-ok');
  assert.deepEqual(sent.map(u => u.searchParams.get('p')), ['ev-graph-view', 'ev-open-ok']);
  for (const u of sent) assert.deepEqual([...u.searchParams.keys()].sort(), ['e', 'p', 'rnd', 't']);
});

test('every name the app counts is in the list analytics.js sends', async () => {
  const { readFileSync } = await import('node:fs');
  const read = f => readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
  const src = ['app.js', 'loader.js', 'player.js', 'sidebar.js', 'feedback.js'].map(read).join('\n');
  const list = read('analytics.js');
  const used = new Set([...src.matchAll(/\b(?:track|fbEvent|failLoad\([^)]*?,)\s*\(?\s*'([a-z0-9-]+)'/g)].map(m => m[1]));
  for (const m of src.matchAll(/(?:, |way = )'(open-[a-z0-9-]+)'/g)) used.add(m[1]);
  for (const m of read('constants.js').matchAll(/'(engine-[a-z0-9]+)'/g)) used.add(m[1]);
  assert.ok(used.size > 18, [...used].join(' '));
  for (const name of used) assert.ok(list.includes(`'${name}'`), `${name} is not in EVENTS`);
});

test('engineEvent maps engine labels to the fixed engine names (same as MakerLens Assets)', () => {
  const engineEvent = load(['constants.js'])('engineEvent');
  const cases = [
    ['RPG Maker MZ', 'engine-mz'], ['RPG Maker MV', 'engine-mv'], ['MV/MZ', 'engine-mvmz'], ['RPG Maker XP', 'engine-xp'],
    ['RPG Maker VX', 'engine-vx'], ['RPG Maker VX Ace', 'engine-vxace'], ['RPG Maker 2000/2003', 'engine-2k'], [null, 'engine-other'],
  ];
  for (const [label, want] of cases) assert.equal(engineEvent(label), want, String(label));
});

test('feedback card and archive events are counted, with the page code first', async () => {
  const { sent, countEvent } = setup();
  sent.length = 0;
  for (const n of ['feedback-shown', 'feedback-skipped', 'feedback-sent', 'open-archive']) await countEvent(n);
  assert.deepEqual(sent.map(u => u.searchParams.get('p')), ['ev-feedback-shown', 'ev-feedback-skipped', 'ev-feedback-sent', 'ev-open-archive']);
});
