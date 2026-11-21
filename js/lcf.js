/* ── RPG Maker 2000 / 2003: LCF data (RPG_RT.lmt, RPG_RT.ldb, Map####.lmu) ──
   Read into the same shapes as MV's data/*.json, so the parser, the scene player and the
   search run unchanged. No DOM, tested in node (tests/lcf.test.mjs).

   Sources (listed in awesome-game-file-format-reversing): EasyRPG liblcf (the chunk ids
   in its generated/*.csv: database, actor, switch, variable, commonevent, map, event,
   eventpage, mapinfo, system) and EasyRPG Player's Game_Interpreter (command parameters).
   - Integers are BER: 7 bits per byte, most significant first, high bit = more bytes.
   - A file starts with its name as a BER-length string ("LcfMapTree", "LcfDataBase",
     "LcfMapUnit"). A struct is a list of chunks (id, size, data) ended by id 0; an
     array of structs is a count, then for each an id and its chunks.
   - Event commands: code, indent, string (length + bytes), parameter count, parameters
     (BER of the 32-bit value, so negatives come back as large numbers).
   - Strings are bytes in the game's code page (Shift-JIS for Japanese games). */

const LCF_FILE = /^(RPG_RT\.(ldb|lmt)|Map\d{4}\.lmu)$/i;
// The scene player draws in game pixels sized for MV's message window: RM2k's 320×240
// screen is doubled (positions and zoom of pictures too).
const LCF_SCALE = 2;
const LCF_SCREEN = { width: 320 * LCF_SCALE, height: 240 * LCF_SCALE };

function lcfReader(u, start = 0, end = u.length) {
  let pos = start;
  const r = {
    get pos() { return pos; },
    get left() { return end - pos; },
    ber() {
      let v = 0, b, n = 0;
      do {
        if (pos >= end) throw new Error('LCF data ends early');
        b = u[pos++];
        v = v * 128 + (b & 0x7f);
        if (++n > 5) throw new Error('LCF number too long');
      } while (b & 0x80);
      return v;
    },
    bytes(n) {
      if (n < 0 || pos + n > end) throw new Error('LCF data ends early');
      const out = u.subarray(pos, pos + n);
      pos += n;
      return out;
    },
    // A struct's chunks: Map(id → bytes), up to the 0 that ends it (or the end).
    chunks() {
      const out = new Map();
      while (pos < end) {
        const id = r.ber();
        if (id === 0) break;
        out.set(id, r.bytes(r.ber()));
      }
      return out;
    },
    // An array of structs: [{ id, chunks }].
    array() {
      const out = [];
      for (let n = r.ber(); n > 0 && pos < end; n--) out.push({ id: r.ber(), chunks: r.chunks() });
      return out;
    },
  };
  return r;
}

const lcfInt = b => (b && b.length ? lcfReader(b).ber() | 0 : 0);
const lcfArray = b => (b && b.length ? lcfReader(b).array() : []);

function lcfHeader(r, name) {
  const got = new TextDecoder('latin1').decode(r.bytes(r.ber()));
  if (got !== name) throw new Error(`Not an RPG Maker 2000/2003 ${name} file`);
}

// The code page of a game's strings, from sample bytes: UTF-8 (EasyRPG projects),
// Shift-JIS when the text decodes to Japanese (kana), else Windows-1252.
function lcfEncoding(samples) {
  const bytes = [];
  for (const s of samples) for (const b of s) if (b >= 0x80) { bytes.push(...s); break; }
  if (!bytes.length) return 'windows-1252';
  const u = Uint8Array.from(bytes);
  try { new TextDecoder('utf-8', { fatal: true }).decode(u); return 'utf-8'; } catch {}
  try {
    const text = new TextDecoder('shift_jis', { fatal: true }).decode(u);
    let wide = 0, kana = 0;
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (c < 0x80) continue;
      wide++;
      if (c >= 0x3040 && c <= 0x30ff) kana++;   // hiragana, katakana (full width)
    }
    if (wide && kana / wide >= 0.15) return 'shift_jis';
  } catch {}
  return 'windows-1252';
}

function lcfText(enc) {
  const dec = new TextDecoder(enc || 'windows-1252');
  return b => (b && b.length ? dec.decode(b) : '');
}

