function closedRing(pts) {
  if (!pts || pts.length < 2) return pts;
  if (dist(pts[0], pts[pts.length - 1]) <= 0.02) return pts.slice(0, -1);
  return pts;
}

function ringLen(pts) {
  let len = 0;
  for (let i = 0; i < pts.length; i++) len += dist(pts[i], pts[(i + 1) % pts.length]);
  return len;
}

function pointAlongRing(pts, s) {
  const n = pts.length;
  const segs = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const L = dist(pts[i], pts[(i + 1) % n]);
    segs.push(L);
    total += L;
  }
  if (total < 1e-9) return { x: pts[0].x, y: pts[0].y };
  s = ((s % total) + total) % total;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const L = segs[i];
    if (acc + L >= s - 1e-12) {
      const t = L < 1e-12 ? 0 : (s - acc) / L;
      const a = pts[i];
      const b = pts[(i + 1) % n];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += L;
  }
  return { x: pts[0].x, y: pts[0].y };
}

function headingOf(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function maxNetTurn(pts, windowLen) {
  const total = ringLen(pts);
  const W = Math.min(windowLen, total / 4);
  if (W < 1e-6) return 0;
  const samples = Math.max(24, pts.length * 2);
  let best = 0;
  for (let k = 0; k < samples; k++) {
    const s = total * k / samples;
    const p = pointAlongRing(pts, s);
    const pb = pointAlongRing(pts, s - W);
    const pf = pointAlongRing(pts, s + W);
    best = Math.max(best, Math.abs(angleDelta(headingOf(pb, p), headingOf(p, pf))));
  }
  return best;
}

function resampleRing(pts, n) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 2) return null;
  const total = ringLen(ring);
  if (total < 1e-9) return null;
  const out = [];
  const count = Math.max(3, n | 0);
  for (let i = 0; i < count; i++) out.push(pointAlongRing(ring, total * i / count));
  return out;
}

function polygonCentroid(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return null;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const cr = p.x * q.y - q.x * p.y;
    area += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) { sx += p.x; sy += p.y; }
    return { x: sx / ring.length, y: sy / ring.length };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function circleFromPoints(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return null;
  const samples = resampleRing(ring, tuneCode("samples", CIRCLE_SAMPLES));
  if (!samples) return null;
  const c = polygonCentroid(ring);
  if (!c) return null;
  const rs = samples.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  let mean = 0;
  for (const r of rs) mean += r;
  mean /= rs.length;
  if (mean < tuneCode("minR", CIRCLE_MIN_R) || mean > tuneCode("maxR", CIRCLE_MAX_R)) return null;
  let acc = 0;
  for (const r of rs) acc += (r - mean) * (r - mean);
  const cv = Math.sqrt(acc / rs.length) / mean;
  return { x: c.x, y: c.y, r: mean, cv };
}

function hasRightAngle(pts, tol) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return false;
  const limit = tol == null ? tuneCode("rightTol", CIRCLE_RIGHT_TOL) : tol;
  const angs = interiorAngles(ring);
  for (const a of angs) {
    if (Math.abs(a - Math.PI / 2) <= limit || Math.abs(a - Math.PI * 3 / 2) <= limit) return true;
  }
  return false;
}

function circleFit(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < tuneCode("minPts", CIRCLE_MIN_PTS)) return null;
  const fit = circleFromPoints(ring);
  if (!fit) return null;
  if (fit.cv >= tuneCode("maxCv", CIRCLE_MAX_CV)) return null;
  if (maxNetTurn(ring, fit.r * tuneCode("turnWin", CIRCLE_TURN_WIN)) > tuneCode("maxCorner", CIRCLE_MAX_CORNER)) return null;
  return fit;
}

function ellipseFromPoints(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return null;
  const samples = resampleRing(ring, tuneCode("samples", CIRCLE_SAMPLES));
  if (!samples) return null;
  const c = polygonCentroid(ring);
  if (!c) return null;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of samples) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const n = samples.length;
  sxx /= n;
  syy /= n;
  sxy /= n;
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const uv = [];
  let maxU = 0;
  let maxV = 0;
  for (const p of samples) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const u = dx * ca + dy * sa;
    const v = -dx * sa + dy * ca;
    uv.push({ u, v });
    if (Math.abs(u) > maxU) maxU = Math.abs(u);
    if (Math.abs(v) > maxV) maxV = Math.abs(v);
  }
  if (maxU < 1e-6 || maxV < 1e-6) return null;
  let a = maxU;
  let b = maxV;
  let mean = 0;
  for (const p of uv) mean += Math.sqrt((p.u * p.u) / (a * a) + (p.v * p.v) / (b * b));
  mean /= uv.length;
  if (mean < 1e-6) return null;
  a *= mean;
  b *= mean;
  let acc = 0;
  mean = 0;
  for (const p of uv) mean += Math.sqrt((p.u * p.u) / (a * a) + (p.v * p.v) / (b * b));
  mean /= uv.length;
  if (mean < 1e-6) return null;
  for (const p of uv) {
    const rho = Math.sqrt((p.u * p.u) / (a * a) + (p.v * p.v) / (b * b));
    acc += (rho - mean) * (rho - mean);
  }
  const cv = Math.sqrt(acc / uv.length) / mean;
  let angle = ang;
  if (b > a) {
    const tmp = a;
    a = b;
    b = tmp;
    angle += Math.PI / 2;
  }
  while (angle > Math.PI / 2) angle -= Math.PI;
  while (angle <= -Math.PI / 2) angle += Math.PI;
  if (a < tuneCode("minR", CIRCLE_MIN_R) || a > tuneCode("maxR", CIRCLE_MAX_R) * 1.5) return null;
  if (b < tuneCode("minR", CIRCLE_MIN_R) * 0.6) return null;
  return { kind: "ellipse", x: c.x, y: c.y, a, b, angle, cv, r: 0.5 * (a + b) };
}

function ellipseAxesAreRound(a, b) {
  const ratio = tuneCode("ellCircleRatio", ELLIPSE_CIRCLE_RATIO);
  const extra = tuneCode("ellExtraGap", ELLIPSE_EXTRA_GAP);
  return !(a - b > (1 - ratio) * a + extra);
}

function tryMakeCircle(pts) {
  if (strokeSnaps()) {
    const ring = closedRing(pts);
    if (!ring || ring.length < tuneCode("minPts", CIRCLE_MIN_PTS) || Math.abs(signedArea(ring)) < 0.05) return null;
    const ell = ellipseFromPoints(ring);
    if (!ell || ell.cv >= tuneCode("ellMaxCv", ELLIPSE_MAX_CV)) return null;
    if (ellipseAxesAreRound(ell.a, ell.b)) {
      return { kind: "circle", x: ell.x, y: ell.y, r: 0.5 * (ell.a + ell.b), cv: ell.cv };
    }
    return ell;
  }
  return circleFit(pts);
}

function tidyTerrain(rawPts) {
  let pts = dedupe(simplify(rawPts, tuneCode("simplify", 0.045)));
  if (pts.length < 2) return pts;
  if (!isClosedStroke(pts)) return straightenOpen(pts);
  const ring = dedupe(pts.slice(0, -1));
  if (ring.length >= 3 && !selfIntersects(ring, true) && Math.abs(signedArea(ring)) >= 0.05) {
    const neat = regularizeClosed(ring);
    return neat.concat([{ x: neat[0].x, y: neat[0].y }]);
  }
  return pts;
}

