// A small LCF writer for synthetic RPG Maker 2000/2003 fixtures (tests only).
export const ber = n => {
  n = n >>> 0;
  const out = [n & 0x7f];
  while ((n = Math.floor(n / 128)) > 0) out.unshift((n & 0x7f) | 0x80);
  return out;
};
export const str = (s, enc = 'latin1') => [...(enc === 'raw' ? s : Buffer.from(s, enc))];
const lenStr = bytes => [...ber(bytes.length), ...bytes];
// chunks: [[id, bytes]] → struct bytes ended by 0
export const struct = chunks => [...chunks.flatMap(([id, b]) => [...ber(id), ...ber(b.length), ...b]), 0];
export const array = items => [...ber(items.length), ...items.flatMap(([id, chunks]) => [...ber(id), ...struct(chunks)])];
export const int = n => ber(n);
export const header = name => lenStr(str(name));
// [code, indent, string bytes, params]
export const commands = list => list.flatMap(([code, indent, s = [], params = []]) =>
  [...ber(code), ...ber(indent), ...lenStr(s), ...ber(params.length), ...params.flatMap(ber)]);
export const lmt = maps => new Uint8Array([...header('LcfMapTree'), ...array(maps), ...ber(maps.length), ...maps.map(m => m[0]).flatMap(ber), 0, 0]);
export const ldb = chunks => new Uint8Array([...header('LcfDataBase'), ...struct(chunks)]);
export const lmu = chunks => new Uint8Array([...header('LcfMapUnit'), ...struct(chunks)]);
