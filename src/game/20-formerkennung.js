function isRoughRect(pts) {
  if (pts.length !== 4) return false;
  const angs = interiorAngles(pts);
  let dev = 0;
  for (const ang of angs) {
    if (ang < tuneCode("rectMinAng", 55 * Math.PI / 180) || ang > tuneCode("rectMaxAng", 125 * Math.PI / 180)) return false;
    dev += Math.abs(ang - Math.PI / 2);
  }
  return dev / 4 < tuneCode("rectMeanDev", 28 * Math.PI / 180);
}

function orientedRect(corners, allPts) {
  let best = -1;
  let ang = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const len = dist(a, b);
    if (len > best) {
      best = len;
      ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const src = allPts && allPts.length ? allPts : corners;
  for (const p of src) {
    const u = p.x * c + p.y * s;
    const v = -p.x * s + p.y * c;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  if (maxU - minU < 0.08 || maxV - minV < 0.08) return null;
  const uv = (u, v) => ({ x: u * c - v * s, y: u * s + v * c });
  return [uv(minU, minV), uv(maxU, minV), uv(maxU, maxV), uv(minU, maxV)];
}

function snapTriangle(corners) {
  const pts = corners.map((p) => ({ x: p.x, y: p.y }));
  let bestI = 0;
  let bestDev = Infinity;
  for (let i = 0; i < 3; i++) {
    const dev = Math.abs(armAngle(pts[(i + 2) % 3], pts[i], pts[(i + 1) % 3]) - Math.PI / 2);
    if (dev < bestDev) {
      bestDev = dev;
      bestI = i;
    }
  }
  if (bestDev > tuneCode("triSnap", 22 * Math.PI / 180)) return pts;
  const cur = pts[bestI];
  const prev = pts[(bestI + 2) % 3];
  const next = pts[(bestI + 1) % 3];
  const bax = prev.x - cur.x;
  const bay = prev.y - cur.y;
  const bcx = next.x - cur.x;
  const bcy = next.y - cur.y;
  const cross = bax * bcy - bay * bcx;
  const la = Math.hypot(bax, bay) || 1;
  const lb = Math.hypot(bcx, bcy) || 1;
  const sign = cross >= 0 ? 1 : -1;
  pts[(bestI + 1) % 3] = {
    x: cur.x + (-bay / la) * sign * lb,
    y: cur.y + (bax / la) * sign * lb,
  };
  return pts;
}

function cornerGap(hull, box) {
  let worst = 0;
  for (const c of box) {
    let best = Infinity;
    for (const h of hull) best = Math.min(best, dist(c, h));
    worst = Math.max(worst, best);
  }
  return worst;
}

function rightCornerTol() {
  return tuneCode("rightCorner", RIGHT_CORNER);
}

function anglesNearRight(pts, tol) {
  const limit = tol == null ? rightCornerTol() : tol;
  const angs = interiorAngles(pts);
  return angs.length > 0 && angs.every((a) => Math.abs(a - Math.PI / 2) <= limit);
}

function squareCornerPoint(prev, cur, next) {
  const mx = (prev.x + next.x) / 2;
  const my = (prev.y + next.y) / 2;
  const r = dist(prev, next) / 2;
  if (r < 1e-6) return { x: cur.x, y: cur.y };
  let dx = cur.x - mx;
  let dy = cur.y - my;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    dx = -(next.y - prev.y);
    dy = next.x - prev.x;
    d = Math.hypot(dx, dy) || 1;
  }
  return { x: mx + dx / d * r, y: my + dy / d * r };
}

function squareNearRightCorners(pts) {
  if (!pts || pts.length < 3) return pts;
  let out = ensureCCW(pts.map((p) => ({ x: p.x, y: p.y })));
  const tol = rightCornerTol();
  if (out.length === 4 && anglesNearRight(out, tol)) {
    const box = orientedRect(out, out);
    if (box) return ensureCCW(box);
  }
  for (let pass = 0; pass < 3; pass++) {
    const angs = interiorAngles(out);
    let moved = false;
    const next = out.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(angs[i] - Math.PI / 2) > tol) continue;
      if (Math.abs(angs[i] - Math.PI / 2) < 1e-4) continue;
      const prev = out[(i + out.length - 1) % out.length];
      const cur = out[i];
      const nxt = out[(i + 1) % out.length];
      next[i] = squareCornerPoint(prev, cur, nxt);
      moved = true;
    }
    out = ensureCCW(next);
    if (!moved) break;
  }
  if (out.length === 4 && anglesNearRight(out, tol)) {
    const box = orientedRect(out, out);
    if (box) return ensureCCW(box);
  }
  return out;
}