// Strings worth sampling for the encoding: names in the map tree and the database.
function lcfSamples(lmt, ldb) {
  const out = [];
  try {
    const r = lcfReader(lmt); lcfHeader(r, 'LcfMapTree');
    for (const m of r.array()) if (m.chunks.get(1)) out.push(m.chunks.get(1));
  } catch {}
  try {
    const r = lcfReader(ldb); lcfHeader(r, 'LcfDataBase');
    const root = r.chunks();
    for (const id of [0x0b, 0x17, 0x18, 0x19]) for (const it of lcfArray(root.get(id))) if (it.chunks.get(1)) out.push(it.chunks.get(1));
    // Common event messages: the bulk of a game's text.
    for (const ce of lcfArray(root.get(0x19))) {
      const cmds = ce.chunks.get(0x16);
      if (cmds) for (const c of lcfCommandsRaw(cmds)) if (c.str.length) out.push(c.str);
      if (out.length > 4000) break;
    }
  } catch {}
  return out;
}

// RPG_RT.lmt → MV MapInfos: [null, {id, name, parentId, order, expanded} …] (maps only:
// the project root and areas have no map file).
function lcfMapTree(bytes, enc) {
  const r = lcfReader(bytes), text = lcfText(enc);
  lcfHeader(r, 'LcfMapTree');
  const infos = r.array();
  const order = [];
  try { for (let n = r.ber(); n > 0; n--) order.push(r.ber()); } catch {}
  const rank = new Map(order.map((id, i) => [id, i + 1]));
  const out = [null];
  for (const { id, chunks } of infos) {
    if (!id || lcfInt(chunks.get(4)) !== 1) continue;   // type 1 = map (0 root, 2 area)
    out[id] = { id, name: text(chunks.get(1)), parentId: lcfInt(chunks.get(2)), order: rank.get(id) || id,
      expanded: lcfInt(chunks.get(7)) !== 0 };
  }
  for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = null;
  return out;
}

// Raw event commands from an event_commands chunk.
function lcfCommandsRaw(bytes) {
  const r = lcfReader(bytes), out = [];
  while (r.left > 0) {
    const code = r.ber(), indent = r.ber();
    const str = r.bytes(r.ber());
    const params = [];
    for (let n = r.ber(); n > 0; n--) params.push(r.ber() | 0);   // 32-bit two's complement
    out.push({ code, indent, str, params });
  }
  return out;
}

