function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* private mode */ }
}

function progress() { return loadJSON("crayon-progress", { cleared: {} }); }

function starCount() {
  const cleared = progress().cleared;
  return ORDER.filter((id) => cleared[id]).length;
}

function customs() { return loadJSON("crayon-customs", {}); }

function hash(i, s) {
  const n = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pointInPoly(x, y, polyPts) {
  let inside = false;
  for (let i = 0, j = polyPts.length - 1; i < polyPts.length; j = i++) {
    const pi = polyPts[i];
    const pj = polyPts[j];
    const hit = ((pi.y > y) !== (pj.y > y)) &&
      (x < (pj.x - pi.x) * (y - pi.y) / ((pj.y - pi.y) || 1e-9) + pi.x);
    if (hit) inside = !inside;
  }
  return inside;
}

function distPointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToPoly(x, y, polyPts) {
  if (pointInPoly(x, y, polyPts)) return 0;
  let best = Infinity;
  for (let i = 0; i < polyPts.length; i++) {
    const a = polyPts[i];
    const b = polyPts[(i + 1) % polyPts.length];
    best = Math.min(best, distPointSeg(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

function distToWire(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distPointSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
  }
  return best;
}

function pointInTri(p, a, b, c) {
  const s1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const s2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
  const s3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
  const hasNeg = s1 < -1e-8 || s2 < -1e-8 || s3 < -1e-8;
  const hasPos = s1 > 1e-8 || s2 > 1e-8 || s3 > 1e-8;
  return !(hasNeg && hasPos);
}

function ensureCCW(pts) {
  const copy = pts.map((p) => ({ x: p.x, y: p.y }));
  if (signedArea(copy) < 0) copy.reverse();
  return copy;
}

function simplify(points, epsilon) {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distPointSeg(points[i].x, points[i].y, points[a].x, points[a].y, points[b].x, points[b].y);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push({ x: points[i].x, y: points[i].y });
  return out;
}

function simplifyClosed(points, epsilon) {
  const ring = (closedRing(points) || points).map((p) => ({ x: p.x, y: p.y }));
  if (ring.length < 3) return ring;
  let ia = 0;
  let ib = 1;
  let best = -1;
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const d = dist(ring[i], ring[j]);
      if (d > best) {
        best = d;
        ia = i;
        ib = j;
      }
    }
  }
  const keep = new Array(ring.length).fill(false);
  keep[ia] = true;
  keep[ib] = true;
  const walk = (a, b) => {
    const n = ring.length;
    let maxD = 0;
    let idx = -1;
    for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) {
      const d = distPointSeg(ring[i].x, ring[i].y, ring[a].x, ring[a].y, ring[b].x, ring[b].y);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = true;
      walk(a, idx);
      walk(idx, b);
    }
  };
  walk(ia, ib);
  walk(ib, ia);
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  return out;
}

function selfIntersects(pts, closed) {
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < last; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (closed && i === 0 && j === last - 1) continue;
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];
      if (segmentsCross(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsCross(a, b, c, d) {
  function side(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }
  const s1 = side(a, b, c);
  const s2 = side(a, b, d);
  const s3 = side(c, d, a);
  const s4 = side(c, d, b);
  return s1 * s2 < 0 && s3 * s4 < 0;
}

function isClosedStroke(pts) {
  if (pts.length < 4) return false;
  const span = dist(pts[0], pts[pts.length - 1]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return span < tuneCode("close", CIRCLE_CLOSE) || (len > 0.8 && span < len * tuneCode("closeFrac", 0.22));
}

function triangulate(pts) {
  const v = pts.map((p) => ({ x: p.x, y: p.y }));
  const tris = [];
  let guard = 0;
  while (v.length > 3 && guard++ < 800) {
    let clipped = false;
    for (let i = 0; i < v.length; i++) {
      const a = v[(i + v.length - 1) % v.length];
      const b = v[i];
      const c = v[(i + 1) % v.length];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 1e-7) continue;
      let ear = true;
      for (let j = 0; j < v.length; j++) {
        if (j === i || v[j] === a || v[j] === c) continue;
        if (pointInTri(v[j], a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      tris.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: c.x, y: c.y }]);
      v.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return [];
  }
  if (v.length === 3) tris.push(v.map((p) => ({ x: p.x, y: p.y })));
  return tris;
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function turnAngle(a, b, c) {
  const ix = b.x - a.x;
  const iy = b.y - a.y;
  const ox = c.x - b.x;
  const oy = c.y - b.y;
  return Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy);
}

function armAngle(prev, cur, next) {
  const v1x = prev.x - cur.x;
  const v1y = prev.y - cur.y;
  const v2x = next.x - cur.x;
  const v2y = next.y - cur.y;
  return Math.atan2(Math.abs(v1x * v2y - v1y * v2x), v1x * v2x + v1y * v2y);
}

function isConvex(pts) {
  if (pts.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-8) continue;
    const s = cr > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

function pruneByTurn(pts, maxDeg) {
  const limit = maxDeg * Math.PI / 180;
  const cur = pts.map((p) => ({ x: p.x, y: p.y }));
  let guard = 0;
  while (cur.length > 3 && guard++ < 48) {
    let bestI = -1;
    let best = Infinity;
    for (let i = 0; i < cur.length; i++) {
      const turn = Math.abs(turnAngle(cur[(i + cur.length - 1) % cur.length], cur[i], cur[(i + 1) % cur.length]));
      if (turn < best) {
        best = turn;
        bestI = i;
      }
    }
    if (bestI < 0 || best >= limit) break;
    cur.splice(bestI, 1);
  }
  return cur;
}

function interiorAngles(pts) {
  const ccw = ensureCCW(pts);
  const out = [];
  for (let i = 0; i < ccw.length; i++) {
    const turn = turnAngle(ccw[(i + ccw.length - 1) % ccw.length], ccw[i], ccw[(i + 1) % ccw.length]);
    out.push(Math.PI - turn);
  }
  return out;
}

