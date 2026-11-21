/* ── RGSS data: RPG Maker XP / VX / VX Ace (.rxdata / .rvdata / .rvdata2) ──
   These engines save their data with Ruby's Marshal (format 4.8). marshalLoad() reads
   it into plain values; rgssData() turns MapInfos / Map### / CommonEvents / Actors /
   System into the same shapes as MV's data/*.json, so the parser, the scene player and
   the search run unchanged. No DOM, tested in node (tests/rgss.test.mjs).

   Sources:
   - Marshal 4.8: Ruby's doc/marshal.rdoc and marshal.c (r_object, r_long, r_entry).
   - RPG::* classes and event command parameters: the RGSS reference manuals (XP, VX,
     VX Ace help files) and Game_Interpreter of each engine; Luminol and RV2JSON (listed in
     awesome-game-file-format-reversing) read the same data.
   - Color / Tone _dump: four little-endian doubles (red, green, blue, alpha / gray). */

const RGSS_DATA_EXT = /\.(rvdata2|rvdata|rxdata)$/i;
const RGSS_ARCHIVE = /\.(rgss3a|rgss2a|rgssad)$/i;
const RGSS_ENGINE = { rxdata: 'xp', rvdata: 'vx', rvdata2: 'vxace' };
// Screen size of each engine (Graphics.width/height defaults).
const RGSS_SCREEN = { xp: { width: 640, height: 480 }, vx: { width: 544, height: 416 }, vxace: { width: 544, height: 416 } };

function rgssEngine(name) {
  const m = String(name).match(RGSS_DATA_EXT);
  return m ? RGSS_ENGINE[m[1].toLowerCase()] : null;
}

/* ── Marshal reader ──
   nil/true/false/numbers → JS values; String → JS string (UTF-8); Symbol → string;
   Array → array; Hash → Map; Object → { __class, ...ivars without '@' };
   user _dump data ('u') → { __class, __data: Uint8Array }, Color/Tone → [4 numbers]. */