function dirParallelAng(ax, ay, bx, by) {
  const la = Math.hypot(ax, ay) || 1;
  const lb = Math.hypot(bx, by) || 1;
  let c = Math.abs((ax * bx + ay * by) / (la * lb));
  c = Math.max(-1, Math.min(1, c));
  return Math.acos(c);
}

function oppositeSidesParallel(pts, pair, tol) {
  const a = pts[pair];
  const b = pts[(pair + 1) % 4];
  const c = pts[(pair + 2) % 4];
  const d = pts[(pair + 3) % 4];
  return dirParallelAng(b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y) <= tol;
}

function bothPairsParallel(pts, tol) {
  return oppositeSidesParallel(pts, 0, tol) && oppositeSidesParallel(pts, 1, tol);
}

function quadSize(pts) {
  const area = Math.abs(signedArea(pts));
  const diag = Math.max(dist(pts[0], pts[2]), dist(pts[1], pts[3]));
  return Math.max(Math.sqrt(Math.max(area, 0)), diag * 0.5, 0.4);
}

function cornerShift(src, dst) {
  let max = 0;
  for (let i = 0; i < 4; i++) {
    const d = dist(src[i], dst[i]);
    if (d > max) max = d;
  }
  return max;
}

function alignQuad(src, dst) {
  const dccw = ensureCCW(dst.map((p) => ({ x: p.x, y: p.y })));
  let best = dccw;
  let bestE = Infinity;
  for (let s = 0; s < 4; s++) {
    const cand = [0, 1, 2, 3].map((i) => dccw[(s + i) % 4]);
    const e = cornerShift(src, cand);
    if (e < bestE) {
      bestE = e;
      best = cand;
    }
  }
  return best;
}

function makeParallelogram(pts) {
  const c = {
    x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4,
    y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4,
  };
  const s0x = ((pts[1].x - pts[0].x) + (pts[2].x - pts[3].x)) / 2;
  const s0y = ((pts[1].y - pts[0].y) + (pts[2].y - pts[3].y)) / 2;
  const s1x = ((pts[2].x - pts[1].x) + (pts[3].x - pts[0].x)) / 2;
  const s1y = ((pts[2].y - pts[1].y) + (pts[3].y - pts[0].y)) / 2;
  return [
    { x: c.x - s0x / 2 - s1x / 2, y: c.y - s0y / 2 - s1y / 2 },
    { x: c.x + s0x / 2 - s1x / 2, y: c.y + s0y / 2 - s1y / 2 },
    { x: c.x + s0x / 2 + s1x / 2, y: c.y + s0y / 2 + s1y / 2 },
    { x: c.x - s0x / 2 + s1x / 2, y: c.y - s0y / 2 + s1y / 2 },
  ];
}

function makeRightTrapezoid(pts, i) {
  const P0 = pts[i];
  const P1 = pts[(i + 1) % 4];
  const P2 = pts[(i + 2) % 4];
  const P3 = pts[(i + 3) % 4];
  const hx = P1.x - P0.x;
  const hy = P1.y - P0.y;
  const hlen = Math.hypot(hx, hy);
  if (hlen < 0.08) return null;
  const tx = -hy / hlen;
  const ty = hx / hlen;
  const s3 = (P3.x - P0.x) * tx + (P3.y - P0.y) * ty;
  const s2 = (P2.x - P1.x) * tx + (P2.y - P1.y) * ty;
  if (s3 * s2 < 0) return null;
  if (Math.abs(s3) < 0.08 && Math.abs(s2) < 0.08) return null;
  const out = [null, null, null, null];
  out[i] = { x: P0.x, y: P0.y };
  out[(i + 1) % 4] = { x: P1.x, y: P1.y };
  out[(i + 2) % 4] = { x: P1.x + tx * s2, y: P1.y + ty * s2 };
  out[(i + 3) % 4] = { x: P0.x + tx * s3, y: P0.y + ty * s3 };
  if (!isConvex(out) || Math.abs(signedArea(out)) < 0.04) return null;
  return out;
}

