import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './helpers.mjs';

// Runs js/analytics.js with a fake browser and returns the URLs it requested.
function setup({ host = 'makerlens.kokoroou.workers.dev', path = '/events/', search = '', referrer = '', dnt, gpc } = {}) {
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
  const sent = run({ referrer: 'https://makerlens.kokoroou.workers.dev/assets/' });
  assert.equal(sent.length, 1);
  const u = sent[0];
  assert.equal(u.origin + u.pathname, 'https://makerlens.goatcounter.com/count');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['p', 'r', 'rnd']);
  assert.equal(u.searchParams.get('p'), '/events/');
  assert.equal(u.searchParams.get('r'), 'https://makerlens.kokoroou.workers.dev/assets/');
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
  assert.equal(sent[0].searchParams.get('p'), 'switch-to-assets');
  assert.equal(sent[0].searchParams.get('e'), 'true');
  images[0].onload();
  await done;                                   // resolves once the pixel is answered
  await countEvent('Map001');                   // anything else is dropped
  await countEvent('feedback-sent');            // Events does not count the feedback card
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