// start: where the stream begins; out.end gets where it ends (saves hold several streams).
function marshalLoad(bytes, start = 0, out = null) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u[start] !== 4 || u[start + 1] !== 8) throw new Error('Not Ruby Marshal 4.8 data');
  const dec = new TextDecoder('utf-8');
  const syms = [], objs = [];
  let pos = start + 2, depth = 0;
  const byte = () => {
    if (pos >= u.length) throw new Error('Marshal data ends early');
    return u[pos++];
  };
  const long = () => {
    const c = (byte() << 24) >> 24;   // signed
    if (c === 0) return 0;
    if (c > 4) return c - 5;
    if (c < -4) return c + 5;
    let n = 0;
    if (c > 0) {
      for (let i = 0; i < c; i++) n += byte() * 2 ** (8 * i);
      return n;
    }
    for (let i = 0; i < -c; i++) n += byte() * 2 ** (8 * i);
    return n - 2 ** (8 * -c);
  };
  const raw = () => {
    const n = long();
    if (n < 0 || pos + n > u.length) throw new Error('Marshal data ends early');
    const out = u.subarray(pos, pos + n);
    pos += n;
    return out;
  };
  const symbol = () => {
    const t = byte();
    if (t === 0x3a) { const s = dec.decode(raw()); syms.push(s); return s; }   // ':'
    if (t === 0x3b) return syms[long()];                                       // ';'
    if (t === 0x49) {                                                          // 'I' (symbol with encoding)
      const s = symbol();
      for (let n = long(); n > 0; n--) { symbol(); value(); }
      return s;
    }
    throw new Error('Marshal: symbol expected');
  };
  const entry = v => { objs.push(v); return v; };
  const ivars = obj => {
    for (let n = long(); n > 0; n--) {
      const k = symbol(), v = value();
      if (obj && typeof obj === 'object') obj[k.replace(/^@/, '')] = v;
    }
  };
  const userData = (cls, data) => {
    if ((cls === 'Color' || cls === 'Tone') && data.length >= 32) {
      const dv = new DataView(data.buffer, data.byteOffset, 32);
      return [0, 8, 16, 24].map(o => dv.getFloat64(o, true));
    }
    return { __class: cls, __data: data.slice() };
  };

  function value() {
    if (++depth > 2000) throw new Error('Marshal data nests too deep');
    try {
      const t = byte();
      switch (t) {
        case 0x30: return null;                                  // '0'
        case 0x54: return true;                                  // 'T'
        case 0x46: return false;                                 // 'F'
        case 0x69: return long();                                // 'i'
        case 0x3a: pos--; return symbol();                       // ':'
        case 0x3b: pos--; return symbol();                       // ';'
        case 0x40: return objs[long()];                          // '@' object link
        case 0x22: return entry(dec.decode(raw()));              // '"' String
        case 0x66: {                                             // 'f' Float
          const s = dec.decode(raw());
          return entry(s === 'inf' ? Infinity : s === '-inf' ? -Infinity : s === 'nan' ? NaN : parseFloat(s));
        }
        case 0x6c: {                                             // 'l' Bignum
          const sign = byte() === 0x2d ? -1 : 1;
          const n = long() * 2;
          let v = 0;
          for (let i = 0; i < n; i++) v += byte() * 2 ** (8 * i);
          return entry(sign * v);
        }
        case 0x49: {                                             // 'I': value + ivars (string encoding)
          const v = value();
          ivars(null);
          return v;
        }
        case 0x5b: {                                             // '[' Array
          const n = long(), arr = entry([]);
          for (let i = 0; i < n; i++) arr.push(value());
          return arr;
        }
        case 0x7b: case 0x7d: {                                  // '{' Hash, '}' Hash with default
          const n = long(), map = entry(new Map());
          for (let i = 0; i < n; i++) { const k = value(); map.set(k, value()); }
          if (t === 0x7d) value();
          return map;
        }
        case 0x6f: {                                             // 'o' Object
          const obj = entry({ __class: symbol() });
          ivars(obj);
          return obj;
        }
        case 0x75: {                                             // 'u' _dump / _load
          const cls = symbol();
          return entry(userData(cls, raw()));
        }
        case 0x55: {                                             // 'U' marshal_dump / marshal_load
          const at = objs.length, obj = entry({ __class: symbol() });
          obj.__data = value();
          return objs[at];
        }
        case 0x53: {                                             // 'S' Struct
          const obj = entry({ __class: symbol() });
          for (let n = long(); n > 0; n--) { const k = symbol(); obj[k] = value(); }
          return obj;
        }
        case 0x65: { symbol(); return value(); }                 // 'e' extended by a module
        case 0x43: { symbol(); return value(); }                 // 'C' subclass of String/Array/Hash
        case 0x2f: {                                             // '/' Regexp
          const src = dec.decode(raw()); byte();
          return entry(src);
        }
        case 0x63: case 0x6d: case 0x4d:                         // 'c' class, 'm' module
          return entry(dec.decode(raw()));
        default:
          throw new Error(`Marshal: unknown type 0x${t.toString(16)} at ${pos - 1}`);
      }
    } finally { depth--; }
  }
  const v = value();
  if (out) out.end = pos;
  return v;
}

// Every Marshal stream written one after the other (RGSS save files: XP and VX dump each
// game object in turn, VX Ace a header then the contents).
function marshalLoadAll(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const values = [], out = {};
  for (let at = 0; at < u.length && values.length < 64; at = out.end) {
    values.push(marshalLoad(u, at, out));
  }
  return values;
}

/* ── RGSS → MV shapes ── */
const RGSS_AUDIO = /^RPG::(AudioFile|BGM|BGS|ME|SE)$/;