function makeIsoTrapezoid(pts, pair) {
  const P = [0, 1, 2, 3].map((k) => pts[(pair + k) % 4]);
  const b0x = P[1].x - P[0].x;
  const b0y = P[1].y - P[0].y;
  const b1x = P[2].x - P[3].x;
  const b1y = P[2].y - P[3].y;
  const l0 = Math.hypot(b0x, b0y);
  const l1 = Math.hypot(b1x, b1y);
  if (l0 < 0.08 || l1 < 0.08) return null;
  let bx = b0x / l0 + b1x / l1;
  let by = b0y / l0 + b1y / l1;
  let bl = Math.hypot(bx, by);
  if (bl < 1e-6) {
    bx = b0x / l0;
    by = b0y / l0;
    bl = 1;
  }
  bx /= bl;
  by /= bl;
  const hx = -by;
  const hy = bx;
  const projB = (p) => p.x * bx + p.y * by;
  const projH = (p) => p.x * hx + p.y * hy;
  const hBot = 0.5 * (projH(P[0]) + projH(P[1]));
  const hTop = 0.5 * (projH(P[2]) + projH(P[3]));
  if (Math.abs(hTop - hBot) < 0.08) return null;
  const midB = 0.25 * (projB(P[0]) + projB(P[1]) + projB(P[2]) + projB(P[3]));
  const half0 = l0 / 2;
  const half1 = l1 / 2;
  const fromBH = (pb, ph) => ({ x: bx * pb + hx * ph, y: by * pb + hy * ph });
  const flip = projB(P[0]) > projB(P[1]);
  const Q0 = fromBH(midB + (flip ? half0 : -half0), hBot);
  const Q1 = fromBH(midB + (flip ? -half0 : half0), hBot);
  const Q2 = fromBH(midB + (flip ? -half1 : half1), hTop);
  const Q3 = fromBH(midB + (flip ? half1 : -half1), hTop);
  const out = [null, null, null, null];
  out[pair] = Q0;
  out[(pair + 1) % 4] = Q1;
  out[(pair + 2) % 4] = Q2;
  out[(pair + 3) % 4] = Q3;
  if (!isConvex(out) || Math.abs(signedArea(out)) < 0.04) return null;
  return out;
}

function fitRectangle(pts, raw, force) {
  if (!force && !anglesNearRight(pts)) return null;
  const box = orientedRect(pts, (force && raw && raw.length) ? raw : pts);
  if (!box) return null;
  const aligned = alignQuad(pts, box);
  if (!isConvex(aligned)) return null;
  return { kind: "rect", corners: aligned, error: cornerShift(pts, aligned) };
}

function fitRamp(pts, force) {
  const tol = rightCornerTol();
  const angs = interiorAngles(pts);
  const cands = [];
  for (let i = 0; i < 4; i++) {
    const a0 = Math.abs(angs[i] - Math.PI / 2);
    const a1 = Math.abs(angs[(i + 1) % 4] - Math.PI / 2);
    if (!force && (a0 > tol || a1 > tol)) continue;
    const built = makeRightTrapezoid(pts, i);
    if (!built) continue;
    cands.push({ kind: "ramp", corners: built, error: cornerShift(pts, built) });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.error - b.error);
  return cands[0];
}

function fitParallelogram(pts, force) {
  const tol = tuneCode("quadParallel", QUAD_PARALLEL);
  if (!force && !bothPairsParallel(pts, tol)) return null;
  const built = makeParallelogram(pts);
  if (!built || !isConvex(built)) return null;
  return { kind: "para", corners: built, error: cornerShift(pts, built) };
}

function fitIsoTrapezoid(pts, force) {
  const parTol = tuneCode("quadParallel", QUAD_PARALLEL);
  const symTol = tuneCode("quadSymmetry", QUAD_SYMMETRY);
  const angs = interiorAngles(pts);
  const cands = [];
  for (let pair = 0; pair < 2; pair++) {
    if (!force && !oppositeSidesParallel(pts, pair, parTol)) continue;
    const dBot = Math.abs(angs[pair] - angs[(pair + 1) % 4]);
    const dTop = Math.abs(angs[(pair + 2) % 4] - angs[(pair + 3) % 4]);
    if (!force && Math.max(dBot, dTop) > symTol) continue;
    const built = makeIsoTrapezoid(pts, pair);
    if (!built) continue;
    cands.push({ kind: "trap", corners: built, error: cornerShift(pts, built) });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.error - b.error);
  return cands[0];
}

const QUAD_PRIORITY = { rect: 0, ramp: 1, para: 2, trap: 3, free: 4 };

