function V(x, y) { return planck.Vec2(x, y); }

function clearWorld() {
  endDrag();
  world = null;
  ground = null;
  ball = null;
  stars = [];
  pins = [];
  rockets = [];
  drawings = [];
  scenery = [];
  geometry = [];
  bodyMeta = new Map();
  contactQ = [];
  ropeCutQ = [];
  won = false;
  medals = { elegant: false, oldschool: false };
  stats = { shapes: 0, nudges: 0, userPins: 0, ropes: 0, drewUnder: false, dragTrick: false };
  simTime = 0;
  confetti = [];
  dragFresh = new Map();
  anchors = [];
}

function track(body, meta) {
  meta.body = body;
  bodyMeta.set(body, meta);
  return meta;
}

// Fixtures dünner als das rechnen sich schlecht: zwei Kontaktpunkte liegen
// dicht beieinander und Normalen kippen. Solche Stücke werden verworfen.
const MIN_FIX_H = 0.06;

function polyMinWidth(pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) return 0;
    let far = 0;
    for (const c of pts) {
      far = Math.max(far, Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / len);
    }
    best = Math.min(best, far);
  }
  return best;
}

// planck.Polygon macht aus entarteten Punkten still eine 2-m-Kiste (_setAsBox(1,1)).
// Für Spielerformen wird so ein Ersatz abgelehnt statt eingebaut.
function makePolygonFixture(body, pts, opt) {
  let shape;
  try {
    shape = new planck.Polygon(pts.map((p) => V(p.x, p.y)));
  } catch (err) {
    return false;
  }
  if (!shape.m_vertices || shape.m_count !== pts.length) return false;
  for (let i = 0; i < shape.m_count; i++) {
    const v = shape.m_vertices[i];
    if (!pts.some((p) => Math.abs(p.x - v.x) < 1e-6 && Math.abs(p.y - v.y) < 1e-6)) return false;
  }
  try {
    body.createFixture(shape, opt);
    return true;
  } catch (err) {
    return false;
  }
}

function addTriFixture(body, tri, opt) {
  const area = Math.abs(signedArea(tri));
  if (area < 0.0015) return false;
  const verts = signedArea(tri) < 0 ? tri.slice().reverse() : tri.slice();
  const e1 = Math.hypot(tri[0].x - tri[1].x, tri[0].y - tri[1].y);
  const e2 = Math.hypot(tri[1].x - tri[2].x, tri[1].y - tri[2].y);
  const e3 = Math.hypot(tri[2].x - tri[0].x, tri[2].y - tri[0].y);
  if (Math.min(e1, e2, e3) < 0.03) return false;
  if (polyMinWidth(tri) < MIN_FIX_H) return false;
  return makePolygonFixture(body, verts, opt);
}

// Legt kurze Kanten zusammen, bevor die Form in Dreiecke zerlegt wird.
// Entfernt wird jeweils die Ecke, deren Wegfall die Fläche am wenigsten ändert.
function mergeShortEdges(pts, minLen) {
  const out = pts.map((p) => ({ x: p.x, y: p.y }));
  while (out.length > 3) {
    let shortest = -1;
    let shortLen = minLen;
    for (let i = 0; i < out.length; i++) {
      const d = dist(out[i], out[(i + 1) % out.length]);
      if (d < shortLen) { shortLen = d; shortest = i; }
    }
    if (shortest < 0) break;
    const n = out.length;
    const cost = (k) => {
      const a = out[(k + n - 1) % n];
      const b = out[k];
      const c = out[(k + 1) % n];
      return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    };
    const j = (shortest + 1) % n;
    out.splice(cost(shortest) <= cost(j) ? shortest : j, 1);
  }
  return out;
}

function fixtureOpt(extra) {
  return Object.assign({
    density: 1,
    friction: 0.6,
    restitution: 0,
    filterGroupIndex: 0,
  }, extra || {});
}

function addConvexFixture(body, pts, opt) {
  const maxV = (planck.Settings && planck.Settings.maxPolygonVertices) || 8;
  if (pts.length < 3 || pts.length > maxV || !isConvex(pts)) return false;
  if (Math.abs(signedArea(pts)) < 0.04) return false;
  if (polyMinWidth(pts) < MIN_FIX_H) return false;
  return makePolygonFixture(body, pts, opt);
}

function mountOutline(body, worldPts, closed, color, width) {
  const o = body.getPosition();
  const local = worldPts.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
  return {
    local,
    closed,
    color,
    width: width || (closed ? 0.14 : THICK),
    fixed: false,
  };
}

function containsMeta(meta, x, y) {
  if (!meta.body) return false;
  const lp = meta.body.getLocalPoint(V(x, y));
  const px = lp.x;
  const py = lp.y;
  if (meta.outline && meta.outline.closed) {
    if (distToPoly(px, py, meta.outline.local) <= 0.2) return true;
  }
  if (meta.outline && !meta.outline.closed) {
    if (distToWire(px, py, meta.outline.local) <= (meta.thick || THICK) * 0.5 + 0.18) return true;
  }
  if (meta.circles) {
    for (const c of meta.circles) {
      if (Math.hypot(px - c.x, py - c.y) <= c.r + 0.16) return true;
    }
  }
  return false;
}