// RM2k command list → MV command list. Codes MV knows are mapped (messages, choices,
// branches, labels, loops, switches, variables, pictures, sound, waits, party, names);
// the others keep their RM2k code, which the parser and the player skip.
function lcfList(bytes, enc) {
  const text = lcfText(enc);
  const out = [];
  const S2 = LCF_SCALE;
  const push = (code, indent, parameters) => out.push({ code, indent, parameters });
  let raw;
  try { raw = lcfCommandsRaw(bytes || new Uint8Array(0)); } catch { raw = []; }
  for (const c of raw) {
    const p = c.params, ind = c.indent, s = text(c.str);
    switch (c.code) {
      case 10: push(0, ind, []); break;                                     // end of block
      case 10110: push(101, ind, ['', 0, 0, 2]); push(401, ind, [s]); break; // Show Message (first line)
      case 20110: push(401, ind, [s]); break;                               // … next lines
      case 10140: push(102, ind, [s.split('/'), -1, 0, 2, 0]); break;       // Show Choice "a/b/c"
      case 20140:                                                           // a choice (4 = cancel)
        if (p[0] === 4) push(403, ind, []);
        else push(402, ind, [p[0] | 0, s]);
        break;
      case 20141: push(404, ind, []); break;
      case 12010: push(111, ind, lcfCondition(p, s)); break;
      case 22010: push(411, ind, []); break;
      case 22011: push(412, ind, []); break;
      case 12110: push(118, ind, [String(p[0])]); break;                    // Label
      case 12120: push(119, ind, [String(p[0])]); break;                    // Jump to Label
      case 12210: push(112, ind, []); break;                                // Loop
      case 22210: push(413, ind, []); break;
      case 12220: push(113, ind, []); break;                                // Break Loop
      case 12310: push(115, ind, []); break;                                // End Event Processing
      case 12330:                                                           // Call Event: common event
        if (p[0] === 0) push(117, ind, [p[1]]); else push(c.code, ind, p);
        break;
      case 12410: push(108, ind, [s]); break;                               // Comment
      case 22410: push(408, ind, [s]); break;
      case 10210: {                                                         // Control Switches
        const [mode, a, b, op] = p;
        if (mode <= 1 && op <= 1) push(121, ind, [a, mode === 1 ? b : a, op]);
        else push(c.code, ind, p);
        break;
      }
      case 10220: {                                                         // Control Variables
        const [mode, a, b, op, type, v1, v2] = p;
        if (mode > 1) { push(c.code, ind, p); break; }
        const end = mode === 1 ? b : a;
        const operand = type === 0 ? [0, v1] : type === 1 ? [1, v1] : type === 3 ? [2, v1, v2] : [3, 7, 0, 0];
        push(122, ind, [a, end, op, ...operand]);
        break;
      }
      case 10330:                                                           // Change Party: [0 add / 1 remove, 0 id / 1 variable, id]
        if (p[1] === 0) push(129, ind, [p[2], p[0], 0]); else push(c.code, ind, p);
        break;
      case 10610: push(320, ind, [p[0], s]); break;                         // Change Hero Name
      case 11010: push(221, ind, []); break;                                // Erase Screen
      case 11020: push(222, ind, []); break;                                // Show Screen
      case 11110:                                                           // Show Picture
        push(231, ind, [p[0], s, 1, p[1] | 0, (p[2] | 0) * (p[1] ? 1 : S2), (p[3] | 0) * (p[1] ? 1 : S2),
          (p[5] || 100) * S2, (p[5] || 100) * S2, Math.round(255 * (100 - (p[6] | 0)) / 100), 0]);
        break;
      case 11120:                                                           // Move Picture: duration in 1/10 s
        push(232, ind, [p[0], 0, 1, p[1] | 0, (p[2] | 0) * (p[1] ? 1 : S2), (p[3] | 0) * (p[1] ? 1 : S2),
          (p[5] || 100) * S2, (p[5] || 100) * S2, Math.round(255 * (100 - (p[6] | 0)) / 100), 0,
          (p[14] | 0) * 6, !!p[15]]);
        break;
      case 11130: push(235, ind, [p[0]]); break;                            // Erase Picture
      case 11410: push(230, ind, [(p[0] | 0) * 6]); break;                  // Wait (1/10 s → frames)
      case 11510: push(241, ind, [{ name: s, volume: p[1] ?? 100, pitch: p[2] ?? 100, pan: (p[3] ?? 50) - 50 }]); break;
      case 11550: push(250, ind, [{ name: s, volume: p[0] ?? 100, pitch: p[1] ?? 100, pan: (p[2] ?? 50) - 50 }]); break;
      case 10130: push(c.code, ind, [s, ...p]); break;                      // Face Graphic: kept for the message after
      default: push(c.code, ind, s ? [s, ...p] : p);
    }
  }
  // Message faces: RM2k sets the face once (10130) for the messages that follow.
  let face = '', faceIndex = 0;
  for (const cmd of out) {
    if (cmd.code === 10130) { face = cmd.parameters[0] || ''; faceIndex = cmd.parameters[1] | 0; }
    else if (cmd.code === 101) { cmd.parameters[0] = face; cmd.parameters[1] = faceIndex; }
  }
  return out;
}

// Conditional Branch (12010) → MV 111 parameters. Kinds MV has are mapped; the others
// become kind 99, which the graph shows as a condition and the player takes as true.
function lcfCondition(p, s) {
  switch (p[0]) {
    case 0: return [0, p[1], p[2]];                         // switch: 0 ON / 1 OFF
    case 1: return [1, p[1], p[2], p[3], p[4]];             // variable: same order as MV
    case 2: return [3, p[1], p[2]];                         // timer
    case 3: return [7, p[1], p[2]];                         // gold: 0 >= / 1 <=
    case 4: return [8, p[1]];                               // item
    case 5:                                                 // hero: 0 in party, 1 name, 4 skill, 6 state
      if (p[2] === 0) return [4, p[1], 0];
      if (p[2] === 1) return [4, p[1], 1, s];
      if (p[2] === 4) return [4, p[1], 3, p[3]];
      if (p[2] === 6) return [4, p[1], 6, p[3]];
      return [99, ...p];
    case 6: return [6, p[1], p[2]];                         // event facing
    case 8: return [11, p[1]];                              // key / how the event started
    default: return [99, ...p];
  }
}