function pickQuadCandidate(list) {
  const copy = list.slice();
  copy.sort((a, b) => (QUAD_PRIORITY[a.kind] - QUAD_PRIORITY[b.kind]) || (a.error - b.error));
  return copy[0];
}

function regularizeQuad(corners, rawPts, force) {
  const src = ensureCCW(corners.map((p) => ({ x: p.x, y: p.y })));
  if (src.length !== 4) return { kind: "free", corners: squareNearRightCorners(src), error: 0 };
  const size = quadSize(src);
  const maxShift = size * tuneCode("quadMaxShift", QUAD_MAX_SHIFT);
  const cands = [];
  const rect = fitRectangle(src, rawPts, false);
  if (rect) cands.push(rect);
  const ramp = fitRamp(src, false);
  if (ramp) cands.push(ramp);
  const para = fitParallelogram(src, false);
  if (para) cands.push(para);
  const trap = fitIsoTrapezoid(src, false);
  if (trap) cands.push(trap);
  const ok = cands.filter((c) => c.error <= maxShift);
  if (ok.length) return pickQuadCandidate(ok);
  if (force) {
    const forced = [];
    const rectF = fitRectangle(src, rawPts, true);
    if (rectF) forced.push(rectF);
    const rampF = fitRamp(src, true);
    if (rampF) forced.push(rampF);
    const paraF = fitParallelogram(src, true);
    if (paraF) forced.push(paraF);
    const trapF = fitIsoTrapezoid(src, true);
    if (trapF) forced.push(trapF);
    if (forced.length) return pickQuadCandidate(forced);
  }
  return { kind: "free", corners: squareNearRightCorners(src), error: 0 };
}

function cornerPeaks(pts, minDeg) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return [];
  const samples = resampleRing(ring, Math.max(64, ring.length * 3));
  if (!samples || samples.length < 8) return [];
  const n = samples.length;
  const minTurn = (minDeg == null ? 32 : minDeg) * Math.PI / 180;
  const win = Math.max(1, Math.round(n * 0.03));
  const turns = [];
  for (let i = 0; i < n; i++) {
    const prev = samples[(i - win + n) % n];
    const cur = samples[i];
    const nxt = samples[(i + win) % n];
    turns.push(turnAngle(prev, cur, nxt));
  }
  const peaks = [];
  for (let i = 0; i < n; i++) {
    const a = Math.abs(turns[(i + n - 1) % n]);
    const b = Math.abs(turns[i]);
    const c = Math.abs(turns[(i + 1) % n]);
    if (b >= a && b >= c && b >= minTurn) peaks.push({ i, turn: b, p: samples[i] });
  }
  const merged = [];
  const minSep = Math.max(4, Math.round(n / 16));
  peaks.sort((u, v) => v.turn - u.turn);
  for (const pk of peaks) {
    if (merged.some((m) => Math.min((pk.i - m.i + n) % n, (m.i - pk.i + n) % n) < minSep)) continue;
    merged.push(pk);
  }
  merged.sort((u, v) => u.i - v.i);
  return merged.map((pk) => ({ x: pk.p.x, y: pk.p.y }));
}

function mergeCornerSets(a, b, minDist) {
  const out = (a || []).map((p) => ({ x: p.x, y: p.y }));
  for (const p of (b || [])) {
    if (out.some((q) => dist(p, q) < minDist)) continue;
    out.push({ x: p.x, y: p.y });
  }
  if (out.length < 3) return out;
  const c = polygonCentroid(out) || { x: 0, y: 0 };
  out.sort((p, q) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(q.y - c.y, q.x - c.x));
  return ensureCCW(out);
}