function hostAt(x, y) {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (!d.body || d.kind === "rope") continue;
    if (d.meta && containsMeta(d.meta, x, y)) return d.body;
  }
  for (let i = geometry.length - 1; i >= 0; i--) {
    const g = geometry[i];
    if (g.closed) {
      // The center of a tiny loop sits just above the surface it is drawn on.
      if (distToPoly(x, y, g.pts) <= 0.48) return ground;
    } else if (distToWire(x, y, g.pts) <= 0.24) return ground;
  }
  for (const r of rockets) {
    if (r.body && containsMeta(r.meta, x, y)) return r.body;
  }
  return null;
}

function rememberPin(x, y, body, userMade) {
  const local = body.getLocalPoint(V(x, y));
  const pin = {
    x, y,
    local: { x: local.x, y: local.y },
    body,
    userMade: !!userMade,
    joints: [],
    motor: 0,
    isMotor: false, // per Kringel zum Motornagel gemacht (Klick schaltet dann)
  };
  pins.push(pin);
  return pin;
}

function pinHoldsBody(pin, body) {
  if (!pin || !body) return false;
  if (pin.body === body) return true;
  return pin.joints.some((j) => j && (j.getBodyA() === body || j.getBodyB() === body));
}

function attachExistingPins(body, meta, except) {
  let n = 0;
  for (const pin of pins) {
    if (pin.body === body) continue;
    if (except && except.has(pin.body)) continue;
    if (pinHoldsBody(pin, body)) continue;
    const wp = pin.body.getWorldPoint(V(pin.local.x, pin.local.y));
    if (!containsMeta(meta, wp.x, wp.y)) continue;
    const joint = world.createJoint(new planck.RevoluteJoint({
      bodyA: pin.body,
      bodyB: body,
      localAnchorA: V(pin.local.x, pin.local.y),
      localAnchorB: body.getLocalPoint(V(wp.x, wp.y)),
      collideConnected: false,
    }));
    pin.joints.push(joint);
    applyNailMotor(pin);
    n++;
  }
  return n;
}

function spawnSolid(pts, opt) {
  const clean = ensureCCW(dedupe(pts));
  if (clean.length < 3 || Math.abs(signedArea(clean)) < 0.04) return null;
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < clean.length; i++) {
    const p = clean[i];
    const q = clean[(i + 1) % clean.length];
    const cr = p.x * q.y - q.x * p.y;
    a += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-4) return null;
  cx /= (6 * a);
  cy /= (6 * a);
  const body = world.createDynamicBody({
    position: V(cx, cy),
    linearDamping: 0.12,
    angularDamping: 0.35,
  });
  const local = clean.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const fopt = fixtureOpt({ density: opt.density || 1.5, friction: 0.72, restitution: 0 });
  let made = addConvexFixture(body, local, fopt) ? 1 : 0;
  if (!made) {
    const merged = ensureCCW(mergeShortEdges(local, MIN_FIX_H));
    let tris = triangulate(merged);
    if (!tris.length) {
      const hull = convexHull(merged);
      tris = [];
      for (let i = 1; i < hull.length - 1; i++) tris.push([hull[0], hull[i], hull[i + 1]]);
    }
    for (const tri of tris) made += addTriFixture(body, tri, fopt) ? 1 : 0;
  }
  if (!made) {
    world.destroyBody(body);
    return null;
  }
  const meta = track(body, {
    kind: "draw",
    thick: THICK,
    outline: { local, closed: true, color: MAT.wood, width: 0.13, fixed: false },
  });
  if (opt && opt.quadKind) meta.quadKind = opt.quadKind;
  const draw = { kind: "solid", body, meta, color: MAT.wood };
  drawings.push(draw);
  attachExistingPins(body, meta);
  noteShape(clean);
  return draw;
}

function pointerPressure(ev) {
  if (!ev || ev.pointerType !== "pen") return null;
  if (typeof ev.pressure !== "number" || !isFinite(ev.pressure)) return 0.5;
  return Math.max(0, Math.min(1, ev.pressure));
}

function thickFromPressure(pressure) {
  const lo = tuneCode("penThickMin", PEN_PRESS_MIN);
  const hi = tuneCode("penThickMax", PEN_PRESS_MAX);
  const p = Math.max(0, Math.min(1, pressure));
  return THICK * (lo + p * (hi - lo));
}

function inkPoint(x, y, ev) {
  const pt = { x, y };
  const raw = pointerPressure(ev);
  if (raw == null) return pt;
  const prev = pointer && pointer.penP;
  const smooth = prev == null ? raw : prev * 0.65 + raw * 0.35;
  if (pointer) pointer.penP = smooth;
  pt.thick = thickFromPressure(smooth);
  return pt;
}

function strokeThickness(pts) {
  const thicks = (pts || []).map((p) => p.thick).filter((t) => t > 0).sort((a, b) => a - b);
  if (!thicks.length) return THICK;
  const mid = thicks.length >> 1;
  const med = thicks.length % 2 ? thicks[mid] : 0.5 * (thicks[mid - 1] + thicks[mid]);
  const lo = THICK * tuneCode("penThickMin", PEN_PRESS_MIN);
  const hi = THICK * tuneCode("penThickMax", PEN_PRESS_MAX);
  return Math.max(lo, Math.min(hi, med));
}