// A parameter value: Hash → object, AudioFile → {name, volume, pitch, pan},
// MoveRoute → {list, repeat, skippable, wait}, other RPG objects → plain objects.
function rgssValue(v) {
  if (v instanceof Map) {
    const o = {};
    for (const [k, x] of v) o[k] = rgssValue(x);
    return o;
  }
  if (Array.isArray(v)) return v.map(rgssValue);
  if (!v || typeof v !== 'object' || v instanceof Uint8Array) return v;
  if (RGSS_AUDIO.test(v.__class || '')) return { name: v.name || '', volume: v.volume ?? 100, pitch: v.pitch ?? 100, pan: 0 };
  if (v.__class === 'RPG::MoveRoute') {
    return { list: (v.list || []).map(c => ({ code: c.code, parameters: rgssValue(c.parameters || []) })),
      repeat: !!v.repeat, skippable: !!v.skippable, wait: !!v.wait };
  }
  const o = {};
  for (const k of Object.keys(v)) if (k !== '__class' && k !== '__data') o[k] = rgssValue(v[k]);
  return o;
}

// An event command list in MV's shape. XP keeps the first message line in 101 itself
// (MV: 101 = face/background/position, the lines in 401); XP and VX number the Control
// Variables operands and the actor conditions differently; every RGSS engine counts
// equipment slots from 0 where MV counts equipment types from 1.
function rgssList(list, engine) {
  const out = [];
  for (const c of list || []) {
    if (!c) continue;
    const code = c.code | 0, indent = c.indent | 0;
    let p = rgssValue(c.parameters || []);
    if (code === 101 && engine === 'xp') {
      out.push({ code: 101, indent, parameters: ['', 0, 0, 2] });
      out.push({ code: 401, indent, parameters: [p[0] ?? ''] });
      continue;
    }
    if (engine !== 'vxace') {
      // Control Variables, XP/VX operand: 3 item, 4 actor, 5 enemy, 6 character, 7 other.
      // MV: 3 game data [type, param1, param2] with type 0 item, 3 actor, 4 enemy, 5 character, 7 other.
      if (code === 122 && p[3] >= 3) {
        const type = { 3: 0, 4: 3, 5: 4, 6: 5, 7: 7 }[p[3]];
        p = type === undefined ? p : [p[0], p[1], p[2], 3, type, ...(p[3] === 7 ? [p[4] ?? 0, 0] : [p[4] ?? 0, p[5] ?? 0])];
      }
      // Conditional Branch on an actor, XP/VX: 0 party, 1 name, 2 skill, 3 weapon, 4 armor, 5 state
      // (no class); MV: … 2 class, 3 skill, 4 weapon, 5 armor, 6 state.
      if (code === 111 && p[0] === 4 && p[2] >= 2) p = [p[0], p[1], p[2] + 1, ...p.slice(3)];
    }
    if (code === 319) p = [p[0], (p[1] | 0) + 1, ...p.slice(2)];   // Change Equipment: slot → equipment type
    out.push({ code, indent, parameters: p });
  }
  return out;
}

const rgssName = v => (typeof v === 'string' ? v : '');
// [nil, obj, obj …] or Hash{id → obj} → entries [id, obj].
function rgssEntries(v) {
  if (v instanceof Map) return [...v].filter(([k, x]) => typeof k === 'number' && x);
  if (Array.isArray(v)) return v.map((x, i) => [i, x]).filter(([, x]) => x);
  return [];
}