function nearestRingIndex(ring, p) {
  let best = 0;
  let bestD = 1e9;
  for (let i = 0; i < ring.length; i++) {
    const d = dist(ring[i], p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function edgeBulge(a, b, stroke) {
  const ring = closedRing(stroke);
  if (!ring || ring.length < 2) return 0;
  const n = ring.length;
  const ia = nearestRingIndex(ring, a);
  const ib = nearestRingIndex(ring, b);
  if (ia === ib) return 0;
  let best = 0;
  for (let i = (ia + 1) % n; i !== ib; i = (i + 1) % n) {
    const p = ring[i];
    const d = distPointSeg(p.x, p.y, a.x, a.y, b.x, b.y);
    if (d > best) best = d;
  }
  return best;
}

// Längere Seite des umschließenden Kastens. Darunter schrumpfen die
// Zentimeter-Schwellen mit; ab einem Meter bleiben sie die bisherigen Werte.
const SHAPE_TOL_SPAN = 1;

function strokeSpan(pts) {
  if (!pts || !pts.length) return SHAPE_TOL_SPAN;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (!p) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return SHAPE_TOL_SPAN;
  return Math.max(maxX - minX, maxY - minY, 1e-3);
}

function edgesAreStraight(corners, stroke) {
  if (!corners || corners.length < 3) return false;
  const ref = (stroke && stroke.length) ? stroke : corners;
  const span = strokeSpan(ref);
  // Unter einem Meter darf die Kante kürzer sein, im selben Anteil.
  const minLen = span >= SHAPE_TOL_SPAN ? 0.12 : Math.max(0.04, span * 0.12);
  // 16 cm wären bei einem kleinen Kreis mehr als die Bauchung einer Sehne
  // (etwa 0,15 des Durchmessers). Der Boden sinkt mit dem Zug, bleibt aber
  // unter dieser Bauchung, und 16 cm bleiben die Obergrenze.
  const bulgeFloor = Math.min(0.16, span * 0.10);
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const len = dist(a, b);
    if (len < minLen) return false;
    if (edgeBulge(a, b, stroke) > Math.max(bulgeFloor, len * 0.16)) return false;
  }
  return true;
}

function cornersFromStroke(pts) {
  const ring = ensureCCW(dedupe(closedRing(pts) || pts));
  if (ring.length < 3) return [];
  const absEps = Math.max(tuneCode("simplify", 0.045), 0.05);
  const span = strokeSpan(ring);
  const eps = span >= SHAPE_TOL_SPAN ? absEps : Math.max(0.01, absEps * span / SHAPE_TOL_SPAN);
  let simple = simplifyClosed(ring, eps);
  if (simple.length > 4) simple = pruneByTurn(simple, tuneCode("pruneTurn", 25));
  if (simple.length > 4 && simple.length <= 8) {
    const softer = pruneByTurn(simple, tuneCode("pruneSoft", 42));
    if (softer.length === 3 || softer.length === 4) simple = softer;
  }
  const peaks = cornerPeaks(ring, 32);
  if ((simple.length < 3 || simple.length > 4) && (peaks.length === 3 || peaks.length === 4)) {
    simple = ensureCCW(peaks);
  } else if (simple.length > 4 && peaks.length >= 3 && peaks.length <= 4) {
    const mergeFloor = span >= SHAPE_TOL_SPAN ? 0.18 : Math.max(0.04, span * 0.10);
    const mixed = mergeCornerSets(simple, peaks, Math.max(mergeFloor, ringLen(ring) * 0.04));
    const pruned = mixed.length > 4 ? pruneByTurn(mixed, tuneCode("pruneSoft", 42)) : mixed;
    if (pruned.length === 3 || pruned.length === 4) simple = ensureCCW(pruned);
  }
  return simple;
}

// Geschlossener Zug mit Überschuss: Wer ein Quadrat oder einen Kreis zeichnet,
// fährt am Ende oft ein Stück über den Anfang hinaus. Der Ring kreuzt sich dann
// selbst, und die Vieleck-Erkennung lehnt ihn ab (selfIntersects). Hier wird
// der Überschuss am äußersten Kreuzungspunkt zwischen Anfangs- und Endstück
// abgeschnitten. Ohne Kreuzung, aber mit Rückweg neben dem Anfang, wird am
// nächsten Punktpaar geschnitten. Sonst bleibt der Zug unverändert.
const LOOP_END_FRAC = 0.3;                    // Anteil der Zuglänge, in dem Anfang und Ende gesucht werden

function closeLoop(pts) {
  if (!pts || pts.length < 8) return pts;
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  const total = cum[n - 1];
  if (total < 0.8) return pts;
  const headMax = total * LOOP_END_FRAC;
  const tailMin = total * (1 - LOOP_END_FRAC);
  let best = null;
  for (let i = 0; i < n - 1 && cum[i] <= headMax; i++) {
    const a1 = pts[i];
    const a2 = pts[i + 1];
    for (let j = n - 2; j > i + 1 && cum[j + 1] >= tailMin; j--) {
      const b1 = pts[j];
      const b2 = pts[j + 1];
      if (!segmentsCross(a1, a2, b1, b2)) continue;
      const span = cum[j] - cum[i];
      if (!best || span > best.span) best = { i, j, span, a1, a2, b1, b2 };
      break;
    }
  }
  if (best) {
    const { a1, a2, b1, b2 } = best;
    const dx = a2.x - a1.x;
    const dy = a2.y - a1.y;
    const ex = b2.x - b1.x;
    const ey = b2.y - b1.y;
    const den = dx * ey - dy * ex;
    const t = Math.abs(den) < 1e-12 ? 0.5 : ((b1.x - a1.x) * ey - (b1.y - a1.y) * ex) / den;
    const x = { x: a1.x + dx * t, y: a1.y + dy * t };
    const out = [x];
    for (let k = best.i + 1; k <= best.j; k++) out.push(pts[k]);
    out.push({ x: x.x, y: x.y });
    return out;
  }
  // Keine Kreuzung: Rückweg innen oder außen neben dem Anfang.
  const tol = tuneCode("close", CIRCLE_CLOSE);
  const endGap = dist(pts[0], pts[n - 1]);
  let pi = 0;
  let pj = n - 1;
  let pd = endGap;
  for (let i = 0; i < n && cum[i] <= headMax; i++) {
    for (let j = n - 1; j > i && cum[j] >= tailMin; j--) {
      const d = dist(pts[i], pts[j]);
      if (d < pd - 1e-9) { pd = d; pi = i; pj = j; }
    }
  }
  if ((pi === 0 && pj === n - 1) || pd > tol || cum[pj] - cum[pi] < total * 0.6) return pts;
  // Nur kürzen, wenn wirklich etwas übersteht (mehr als ein paar Zentimeter).
  if (cum[pi] + (total - cum[pj]) < 0.08) return pts;
  const out = pts.slice(pi, pj + 1).map((p) => ({ x: p.x, y: p.y }));
  out.push({ x: out[0].x, y: out[0].y });
  return out;
}

// Kleinstes umschließendes Rechteck über die Kanten der konvexen Hülle.
function minAreaRect(pts) {
  const hull = ensureCCW(convexHull(pts));
  if (!hull || hull.length < 3) return null;
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const L = dist(a, b);
    if (L < 1e-9) continue;
    const c = (b.x - a.x) / L;
    const s = (b.y - a.y) / L;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * c + p.y * s;
      const v = -p.x * s + p.y * c;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, c, s, minU, maxU, minV, maxV };
  }
  if (!best || best.area < 1e-6) return null;
  const { c, s } = best;
  const uv = (u, v) => ({ x: u * c - v * s, y: u * s + v * c });
  return {
    corners: ensureCCW([uv(best.minU, best.minV), uv(best.maxU, best.minV), uv(best.maxU, best.maxV), uv(best.minU, best.maxV)]),
    area: best.area,
    hullArea: Math.abs(signedArea(hull)),
  };
}

