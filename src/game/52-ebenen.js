// Ebenen per Nagel und Geist beim Ziehen.
// Ebene 0: Boden, verankerte (statische) und freie Körper. Hängt ein Körper an
// einem Nagel, dessen Wirt in Ebene n liegt, ist er Ebene n+1 und wird davor
// gezeichnet. Direkt über einen Nagel verbundene Körper stoßen nie zusammen
// (Nagel-Joints haben collideConnected: false, der pre-solve-Filter
// `layerContactOff` sichert das zusätzlich ab). Seile zählen nicht als
// Nagelverbindung: Sehne und Perlen kollidieren weiter wie bisher.
// Ein Körper an der Maus stößt mit nichts zusammen. Überlappt er etwas, mit dem
// er nach dem Loslassen zusammenstoßen würde, ist er ein Geist: halb
// durchsichtig, und an der letzten freien Pose steht ein blasser Schatten.
// Loslassen als Geist springt dorthin zurück (Tempo 0).
const GHOST_ALPHA = 0.42;
const GHOST_SHADOW_ALPHA = 0.2;
const GHOST_BISECT = 10;
const GHOST_CIRCLE_TOL = 0.01; // m, Kreise dürfen so weit eintauchen (Ruhekontakt)
const LAYER_MAX = 24;

function nailJointOther(pin, j) {
  if (!pin || !j) return null;
  const a = j.getBodyA();
  const b = j.getBodyB();
  if (a === pin.body) return b;
  if (b === pin.body) return a;
  return null;
}

// Zwei Körper direkt über einen Nagel verbunden (Wirt und angehefteter Körper).
function nailLinked(a, b) {
  if (!a || !b || a === b) return false;
  for (const pin of pins) {
    if (pin.body !== a && pin.body !== b) continue;
    const other = pin.body === a ? b : a;
    for (const j of pin.joints) {
      if (nailJointOther(pin, j) === other) return true;
    }
  }
  return false;
}

function dragGhostBody(body) {
  return !!(playDrag && playDrag.body === body && playDrag.noCollide);
}

// Kontaktfilter für pre-solve (und begin-contact).
function layerContactOff(contact) {
  const a = contact.getFixtureA().getBody();
  const b = contact.getFixtureB().getBody();
  if (dragGhostBody(a) || dragGhostBody(b)) return true;
  return nailLinked(a, b);
}

