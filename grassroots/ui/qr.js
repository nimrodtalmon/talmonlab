/* A small QR code encoder: byte mode, error correction level M, versions 1 to 10, mask 0.
 * QR(text) gives the matrix of modules, true for dark; QR.svg(text) an SVG of it.
 * Written for the look's SCANNED values: a person's key shown as a code another phone scans. */
(function (G) {
  /* data codewords and error correction codewords per block, by version, level M: [ecPerBlock, [blocks, dataPerBlock]...] */
  const M = {
    1: [10, [1, 16]], 2: [16, [1, 28]], 3: [26, [1, 44]], 4: [18, [2, 32]], 5: [24, [2, 43]],
    6: [16, [4, 27]], 7: [18, [4, 31]], 8: [22, [2, 38], [2, 39]], 9: [22, [3, 36], [2, 37]], 10: [26, [4, 43], [1, 44]],
  };
  const ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]};
  /* GF(256) with the polynomial 0x11d */
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  function rs(data, n) {
    let g = [1];
    for (let i = 0; i < n; i++) { const h = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { h[j] ^= g[j]; h[j + 1] ^= mul(g[j], EXP[i]); } g = h; }
    const r = data.concat(new Array(n).fill(0));
    for (let i = 0; i < data.length; i++) { const c = r[i]; if (c) for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c); }
    return r.slice(data.length);
  }
  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }
  function QR(text) {
    const bytes = utf8(String(text));
    let v = 1, spec, cap;
    for (; v <= 10; v++) {
      spec = M[v]; cap = spec.slice(1).reduce((t, [b, d]) => t + b * d, 0);
      if (4 + (v < 10 ? 8 : 16) + 8 * bytes.length <= 8 * cap) break;
    }
    if (v > 10) throw new Error('too long for this QR encoder');
    /* the bit stream: mode, count, data, terminator, padding */
    const bits = [], put = (x, n) => { for (let i = n - 1; i >= 0; i--) bits.push((x >> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    for (let i = 0; i < 4 && bits.length < 8 * cap; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xec);
    /* blocks, their error correction, interleaved */
    const blocks = [], ecs = [];
    let k = 0;
    for (const [b, d] of spec.slice(1)) for (let i = 0; i < b; i++) { const bl = data.slice(k, k + d); k += d; blocks.push(bl); ecs.push(rs(bl, spec[0])); }
    const seq = [];
    const maxd = Math.max(...blocks.map(b => b.length));
    for (let i = 0; i < maxd; i++) for (const b of blocks) if (i < b.length) seq.push(b[i]);
    for (let i = 0; i < spec[0]; i++) for (const e of ecs) seq.push(e[i]);
    /* the matrix */
    const n = 17 + 4 * v, m = [...Array(n)].map(() => new Array(n).fill(null));
    const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const y = r + i, x = c + j; if (y < 0 || y >= n || x < 0 || x >= n) continue; m[y][x] = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)); } };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) { m[6][i] = i % 2 === 0; m[i][6] = i % 2 === 0; }
    const al = ALIGN[v], last = al[al.length - 1];
    for (const r of al) for (const c of al) {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;   /* under a finder */
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) m[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1;
    }
    m[n - 8][8] = true;
    /* reserve the format and version areas */
    const res = [...Array(n)].map(() => new Array(n).fill(false));
    for (let i = 0; i < 9; i++) { res[8][i] = res[i][8] = true; }
    for (let i = 0; i < 8; i++) { res[8][n - 1 - i] = res[n - 1 - i][8] = true; }
    if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { res[i][n - 11 + j] = res[n - 11 + j][i] = true; }
    /* the data, in the zigzag, with mask 0: (row + column) even */
    const dbits = []; seq.forEach(b => { for (let i = 7; i >= 0; i--) dbits.push((b >> i) & 1); });
    let bi = 0;
    for (let c = n - 1, up = true; c > 0; c -= 2, up = !up) {
      if (c === 6) c--;
      for (let t = 0; t < n; t++) {
        const r = up ? n - 1 - t : t;
        for (const x of [c, c - 1]) {
          if (m[r][x] !== null || res[r][x]) continue;
          const bit = bi < dbits.length ? dbits[bi++] : 0;
          m[r][x] = !!(bit ^ ((r + x) % 2 === 0 ? 1 : 0));
        }
      }
    }
    /* the format bits: level M (00) and mask 0, BCH coded */
    let f = (0 << 3) | 0, g = f << 10;
    for (let i = 14; i >= 10; i--) if (g & (1 << i)) g ^= 0x537 << (i - 10);
    const fmt = ((f << 10) | g) ^ 0x5412;
    const fb = i => ((fmt >> i) & 1) === 1;
    for (let i = 0; i < 15; i++) {
      const b = fb(i);
      if (i < 6) m[i][8] = b; else if (i < 8) m[i + 1][8] = b; else m[n - 15 + i][8] = b;
      if (i < 8) m[8][n - i - 1] = b; else if (i < 9) m[8][15 - i] = b; else m[8][15 - i - 1] = b;
    }
    m[n - 8][8] = true;
    if (v >= 7) {
      let gv = v << 12;
      for (let i = 17; i >= 12; i--) if (gv & (1 << i)) gv ^= 0x1f25 << (i - 12);
      const vb = (v << 12) | gv;
      for (let i = 0; i < 18; i++) { const b = ((vb >> i) & 1) === 1; m[Math.floor(i / 3)][n - 11 + i % 3] = b; m[n - 11 + i % 3][Math.floor(i / 3)] = b; }
    }
    return m.map(r => r.map(x => !!x));
  }
  QR.svg = (text, px = 4) => {
    const m = QR(text), n = m.length, q = 4;
    let d = '';
    m.forEach((r, y) => r.forEach((x, c) => { if (x) d += `M${c + q} ${y + q}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" width="${(n + 2 * q) * px}" height="${(n + 2 * q) * px}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  };
  G.QR = QR;
  if (typeof module !== 'undefined') module.exports = QR;
})(typeof window !== 'undefined' ? window : globalThis);
