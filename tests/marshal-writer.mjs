// A small Ruby Marshal 4.8 writer for synthetic fixtures (tests only): enough of the
// format to build the RPG::* data RPG Maker XP / VX / VX Ace save.
export const sym = s => ({ $sym: s });
export const obj = (cls, ivars) => ({ $obj: cls, ivars });
export const user = (cls, bytes) => ({ $user: cls, bytes });
export const float = n => ({ $float: n });
export const tone = (r, g, b, a) => {
  const dv = new DataView(new ArrayBuffer(32));
  [r, g, b, a].forEach((v, i) => dv.setFloat64(i * 8, v, true));
  return user('Tone', new Uint8Array(dv.buffer));
};

export function marshal(value) {
  const out = [4, 8], syms = new Map();
  const long = n => {
    if (n === 0) return out.push(0);
    if (n > 0 && n < 123) return out.push(n + 5);
    if (n < 0 && n > -124) return out.push((n - 5) & 255);
    const b = [];
    let x = n;
    for (let i = 0; i < 4; i++) { b.push(x & 255); x >>= 8; if (n > 0 ? x === 0 : x === -1) break; }
    out.push((n > 0 ? b.length : -b.length) & 255, ...b);
  };
  const bytes = u => { long(u.length); out.push(...u); };
  const symbol = s => {
    if (syms.has(s)) { out.push(0x3b); return long(syms.get(s)); }
    syms.set(s, syms.size);
    out.push(0x3a); bytes(new TextEncoder().encode(s));
  };
  const w = v => {
    if (v === null || v === undefined) return out.push(0x30);
    if (v === true) return out.push(0x54);
    if (v === false) return out.push(0x46);
    if (typeof v === 'number') { out.push(0x69); return long(v); }
    if (typeof v === 'string') {   // UTF-8 String with its encoding ivar, like Ruby 1.9+
      out.push(0x49, 0x22); bytes(new TextEncoder().encode(v)); long(1); symbol('E'); return out.push(0x54);
    }
    if (Array.isArray(v)) { out.push(0x5b); long(v.length); return v.forEach(w); }
    if (v instanceof Map) { out.push(0x7b); long(v.size); for (const [k, x] of v) { w(k); w(x); } return; }
    if (v.$sym) return symbol(v.$sym);
    if (v.$float !== undefined) { out.push(0x66); return bytes(new TextEncoder().encode(String(v.$float))); }
    if (v.$user) { out.push(0x75); symbol(v.$user); return bytes(v.bytes); }
    if (v.$obj) {
      out.push(0x6f); symbol(v.$obj);
      const keys = Object.keys(v.ivars);
      long(keys.length);
      for (const k of keys) { symbol('@' + k); w(v.ivars[k]); }
      return;
    }
    throw new Error('marshal: cannot write ' + JSON.stringify(v));
  };
  w(value);
  return new Uint8Array(out);
}

// RGSSAD v3 archive with the given files (the format decrypt-rgssad.js reads).
export function rgss3a(entries) {
  const seed = 0x1234, mKey = ((seed * 9) + 3) >>> 0;
  const enc = new TextEncoder();
  const head = [], body = [];
  const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24];
  let dirLen = 12 + 16;   // header + terminator
  for (const [name] of entries) dirLen += 16 + enc.encode(name).length;
  let off = dirLen;
  for (const [name, data] of entries) {
    const nb = enc.encode(name), fKey = 0xabcdef01 >>> 0;
    head.push(...u32((off ^ mKey) >>> 0), ...u32((data.length ^ mKey) >>> 0), ...u32((fKey ^ mKey) >>> 0), ...u32((nb.length ^ mKey) >>> 0));
    const mk = u32(mKey);
    head.push(...nb.map((b, i) => b ^ mk[i % 4]));
    // data XOR the file key, the key advancing every 4 bytes (k = k * 7 + 3)
    let k = fKey;
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      if (i && i % 4 === 0) k = ((k * 7) + 3) >>> 0;
      out[i] = data[i] ^ u32(k)[i % 4];
    }
    body.push(...out);
    off += data.length;
  }
  head.push(...u32(mKey), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);   // offset 0 ends the directory
  const all = new Uint8Array([...enc.encode('RGSSAD\0'), 3, ...u32(seed), ...head, ...body]);
  return { name: 'Game.rgss3a', size: all.length, arrayBuffer: async () => all.buffer,
    slice: (a, b) => ({ arrayBuffer: async () => all.slice(a, b).buffer }) };
}