// RPG_RT.ldb → { actors, system, commonEvents } in MV's shapes.
function lcfDatabase(bytes, enc) {
  const r = lcfReader(bytes), text = lcfText(enc);
  lcfHeader(r, 'LcfDataBase');
  const root = r.chunks();
  const names = id => {
    const out = [''];
    for (const it of lcfArray(root.get(id))) out[it.id] = text(it.chunks.get(1));
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = '';
    return out;
  };
  const actors = [null];
  for (const a of lcfArray(root.get(0x0b))) {
    const eq = a.chunks.get(0x33);   // initial equipment: 5 × int16 LE (weapon, shield, armor, helmet, accessory)
    const equips = [];
    if (eq) for (let i = 0; i + 1 < eq.length && i < 10; i += 2) equips.push(eq[i] | (eq[i + 1] << 8));
    actors[a.id] = { id: a.id, name: text(a.chunks.get(1)), classId: lcfInt(a.chunks.get(0x39)), equips };
  }
  for (let i = 0; i < actors.length; i++) if (actors[i] === undefined) actors[i] = null;
  let party = [];
  try {
    const sys = root.get(0x16) ? lcfReader(root.get(0x16)).chunks() : new Map();
    const pb = sys.get(0x16);   // party: int16 LE actor ids
    if (pb) for (let i = 0; i + 1 < pb.length; i += 2) party.push(pb[i] | (pb[i + 1] << 8));
  } catch { party = []; }
  const commonEvents = lcfArray(root.get(0x19)).map(ce => ({
    id: ce.id, name: text(ce.chunks.get(1)), trigger: lcfInt(ce.chunks.get(0x0b)), switchId: lcfInt(ce.chunks.get(0x0d)),
    list: lcfList(ce.chunks.get(0x16), enc),
  }));
  return {
    actors,
    system: { engine: 'rm2k', switches: names(0x17), variables: names(0x18), partyMembers: party,
      advanced: { screenWidth: LCF_SCREEN.width, screenHeight: LCF_SCREEN.height } },
    commonEvents,
  };
}

// Map####.lmu → MV map: { width, height, events: [null, {id, name, x, y, pages: [{list}]} …] }.
function lcfMap(bytes, enc) {
  const r = lcfReader(bytes), text = lcfText(enc);
  lcfHeader(r, 'LcfMapUnit');
  const root = r.chunks();
  const events = [null];
  for (const ev of lcfArray(root.get(0x51))) {
    events[ev.id] = {
      id: ev.id, name: text(ev.chunks.get(1)), x: lcfInt(ev.chunks.get(2)), y: lcfInt(ev.chunks.get(3)),
      pages: lcfArray(ev.chunks.get(5)).map(pg => ({ list: lcfList(pg.chunks.get(0x34), enc) })),
    };
  }
  for (let i = 0; i < events.length; i++) if (events[i] === undefined) events[i] = null;
  return { width: lcfInt(root.get(2)), height: lcfInt(root.get(3)), events };
}

// The game folder for the scene player: RM2k keeps pictures in Picture/, faces in
// FaceSet/, music in Music/ and sounds in Sound/ (root is a treeRoot()/filesRoot()).
const LCF_FOLDERS = { 'img/pictures': 'picture', 'img/faces': 'faceset', 'audio/bgm': 'music', 'audio/bgs': 'music', 'audio/me': 'music', 'audio/se': 'sound' };
function lcfMediaRoot(root) {
  if (!root) return null;
  return {
    list: path => root.list(LCF_FOLDERS[path] || path),
    file: e => root.file(e),
  };
}

// RM2k draws palette entry 0 as transparent on pictures and faces: add a tRNS chunk to an
// 8-bit palette PNG (as xyzToPng() makes, or the game's own .png). Other images unchanged.
function pngTransparent0(png) {
  const u = ArrayBuffer.isView(png) ? png : new Uint8Array(png);
  if (u.length < 33 || u[0] !== 0x89 || u[25] !== 3) return u;   // IHDR colour type 3 = palette
  let at = 8, plteEnd = -1;
  while (at + 8 <= u.length) {
    const len = ((u[at] << 24) >>> 0) + (u[at + 1] << 16) + (u[at + 2] << 8) + u[at + 3];
    const type = String.fromCharCode(u[at + 4], u[at + 5], u[at + 6], u[at + 7]);
    if (type === 'tRNS') return u;   // the image says it already
    if (type === 'PLTE') plteEnd = at + 12 + len;
    if (type === 'IDAT' || type === 'IEND') break;
    at += 12 + len;
  }
  if (plteEnd < 0) return u;
  const t = _pngChunk('tRNS', new Uint8Array([0]));
  const out = new Uint8Array(u.length + t.length);
  out.set(u.subarray(0, plteEnd)); out.set(t, plteEnd); out.set(u.subarray(plteEnd), plteEnd + t.length);
  return out;
}
