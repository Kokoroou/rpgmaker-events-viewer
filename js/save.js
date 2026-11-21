/* ── Save files: the switches and variables a player reached ──
   Opening a save is optional and read-only: the scene player (scene-script.js) then
   starts from the save's switches, variables, self switches, actors and party instead
   of guessing unknown values. Nothing is written or sent; the save lives in memory
   (S.save) until another game or save is opened. No DOM, tested in node.

   Formats:
   - MV  .rpgsave   — LZString.compressToBase64(JsonEx.stringify(contents)) (rpg_managers.js
                      StorageManager, rpgsave-converter in awesome-game-file-format-reversing).
   - MZ  .rmmzsave  — pako.deflate(JsonEx.stringify(contents)) (rmmz_managers.js); NW.js
                      writes the binary string as UTF-8, so bytes may come back that way.
   - VX Ace .rvdata2 — Marshal.dump(header) then Marshal.dump(contents Hash) (DataManager).
   - VX .rvdata / XP .rxdata — one Marshal.dump per game object, in turn (Scene_File).
   JsonEx (rpg_core.js): '@' class name, '@c' id, '@a' wrapped array, '@r' reference. */

const SAVE_EXT = /\.(rpgsave|rmmzsave|rvdata2|rvdata|rxdata)$/i;

// lz-string 1.4 decompressFromBase64 (MIT, Pieroxy): the decoder only.
function lzDecompressFromBase64(input) {
  const KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const rev = {};
  for (let i = 0; i < KEY.length; i++) rev[KEY[i]] = i;
  if (!input) return input === '' ? null : '';
  const length = input.length, reset = 32;
  const data = { val: rev[input[0]], position: reset, index: 1 };
  const bitsOf = n => {
    let bits = 0, power = 1;
    const max = 2 ** n;
    while (power !== max) {
      const resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) { data.position = reset; data.val = rev[input[data.index++]]; }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    return bits;
  };
  const dict = [0, 1, 2];
  let enlargeIn = 4, dictSize = 4, numBits = 3, w, c;
  const result = [];
  switch (bitsOf(2)) {
    case 0: c = String.fromCharCode(bitsOf(8)); break;
    case 1: c = String.fromCharCode(bitsOf(16)); break;
    default: return '';
  }
  dict[3] = c; w = c; result.push(c);
  for (;;) {
    if (data.index > length) return '';
    let code = bitsOf(numBits);
    if (code === 0 || code === 1) {
      dict[dictSize++] = String.fromCharCode(bitsOf(code === 0 ? 8 : 16));
      code = dictSize - 1;
      enlargeIn--;
    } else if (code === 2) {
      return result.join('');
    }
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
    let entry;
    if (dict[code] !== undefined && code > 2) entry = dict[code];
    else if (code === dictSize) entry = w + w[0];
    else return null;
    result.push(entry);
    dict[dictSize++] = w + entry[0];
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) { enlargeIn = 2 ** numBits; numBits++; }
  }
}

// JsonEx → plain values: '@a' arrays unwrapped, '@' / '@c' dropped, references to null.
function jsonExDecode(v, depth = 0) {
  if (depth > 200 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => jsonExDecode(x, depth + 1));
  if ('@a' in v) return jsonExDecode(v['@a'], depth + 1);
  if ('@r' in v) return null;
  const out = {};
  for (const k of Object.keys(v)) if (k[0] !== '@') out[k] = jsonExDecode(v[k], depth + 1);
  return out;
}

const saveIds = arr => {
  const out = {};
  (Array.isArray(arr) ? arr : []).forEach((x, i) => { if (i > 0) out[i] = x; });
  return out;
};

// MV / MZ contents → the common shape.
function saveFromMV(c) {
  if (!c || !c.switches || !c.variables) throw new Error('This file holds no game progress (only settings)');
  const self = {};
  const selfData = (c.selfSwitches && c.selfSwitches._data) || {};
  for (const k of Object.keys(selfData)) self[k.replace(/\s+/g, '')] = !!selfData[k];
  const actors = {};
  for (const a of (c.actors && c.actors._data) || []) {
    if (!a || !a._actorId) continue;
    actors[a._actorId] = { name: a._name || '', classId: a._classId || 0,
      equips: (a._equips || []).map(e => (e && e._itemId) || 0) };
  }
  return {
    switches: saveIds(c.switches._data), variables: saveIds(c.variables._data), self, actors,
    party: (c.party && Array.isArray(c.party._actors)) ? c.party._actors.slice() : null,
    mapId: (c.map && c.map._mapId) || 0,
  };
}