// Kastenform: Ein Kreis oder eine Ellipse füllt ihr kleinstes Rechteck nur zu
// π/4 (78,5 %), ein regelmäßiges Achteck zu 83 %. Ein Quadrat, auch mit
// gerundeten oder abgeschnittenen Ecken, liegt deutlich darüber. Dann ist der
// Zug kein Kreis, sondern ein Rechteck.
const BOX_LOOP_FILL = 0.88;                   // Hülle / kleinstes Rechteck, ab hier eckig
const BOX_LOOP_SOLID = 0.9;                   // Zugfläche / Hülle, sonst Delle (z. B. U-Form)
const BOX_LOOP_EDGE = 0.16;                   // größter Abstand zum Rechteckrand / kurze Seite

function boxyLoop(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 4) return null;
  if (selfIntersects(ring, true)) return null;
  const rect = minAreaRect(ring);
  if (!rect) return null;
  const area = Math.abs(signedArea(ring));
  if (rect.hullArea < 0.05 || area / rect.hullArea < BOX_LOOP_SOLID) return null;
  const fill = rect.hullArea / rect.area;
  if (fill < BOX_LOOP_FILL) return null;
  const w = dist(rect.corners[0], rect.corners[1]);
  const h = dist(rect.corners[1], rect.corners[2]);
  const short = Math.min(w, h);
  if (short < 0.12) return null;
  // Der Zug muss überall nahe am Rechteckrand bleiben. Ein Fels mit einer
  // deutlich abgeschnittenen Ecke bleibt so ein Fünfeck.
  let far = 0;
  for (const p of ring) far = Math.max(far, distToPolyEdges(p.x, p.y, rect.corners));
  if (far > short * BOX_LOOP_EDGE) return null;
  return { corners: rect.corners, fill, far: far / short };
}