function spawnWire(pts, opt) {
  const clean = dedupe(pts);
  if (clean.length < 2) return null;
  const thick = opt && opt.thick > 0 ? opt.thick : THICK;
  const half = thick / 2;
  let ox = 0;
  let oy = 0;
  for (const p of clean) { ox += p.x; oy += p.y; }
  ox /= clean.length;
  oy /= clean.length;
  const body = world.createDynamicBody({
    position: V(ox, oy),
    linearDamping: 0.08,
    angularDamping: 0.25,
  });
  const fopt = fixtureOpt({ density: opt.density || 2.1, friction: 0.62, restitution: 0 });
  let made = 0;
  for (const p of clean) {
    body.createFixture(new planck.Circle(V(p.x - ox, p.y - oy), half), fopt);
    made++;
  }
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.05) continue;
    const localCenter = V((a.x + b.x) / 2 - ox, (a.y + b.y) / 2 - oy);
    const shape = new planck.Box(len / 2, half, localCenter, Math.atan2(b.y - a.y, b.x - a.x));
    body.createFixture(shape, fopt);
    made++;
  }
  if (!made) {
    world.destroyBody(body);
    return null;
  }
  const local = clean.map((p) => ({ x: p.x - ox, y: p.y - oy }));
  const meta = track(body, {
    kind: "draw",
    thick,
    outline: { local, closed: false, color: MAT.wire, width: thick, fixed: false },
  });
  const draw = { kind: "wire", body, meta, color: MAT.wire };
  drawings.push(draw);
  attachExistingPins(body, meta);
  noteShape(clean);
  return draw;
}

function spawnBlob(x, y, r) {
  const body = world.createDynamicBody({
    position: V(x, y),
    linearDamping: 0.04,
    angularDamping: 0.04,
  });
  body.createFixture(new planck.Circle(r), fixtureOpt({ density: 3.2, friction: 0.16, restitution: 0 }));
  const meta = track(body, {
    kind: "draw",
    round: true,
    circles: [{ x: 0, y: 0, r }],
    outline: null,
  });
  const draw = { kind: "blob", body, meta, color: MAT.steel, x, y, r };
  drawings.push(draw);
  noteShape([{ x, y: y - r }, { x, y }]);
  return draw;
}

function ellipseLocalPoly(a, b, angle, n) {
  const pts = [];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const count = Math.max(8, n | 0);
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const u = a * Math.cos(t);
    const v = b * Math.sin(t);
    pts.push({ x: u * ca - v * sa, y: u * sa + v * ca });
  }
  return ensureCCW(pts);
}

function spawnEllipse(x, y, a, b, angle) {
  const body = world.createDynamicBody({
    position: V(x, y),
    linearDamping: 0.04,
    angularDamping: 0.08,
    bullet: true,
  });
  const fopt = fixtureOpt({ density: 3.2, friction: 0.16, restitution: 0 });
  const local = ellipseLocalPoly(a, b, angle, tuneCode("ellVerts", ELLIPSE_PHYS_VERTS));
  let made = addConvexFixture(body, local, fopt) ? 1 : 0;
  if (!made) {
    const merged = ensureCCW(mergeShortEdges(local, MIN_FIX_H));
    let tris = triangulate(merged);
    if (!tris.length) {
      const hull = convexHull(merged);
      tris = [];
      for (let i = 1; i < hull.length - 1; i++) tris.push([hull[0], hull[i], hull[i + 1]]);
    }
    for (const tri of tris) made += addTriFixture(body, tri, fopt) ? 1 : 0;
  }
  if (!made) {
    world.destroyBody(body);
    return null;
  }
  const meta = track(body, {
    kind: "ellipse",
    round: true,
    ellipse: { a, b, angle },
    outline: { local, closed: true, color: MAT.steel, width: 0.13, fixed: false },
  });
  const draw = { kind: "ellipse", body, meta, color: MAT.steel, x, y, a, b, angle };
  drawings.push(draw);
  attachExistingPins(body, meta);
  noteShape([{ x: x - a, y }, { x, y: y - b }, { x: x + a, y }]);
  return draw;
}

function spawnRoller(x, y, r) {
  const body = world.createDynamicBody({
    position: V(x, y),
    linearDamping: 0.015,
    angularDamping: 0.02,
    bullet: true,
  });
  body.createFixture(new planck.Circle(r), fixtureOpt({ density: 3.2, friction: 0.16, restitution: 0 }));
  const meta = track(body, {
    kind: "roller",
    round: true,
    circles: [{ x: 0, y: 0, r }],
    outline: null,
  });
  const draw = { kind: "roller", body, meta, color: MAT.steel, x, y, r };
  drawings.push(draw);
  attachExistingPins(body, meta);
  noteShape([{ x: x - r, y }, { x, y: y - r }, { x: x + r, y }]);
  return draw;
}

