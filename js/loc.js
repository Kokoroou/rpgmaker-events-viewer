/* ── Plugin localization: text keys resolved from the game's loc/ folder ──
   Some games keep their dialogue out of the event data: a message holds a key such as
   \REM_MAP[commonevent12_msg_1] and a plugin swaps it for the text of the player's
   language at run time, from loc/RemMap_EN.json, loc/RemMap_JP.json … (one file per
   kind of text: RemMap → \REM_MAP, RemDesc → \REM_DESC, RemEff → \REM_EFF), each
   { key: { text: [lines] } }. locLoad() reads one file per kind (English first) when the
   game is opened (loader.js) into S.loc; locText() puts the text in place of the key,
   for the graph (parser.js resolveTextCodes) and the scene player (scene-script.js).
   A key with no text stays as it is. Read only: nothing is written. No DOM. */
const LOC_FILE = /^rem([a-z]+)(?:_([a-z]+))?\.json$/i;
const LOC_DEPTH = 5;   // text may hold keys of its own (a choice naming a \REM_DESC item)

// File names of loc/ → { 'REM_MAP': 'RemMap_EN.json', … }: per kind, the English file,
// else the one without a language, else the first by name.
function locPick(names) {
  const rank = lang => (!lang ? 1 : /^(en|eng|english)$/i.test(lang) ? 0 : 2);
  const best = {};
  for (const name of [...names].sort()) {
    const m = LOC_FILE.exec(name);
    if (!m) continue;
    const code = 'REM_' + m[1].toUpperCase(), r = rank(m[2]);
    if (!best[code] || r < best[code].r) best[code] = { name, r };
  }
  const out = {};
  for (const code in best) out[code] = best[code].name;
  return out;
}

// One parsed file → Map(key → text, lines joined by new lines). Entries of another shape are skipped.
function locTable(json) {
  const out = new Map();
  if (!json || typeof json !== 'object') return out;
  for (const key of Object.keys(json)) {
    const t = json[key] && json[key].text;
    if (Array.isArray(t)) out.set(key, t.map(l => String(l ?? '')).join('\n'));
    else if (typeof t === 'string') out.set(key, t);
  }
  return out;
}

// \REM_MAP[key] … → their text, from loc ({ REM_MAP: Map, … }; S.loc by default).
function locText(str, loc) {
  if (loc === undefined) loc = typeof S !== 'undefined' ? S.loc : null;
  if (!str || !loc) return str;
  let s = String(str);
  for (let d = 0; d < LOC_DEPTH; d++) {
    const next = s.replace(/\\(REM_[A-Za-z]+)\[(\w+)\]/gi, (m, code, key) => {
      const t = loc[code.toUpperCase()];
      return t && t.has(key) ? t.get(key) : m;
    });
    if (next === s) break;
    s = next;
  }
  return s;
}

// The game root (media.js: treeRoot / filesRoot …) → { REM_MAP: Map, … }, or null when
// the game has no such files. A file that cannot be read or parsed is left out.
async function locLoad(root) {
  if (!root) return null;
  let dir;
  try { dir = await root.list('loc'); } catch { return null; }
  if (!dir || !dir.size) return null;
  const entries = new Map();
  for (const e of dir.values()) if (e && !e.isDir) entries.set(e.name, e);
  const pick = locPick(entries.keys());
  const out = {};
  let any = false;
  for (const code in pick) {
    try {
      const text = await (await root.file(entries.get(pick[code]))).text();
      const table = locTable(JSON.parse(text.replace(/^﻿/, '')));
      if (table.size) { out[code] = table; any = true; }
    } catch {}
  }
  return any ? out : null;
}