// kind: 'MapInfos' | 'Map' | 'CommonEvents' | 'Actors' | 'System'.
function rgssData(kind, v, engine) {
  if (kind === 'MapInfos') {
    const out = [null];
    for (const [id, m] of rgssEntries(v)) out[id] = { id, name: rgssName(m.name), parentId: m.parent_id | 0, order: m.order | 0, expanded: !!m.expanded };
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = null;
    return out;
  }
  if (kind === 'Map') {
    const events = [null];
    for (const [id, ev] of rgssEntries(v && v.events)) {
      events[id] = {
        id: ev.id ?? id, name: rgssName(ev.name), x: ev.x | 0, y: ev.y | 0,
        pages: (ev.pages || []).filter(Boolean).map(pg => ({ list: rgssList(pg.list, engine) })),
      };
    }
    for (let i = 0; i < events.length; i++) if (events[i] === undefined) events[i] = null;
    return { width: v && v.width, height: v && v.height, events };
  }
  if (kind === 'CommonEvents') {
    return rgssEntries(v).map(([id, ce]) => ({
      id: ce.id ?? id, name: rgssName(ce.name), trigger: ce.trigger | 0, switchId: ce.switch_id | 0,
      list: rgssList(ce.list, engine),
    }));
  }
  if (kind === 'Actors') {
    const out = [null];
    for (const [id, a] of rgssEntries(v)) {
      const equips = Array.isArray(a.equips) ? a.equips.map(n => n | 0)
        : [a.weapon_id, a.armor1_id, a.armor2_id, a.armor3_id, a.armor4_id].map(n => n | 0);
      out[id] = { id, name: rgssName(a.name), classId: a.class_id | 0, equips };
    }
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = null;
    return out;
  }
  if (kind === 'System') {
    const names = a => (Array.isArray(a) ? a.map(rgssName) : []);
    const screen = RGSS_SCREEN[engine] || RGSS_SCREEN.vxace;
    return {
      gameTitle: rgssName(v && v.game_title),
      switches: names(v && v.switches),
      variables: names(v && v.variables),
      partyMembers: Array.isArray(v && v.party_members) ? v.party_members.map(n => n | 0) : [],
      advanced: { screenWidth: screen.width, screenHeight: screen.height },
    };
  }
  return null;
}

// A data file's contents in MV's shape: .json as is, RGSS data through Marshal.
// kind is the file's base name without the map number ('Map', 'System' …).
async function readGameData(file, name) {
  const engine = rgssEngine(name);
  if (!engine) return JSON.parse(await file.text());
  const kind = /^Map\d{3}\./i.test(name) ? 'Map' : name.replace(/\..*$/, '');
  const buf = file.arrayBuffer ? await file.arrayBuffer() : await new Response(await file.text()).arrayBuffer();
  return rgssData(kind, marshalLoad(new Uint8Array(buf)), engine);
}

// The game root for the scene player: RGSS keeps pictures and faces under Graphics/
// where MV has img/ (audio/ is the same folder name). root is a treeRoot()/filesRoot().
function rgssMediaRoot(root) {
  if (!root) return null;
  return {
    list: path => root.list(path.replace(/^img(?=\/|$)/, 'graphics')),
    file: e => root.file(e),
  };
}

// Two game roots seen as one (an archive's Graphics/ plus the folder's Audio/): the first wins.
function unionRoot(a, b) {
  if (!a || !b) return a || b;
  return {
    list: async path => {
      const [x, y] = await Promise.all([a.list(path), b.list(path)]);
      const out = new Map(y);
      for (const [k, e] of x) out.set(k, { ...e, _from: a });
      for (const [k, e] of out) if (!e._from) out.set(k, { ...e, _from: b });
      return out;
    },
    file: e => e._from.file(e),
  };
}

// The files of an RGSSAD archive (js/decrypt-rgssad.js, same file as MakerLens Assets):
// the archive is read once to list it, then each file is sliced from it and
// decrypted only when read. path keeps the archive's folders ('Data/Map001.rvdata2').
async function archiveFiles(file) {
  const entries = parseRGSSAD(await file.arrayBuffer());
  return entries.map(e => {
    const bytes = async () => rgssDecryptData(new Uint8Array(await file.slice(e.offset, e.offset + e.size).arrayBuffer()), e.fKey);
    return { name: e.name.split('/').pop(), path: e.name, size: e.size,
      arrayBuffer: bytes, text: async () => new TextDecoder().decode(await bytes()) };
  });
}