// Ebene je Körper aus den Nagel-Joints (Seilperlen erben die Ebene ihres Nagelwirts + 1).
function bodyLayers() {
  const layer = new Map();
  const edges = [];
  for (const pin of pins) {
    for (const j of pin.joints) {
      const other = nailJointOther(pin, j);
      if (other && other !== pin.body) edges.push([pin.body, other]);
    }
  }
  for (let pass = 0; pass < LAYER_MAX; pass++) {
    let changed = false;
    for (const [host, child] of edges) {
      if (!child.isDynamic()) continue;
      const l = Math.min(LAYER_MAX, (layer.get(host) || 0) + 1);
      if (l > (layer.get(child) || 0)) {
        layer.set(child, l);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

function drawLayer(draw, layers) {
  if (!draw) return 0;
  if (draw.kind === "rope" && draw.bodies && draw.bodies.length) {
    let l = 0;
    for (const b of draw.bodies) l = Math.max(l, layers.get(b) || 0);
    return l;
  }
  return draw.body ? layers.get(draw.body) || 0 : 0;
}

// Zeichenreihenfolge: nach Ebene, innerhalb einer Ebene wie bisher.
function drawingsByLayer() {
  const layers = bodyLayers();
  return drawings
    .map((d, i) => ({ d, i, l: drawLayer(d, layers) }))
    .sort((p, q) => p.l - q.l || p.i - q.i)
    .map((p) => p.d);
}

function poseOfBody(body) {
  const p = body.getPosition();
  return { x: p.x, y: p.y, a: body.getAngle() };
}

function proxyFor(shape, index) {
  const proxy = new planck.DistanceProxy();
  proxy.set(shape, index);
  // Kerngeometrie: Polygone und Kanten ohne Hautradius, Kreise leicht kleiner.
  if (shape.m_type === "circle") proxy.m_radius = Math.max(0, shape.m_radius - GHOST_CIRCLE_TOL);
  else proxy.m_radius = 0;
  return proxy;
}

function childCount(shape) {
  return shape.getChildCount ? shape.getChildCount() : 1;
}

// Würde `body` an der Pose `pose` etwas überlappen, mit dem er nach dem
// Loslassen zusammenstößt? `skip` enthält Körper, an die er sich heften würde.
function overlapAtPose(body, pose, skip) {
  if (!world || !body) return null;
  const xf = planck.Transform(V(pose.x, pose.y), pose.a);
  let lx = Infinity, ly = Infinity, ux = -Infinity, uy = -Infinity;
  const mine = [];
  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    if (f.isSensor()) continue;
    const shape = f.getShape();
    for (let c = 0; c < childCount(shape); c++) {
      const aabb = new planck.AABB();
      shape.computeAABB(aabb, xf, c);
      lx = Math.min(lx, aabb.lowerBound.x); ly = Math.min(ly, aabb.lowerBound.y);
      ux = Math.max(ux, aabb.upperBound.x); uy = Math.max(uy, aabb.upperBound.y);
      mine.push({ f, proxy: proxyFor(shape, c) });
    }
  }
  if (!mine.length) return null;
  const found = [];
  world.queryAABB(planck.AABB(V(lx, ly), V(ux, uy)), (fixture) => {
    found.push(fixture);
    return true;
  });
  for (const fb of found) {
    const other = fb.getBody();
    if (other === body || fb.isSensor()) continue;
    if (skip && skip.has(other)) continue;
    const meta = bodyMeta.get(other);
    if (meta && (meta.kind === "star" || meta.kind === "rope")) continue;
    if (!body.shouldCollide(other) || nailLinked(body, other)) continue;
    const shape = fb.getShape();
    const xfb = other.getTransform();
    for (let c = 0; c < childCount(shape); c++) {
      const pb = proxyFor(shape, c);
      for (const m of mine) {
        if (!m.f.shouldCollide(fb)) continue;
        const input = new planck.DistanceInput();
        input.proxyA = m.proxy;
        input.proxyB = pb;
        input.transformA = xf;
        input.transformB = xfb;
        input.useRadii = true;
        const out = new planck.DistanceOutput();
        planck.Distance(out, new planck.SimplexCache(), input);
        if (out.distance <= 1e-6) return other;
      }
    }
  }
  return null;
}

// Nägel, an die sich der Körper beim Loslassen heften würde (wie attachExistingPins).
function dragPinTargets(body) {
  const meta = bodyMeta.get(body);
  if (!meta || body === ball) return [];
  const out = [];
  for (const pin of pins) {
    if (pin.body === body || pinHoldsBody(pin, body)) continue;
    const wp = pin.body.getWorldPoint(V(pin.local.x, pin.local.y));
    if (containsMeta(meta, wp.x, wp.y)) out.push(pin);
  }
  return out;
}

function lerpPose(p, q, t) {
  let da = q.a - p.a;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, a: p.a + da * t };
}

// Nach jedem Physikschritt: Geist-Zustand und letzte freie Pose nachführen.
function updateDragGhost() {
  if (!playDrag || !playDrag.body || !playDrag.noCollide) return;
  const body = playDrag.body;
  const now = poseOfBody(body);
  const targets = dragPinTargets(body);
  const hosts = new Set(targets.map((p) => p.body));
  const hit = overlapAtPose(body, now, hosts);
  playDrag.targets = hit ? [] : targets;
  playDrag.ghost = !!hit;
  if (!overlapAtPose(body, now, null)) {
    playDrag.free = now;
    playDrag.wasFree = true;
    return;
  }
  // Gerade erst hineingeraten: letzte freie Pose bis an die Berührung heranschieben.
  if (playDrag.wasFree && playDrag.free) {
    let lo = 0;
    let hi = 1;
    const from = playDrag.free;
    for (let i = 0; i < GHOST_BISECT; i++) {
      const t = (lo + hi) / 2;
      if (overlapAtPose(body, lerpPose(from, now, t), null)) hi = t;
      else lo = t;
    }
    playDrag.free = lerpPose(from, now, lo);
  }
  playDrag.wasFree = false;
}

// Geist losgelassen: zurück an die letzte freie Pose, ohne Tempo.
function restoreDragFree(drag) {
  if (!drag || !drag.body || !drag.free || !world) return false;
  const body = drag.body;
  body.setTransform(V(drag.free.x, drag.free.y), drag.free.a);
  body.setLinearVelocity(V(0, 0));
  body.setAngularVelocity(0);
  body.setAwake(true);
  return true;
}