// The first object of a class in Marshal values (VX Ace: inside the contents Hash).
function saveFind(values, cls) {
  const seen = new Set();
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 3 || seen.has(v)) return null;
    seen.add(v);
    if (v.__class === cls) return v;
    const kids = v instanceof Map ? [...v.values()] : Array.isArray(v) ? v : [];
    for (const k of kids) { const hit = walk(k, depth + 1); if (hit) return hit; }
    return null;
  };
  for (const v of values) { const hit = walk(v, 0); if (hit) return hit; }
  return null;
}

// XP / VX / VX Ace Marshal values → the common shape.
function saveFromRGSS(values) {
  const sw = saveFind(values, 'Game_Switches'), vars = saveFind(values, 'Game_Variables');
  if (!sw || !vars) throw new Error('No switches or variables in this file: not a game save');
  const self = {};
  const selfData = saveFind(values, 'Game_SelfSwitches');
  if (selfData && selfData.data instanceof Map) {
    for (const [k, on] of selfData.data) if (Array.isArray(k)) self[k.join(',')] = !!on;
  }
  const actors = {};
  const actorList = saveFind(values, 'Game_Actors');
  for (const a of (actorList && Array.isArray(actorList.data) ? actorList.data : [])) {
    if (!a || !a.actor_id) continue;
    const equips = Array.isArray(a.equips) ? a.equips.map(e => (e && e.item_id) || 0)
      : [a.weapon_id, a.armor1_id, a.armor2_id, a.armor3_id, a.armor4_id].map(n => n | 0);
    actors[a.actor_id] = { name: typeof a.name === 'string' ? a.name : '', classId: a.class_id | 0, equips };
  }
  const party = saveFind(values, 'Game_Party');
  const map = saveFind(values, 'Game_Map');
  return {
    switches: saveIds(sw.data), variables: saveIds(vars.data), self, actors,
    // XP keeps Game_Actor objects in the party, VX / VX Ace their ids.
    party: party && Array.isArray(party.actors) ? party.actors.map(a => (a && typeof a === 'object' ? a.actor_id : a) | 0) : null,
    mapId: (map && map.map_id) | 0,
  };
}

async function saveInflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

// A save file's bytes → { name, switches, variables, self, actors, party, mapId }.
async function readSave(name, buffer) {
  const u = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const ext = (String(name).match(SAVE_EXT) || [])[1];
  if (!ext) throw new Error('Not an RPG Maker save file (.rpgsave, .rmmzsave, .rvdata2, .rvdata, .rxdata)');
  let save;
  if (/^rv|^rx/i.test(ext)) {
    save = saveFromRGSS(marshalLoadAll(u));
  } else if (/^rpgsave$/i.test(ext)) {
    const json = lzDecompressFromBase64(new TextDecoder().decode(u).trim());
    if (!json) throw new Error('Could not read this save (not LZ-String data)');
    save = saveFromMV(jsonExDecode(JSON.parse(json)));
  } else {
    // MZ: zlib bytes as written by NW.js, i.e. the "binary string" encoded as UTF-8;
    // raw zlib bytes (a save copied out of browser storage) work too.
    const text = new TextDecoder().decode(u);
    const asBinary = /^[\u0000-\u00ff]*$/.test(text) ? Uint8Array.from(text, ch => ch.charCodeAt(0)) : null;
    let json = null;
    for (const zip of [asBinary, u]) {
      if (!zip) continue;
      try { json = await saveInflate(zip); break; } catch {}
    }
    if (json === null) throw new Error('Could not read this save (not zlib data)');
    save = saveFromMV(jsonExDecode(JSON.parse(json)));
  }
  save.name = String(name).split(/[\\/]/).pop();
  return save;
}
