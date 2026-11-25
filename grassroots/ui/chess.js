/* The functions Chess declares, as the library would compute them, on positions written in FEN and moves in
 * the long algebraic form of UCI ("e2e4", "e7e8q"):
 *
 *   first()          the first position
 *   side(b)          the side to move of b: 1 white, 2 black
 *   legal(m, b)      1 if m is a legal move on b by the Laws of Chess, else 0
 *   after(m, b)      the position after m on b
 *   mate(b)          1 if the side to move of b is checkmated, else 0
 *
 * Draws by repetition and by the fifty-move rule are not computed: the contract has no act for them.
 */
(function (G) {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const sq = s => (s.charCodeAt(0) - 97) + 8 * (8 - +s[1]);           /* a8 = 0, h1 = 63 */
  const name = i => String.fromCharCode(97 + i % 8) + (8 - (i >> 3));
  function parse(f) {
    const [rows, turn, castle, ep, half, full] = String(f).trim().split(/\s+/);
    if (!rows || !turn) return null;
    const b = [];
    for (const r of rows.split('/')) for (const c of r) { if (/\d/.test(c)) for (let k = 0; k < +c; k++) b.push(null); else b.push(c); }
    if (b.length !== 64) return null;
    return {b, turn, castle: castle || '-', ep: ep || '-', half: +half || 0, full: +full || 1};
  }
  function fen(p) {
    let s = '';
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let c = 0; c < 8; c++) { const x = p.b[r * 8 + c]; if (!x) e++; else { if (e) s += e; e = 0; s += x; } }
      if (e) s += e;
      if (r < 7) s += '/';
    }
    return `${s} ${p.turn} ${p.castle || '-'} ${p.ep} ${p.half} ${p.full}`;
  }
  const white = x => x && x === x.toUpperCase(), mine = (x, t) => x && (t === 'w' ? white(x) : !white(x));
  const at = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1;
  /* whether square i is attacked by side t */
  function attacked(p, i, t) {
    const r = i >> 3, c = i % 8, up = t === 'w' ? 1 : -1;
    const P = t === 'w' ? 'P' : 'p', N = t === 'w' ? 'N' : 'n', B = t === 'w' ? 'B' : 'b', R = t === 'w' ? 'R' : 'r', Q = t === 'w' ? 'Q' : 'q', K = t === 'w' ? 'K' : 'k';
    for (const dc of [-1, 1]) { const j = at(r + up, c + dc); if (j >= 0 && p.b[j] === P) return true; }
    for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const j = at(r + dr, c + dc); if (j >= 0 && p.b[j] === N) return true; }
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const diag = dr && dc;
      for (let k = 1; k < 8; k++) {
        const j = at(r + dr * k, c + dc * k);
        if (j < 0) break;
        const x = p.b[j];
        if (!x) continue;
        if (k === 1 && x === K) return true;
        if (x === Q || (diag ? x === B : x === R)) return true;
        break;
      }
    }
    return false;
  }
  function pseudo(p) {
    const out = [], t = p.turn, add = (i, j, pr) => out.push(name(i) + name(j) + (pr || ''));
    for (let i = 0; i < 64; i++) {
      const x = p.b[i];
      if (!mine(x, t)) continue;
      const r = i >> 3, c = i % 8, k = x.toLowerCase();
      if (k === 'p') {
        const dr = t === 'w' ? -1 : 1, home = t === 'w' ? 6 : 1, last = t === 'w' ? 0 : 7;
        const one = at(r + dr, c);
        const step = (j) => { if ((j >> 3) === last) for (const q of 'qrbn') add(i, j, q); else add(i, j); };
        if (one >= 0 && !p.b[one]) { step(one); const two = at(r + 2 * dr, c); if (r === home && !p.b[two]) add(i, two); }
        for (const dc of [-1, 1]) {
          const j = at(r + dr, c + dc);
          if (j < 0) continue;
          if (p.b[j] && !mine(p.b[j], t)) step(j);
          else if (p.ep !== '-' && name(j) === p.ep) add(i, j);
        }
      } else if (k === 'n' || k === 'k') {
        const ds = k === 'n' ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dr, dc] of ds) { const j = at(r + dr, c + dc); if (j >= 0 && !mine(p.b[j], t)) add(i, j); }
        if (k === 'k') {
          const o = t === 'w' ? 'b' : 'w', row = t === 'w' ? 7 : 0;
          if (i === at(row, 4) && !attacked(p, i, o)) {
            const kc = t === 'w' ? 'K' : 'k', qc = t === 'w' ? 'Q' : 'q';
            if (p.castle.includes(kc) && !p.b[at(row, 5)] && !p.b[at(row, 6)] && !attacked(p, at(row, 5), o) && !attacked(p, at(row, 6), o)) add(i, at(row, 6));
            if (p.castle.includes(qc) && !p.b[at(row, 3)] && !p.b[at(row, 2)] && !p.b[at(row, 1)] && !attacked(p, at(row, 3), o) && !attacked(p, at(row, 2), o)) add(i, at(row, 2));
          }
        }
      } else {
        const ds = k === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : k === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dr, dc] of ds) for (let m = 1; m < 8; m++) {
          const j = at(r + dr * m, c + dc * m);
          if (j < 0 || mine(p.b[j], t)) break;
          add(i, j);
          if (p.b[j]) break;
        }
      }
    }
    return out;
  }
  function play(p, m) {
    const q = {...p, b: p.b.slice()}, i = sq(m.slice(0, 2)), j = sq(m.slice(2, 4)), x = q.b[i], k = x.toLowerCase();
    const capture = !!q.b[j] || (k === 'p' && m.slice(2, 4) === p.ep);
    if (k === 'p' && m.slice(2, 4) === p.ep) q.b[j + (p.turn === 'w' ? 8 : -8)] = null;
    q.b[j] = m[4] ? (p.turn === 'w' ? m[4].toUpperCase() : m[4]) : x;
    q.b[i] = null;
    if (k === 'k' && Math.abs(j - i) === 2) { const rf = j > i ? j + 1 : j - 2, rt = j > i ? j - 1 : j + 1; q.b[rt] = q.b[rf]; q.b[rf] = null; }
    let cs = q.castle === '-' ? '' : q.castle;
    const drop = s => { cs = cs.replace(s, ''); };
    if (x === 'K') { drop('K'); drop('Q'); } if (x === 'k') { drop('k'); drop('q'); }
    for (const [s, c] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (i === s || j === s) drop(c);
    q.castle = cs || '-';
    q.ep = k === 'p' && Math.abs(j - i) === 16 ? name((i + j) / 2) : '-';
    q.half = k === 'p' || capture ? 0 : p.half + 1;
    if (p.turn === 'b') q.full = p.full + 1;
    q.turn = p.turn === 'w' ? 'b' : 'w';
    return q;
  }
  function moves(p) {
    const king = p.turn === 'w' ? 'K' : 'k';
    return pseudo(p).filter(m => { const q = play(p, m); const i = q.b.indexOf(king); return i >= 0 && !attacked(q, i, q.turn); });
  }
  const norm = m => String(m).trim().toLowerCase().replace(/[^a-h1-8qrbn]/g, '');
  const CHESS = {
    first: () => START,
    side: b => { const p = parse(b); return p ? (p.turn === 'w' ? 1 : 2) : undefined; },
    legal: (m, b) => { const p = parse(b); return p && moves(p).includes(norm(m)) ? 1 : 0; },
    after: (m, b) => { const p = parse(b); return p && moves(p).includes(norm(m)) ? fen(play(p, norm(m))) : undefined; },
    mate: b => { const p = parse(b); if (!p) return undefined; const king = p.turn === 'w' ? 'K' : 'k'; return moves(p).length === 0 && attacked(p, p.b.indexOf(king), p.turn === 'w' ? 'b' : 'w') ? 1 : 0; },
    /* for the look: the pieces of a position, and the legal moves */
    board: b => { const p = parse(b); return p ? p.b : null; },
    moves: b => { const p = parse(b); return p ? moves(p) : []; },
  };
  G.CHESS = CHESS;
  G.GRASSROOTS_FNS = Object.assign(G.GRASSROOTS_FNS || {}, {first: CHESS.first, side: CHESS.side, legal: CHESS.legal, after: CHESS.after, mate: CHESS.mate});
  if (typeof module !== 'undefined') module.exports = CHESS;
})(typeof window !== 'undefined' ? window : globalThis);