function recognizePolygon(pts) {
  if (!pts || pts.length < 3) return null;
  let ring = closedRing(pts);
  if (!ring || ring.length < 3) return null;
  if (dist(ring[0], ring[ring.length - 1]) > 0.02 && isClosedStroke(pts)) {
    ring = ring.map((p) => ({ x: p.x, y: p.y }));
  }
  const area2 = Math.abs(signedArea(ensureCCW(ring)));
  if (area2 < 0.05) return null;
  if (selfIntersects(ring, true)) return null;
  const hull = ensureCCW(convexHull(ring));
  const hArea = Math.abs(signedArea(hull));
  if (hArea < 1e-4 || area2 / hArea < tuneCode("hullFill", 0.7)) return null;
  let corners = cornersFromStroke(ring);
  if (!(corners.length === 3 || corners.length === 4)) return null;
  if (!isConvex(corners)) return null;
  const angs = interiorAngles(corners);
  if (angs.some((a) => a < 22 * Math.PI / 180 || a > 158 * Math.PI / 180)) return null;
  if (!edgesAreStraight(corners, ring)) return null;
  corners = ensureCCW(corners);
  if (corners.length === 3) return { kind: "tri", corners: ensureCCW(snapTriangle(corners)) };
  const quad = regularizeQuad(corners, ring, strokeSnaps());
  return { kind: "quad", quadKind: quad.kind, corners: ensureCCW(quad.corners) };
}
function snapPolygonPose(pts) {
  if (!strokeSnaps() || !pts || pts.length < 3) return pts;
  const c = polygonCentroid(pts);
  if (!c) return pts;
  const g = snapDrawPoint(c);
  const dx = g.x - c.x;
  const dy = g.y - c.y;
  if (Math.hypot(dx, dy) < 1e-6) return pts;
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function regularizeClosed(pts) {
  const rec = recognizePolygon(pts);
  if (rec) return rec.corners;
  const src = ensureCCW(dedupe(pts));
  if (src.length < 3 || Math.abs(signedArea(src)) < 0.04) return src;
  const hull = ensureCCW(convexHull(src));
  if (hull.length < 3) return squareNearRightCorners(src);
  const area = Math.abs(signedArea(src));
  const hArea = Math.abs(signedArea(hull));
  if (hArea < 1e-4 || area / hArea < tuneCode("hullFill", 0.7)) return squareNearRightCorners(src);
  let shape = pruneByTurn(hull, tuneCode("pruneTurn", 25));
  if (shape.length > 4 && shape.length <= 6) {
    const softer = pruneByTurn(shape, tuneCode("pruneSoft", 42));
    if ((softer.length === 4 && anglesNearRight(softer)) || softer.length === 3) shape = softer;
  }
  if (shape.length === 4) {
    const quad = regularizeQuad(shape, src, strokeSnaps());
    return ensureCCW(quad.corners);
  }
  if (shape.length === 3) return ensureCCW(snapTriangle(shape));
  if (shape.length > 4) {
    const box = orientedRect(hull, src);
    if (box && anglesNearRight(box, rightCornerTol() * 1.5)) {
      const bArea = Math.abs(signedArea(box));
      const shortSide = Math.min(dist(box[0], box[1]), dist(box[1], box[2]));
      if (bArea > 1e-4 && hArea / bArea > tuneCode("boxFill", 0.9) && cornerGap(hull, box) < shortSide * tuneCode("boxGap", 0.16)) {
        return ensureCCW(box);
      }
    }
  }
  return squareNearRightCorners(src);
}

function straightenOpen(pts) {
  const clean = pts.map((p) => ({ x: p.x, y: p.y }));
  if (clean.length < 3) return clean;
  const a = clean[0];
  const b = clean[clean.length - 1];
  const len = dist(a, b);
  if (len < 0.12) return clean;
  let maxD = 0;
  for (let i = 1; i < clean.length - 1; i++) {
    maxD = Math.max(maxD, distPointSeg(clean[i].x, clean[i].y, a.x, a.y, b.x, b.y));
  }
  // Hand wobble on a straight stroke stays under this. A deliberate bend is larger.
  if (maxD <= Math.max(0.28, len * 0.08)) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  return clean;
}

// Kreiserkennung. Umrandung wird nach Bogenlänge gleichmäßig abgetastet,
// der Mittelpunkt ist der Flächenschwerpunkt. Hauptkriterium: relative
// Radiusstreuung std(r)/mean(r) unter CIRCLE_MAX_CV. Dazu die Eckenregel,
// damit gleichmäßige Vielecke und Felsbrocken eckig bleiben.
// Mit Geodreieck: Während des Zeichnens gibt es keinen Raster-Snap, die
// Vorschau bleibt der Rohzug. Nach dem Loslassen wird zuerst der Ellipsen-
// bzw. Kreis-Fit auf den Rohpunkten geprüft (Hauptachsen per Kovarianz/PCA).
// Residuum ist die relative Streuung der elliptischen Radien (CV-artig)
// unter ELLIPSE_MAX_CV. Eine Ellipse entsteht erst, wenn die Achsen um mehr
// als (1 - ELLIPSE_CIRCLE_RATIO)*a + ELLIPSE_EXTRA_GAP (eine Rasterweite)
// auseinanderliegen, sonst ein Kreis mit r=(a+b)/2.
// 3- und 4-Ecke werden immer zuerst auf dem Rohzug erkannt (Ecken über
// geschlossenes Douglas-Peucker und Krümmungsspitzen, unabhängig vom
// Startpunkt). Ein erkanntes Viereck behält seine Drehung; mit Geodreieck
// wird es nicht auf das achsenparallele Raster in Treppen zerlegt
// (höchstens der Schwerpunkt rastet, die Kantenrichtungen bleiben).
// Jede erkannte Ecke zwischen 80 und 100 Grad wird exakt 90 Grad, mit und ohne
// Geodreieck. Vier solche Ecken ergeben ein exaktes gedrehtes Rechteck.
// Kreis und Ellipse werden uebersprungen, wenn 3-4 klare Ecken vorliegen.
// Erst wenn keine Ellipse/kein Kreis und kein 3-/4-Eck entsteht, rastet
// eine eckige Form auf das Raster ein. Ohne Geodreieck nur Kreise;
// Felsen und schiefe Dreiecke bleiben unregelmäßig, außer 75–105°-Ecken.
const CIRCLE_MAX_CV = 0.12;                   // std(r)/mean(r), kalibriert an krakeligen Kreisen und 1:2-Ovalen
const CIRCLE_SAMPLES = 64;                    // Abtastpunkte entlang der Umrandung
const CIRCLE_MAX_CORNER = 45 * Math.PI / 180; // rad, scharfe Ecke ohne Geodreieck
const CIRCLE_TURN_WIN = 0.25;                 // Fensterlänge als Vielfaches von r
// Vereinfachen, Kanten-Bauchung und Eckenabstand sind unter SHAPE_TOL_SPAN
// ein Anteil der Zuggröße, darüber die festen Zentimeter. Sonst wird ein
// kleiner Kreis zum Viereck, weil seine Sehne weniger als 16 cm baucht.
const CIRCLE_RIGHT_TOL = 10 * Math.PI / 180;  // Geodreieck: Toleranz für 90°
const RIGHT_CORNER = 15 * Math.PI / 180;      // Ecke 75-105° wird exakt 90°, drehunabhängig
const CIRCLE_MIN_R = 0.16;
const CIRCLE_MAX_R = 4;
const CIRCLE_MIN_PTS = 5;
const CIRCLE_CLOSE = 0.7;                     // Enden dürfen so weit offen sein
const ELLIPSE_MAX_CV = 0.12;                  // Residuum am Ellipsenrand, analog zu CIRCLE_MAX_CV
const ELLIPSE_CIRCLE_RATIO = 0.85;            // Anteil: Ellipse braucht a-b > (1-ratio)*a + ELLIPSE_EXTRA_GAP
const ELLIPSE_EXTRA_GAP = GEO_GRID;           // Zusatzabstand der Radien, 1 Rasterweite (0,5 m)
const ELLIPSE_PHYS_VERTS = 16;                // Physik-Polygon; über maxPolygonVertices wird zerlegt
const QUAD_PARALLEL = 12 * Math.PI / 180;     // gegenüberliegende Seiten gelten als parallel
const QUAD_SYMMETRY = 14 * Math.PI / 180;     // Basiswinkel eines gleichschenkligen Trapezes
const QUAD_MAX_SHIFT = 0.18;                  // max. Eckenverschiebung relativ zur Größe


