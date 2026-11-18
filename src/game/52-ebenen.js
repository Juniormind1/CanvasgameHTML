// Ebenen per Nagel und Geist beim Ziehen.
// Ebene 0: Boden, verankerte (statische) und freie Körper. Hängt ein Körper an
// einem Nagel, dessen Wirt in Ebene n liegt, ist er Ebene n+1 und wird davor
// gezeichnet. Direkt über einen Nagel verbundene Körper stoßen nie zusammen
// (Nagel-Joints haben collideConnected: false, der pre-solve-Filter
// `layerContactOff` sichert das zusätzlich ab). Ein Seil an einem Nagel oder
// Motor liegt eine Ebene davor und stößt nicht mit dem Nagelwirt zusammen
// (`ropeOwnEndContact`). Die beiden Wirte stoßen weiter gegeneinander.
// Überdeckt die fertige Form beim Zeichnen ein vorhandenes Seil, entsteht der
// Körper hinter genau diesem Seil (`behindRopeIds`): er wird dahinter
// gezeichnet und stößt nicht mit ihm zusammen. Neben dem Seil gezeichnet,
// bleibt er auf derselben Stoßebene und wird vom Seil gefangen.
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

// Am Griff stößt der gezogene Körper (bzw. seine ganze freie Nagelgruppe) mit
// nichts zusammen; innerhalb der Gruppe gilt weiter die Nagel-Regel.
function dragGhostBody(body) {
  return !!(playDrag && playDrag.noCollide && inDragGroup(body));
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

// Seil: eine Ebene vor dem Gegenstand, in dem der Nagel oder Motor steckt.
function ropeHostLayer(draw, layers) {
  let host = 0;
  let hung = false;
  for (const pin of [draw.pinA, draw.pinB]) {
    if (!pin) continue;
    hung = true;
    if (pin.body && pin.body !== ground) host = Math.max(host, layers.get(pin.body) || 0);
  }
  return hung ? host + 1 : 0;
}

function drawLayer(draw, layers) {
  if (!draw) return 0;
  if (draw.kind === "rope") return ropeHostLayer(draw, layers);
  return draw.body ? layers.get(draw.body) || 0 : 0;
}

function behindRopeIdsOf(draw) {
  const ids = draw && draw.meta && draw.meta.behindRopeIds;
  return ids && ids.length ? ids : null;
}

function drawingBehindRope(draw, rope) {
  if (!draw || !rope || rope.kind !== "rope" || draw.kind === "rope") return false;
  const ids = behindRopeIdsOf(draw);
  return !!(ids && ids.indexOf(rope.ropeId) >= 0);
}

// Negativ, wenn a vor b gezeichnet werden muss, weil a hinter diesem Seil entstand.
function ropeBehindOrder(a, b) {
  if (drawingBehindRope(a, b)) return -1;
  if (drawingBehindRope(b, a)) return 1;
  return 0;
}

// Zeichenreihenfolge: nach Ebene, innerhalb einer Ebene wie bisher.
// Ein hinter einem Seil geborener Körper kommt vor genau diesem Seil.
function drawingsByLayer() {
  const layers = bodyLayers();
  return drawings
    .map((d, i) => ({ d, i, l: drawLayer(d, layers) }))
    .sort((p, q) => ropeBehindOrder(p.d, q.d) || p.l - q.l || p.i - q.i)
    .map((p) => p.d);
}

function ropeSamplePoints(rope) {
  const pts = [];
  for (const body of (rope && rope.bodies) || []) {
    if (!body || (typeof body.isValid === "function" && !body.isValid())) continue;
    const p = body.getPosition();
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
}

function segCrosses(a, b, c, d) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return ((d1 > 1e-8 && d2 < -1e-8) || (d1 < -1e-8 && d2 > 1e-8))
    && ((d3 > 1e-8 && d4 < -1e-8) || (d3 < -1e-8 && d4 > 1e-8));
}

function segGap(a, b, c, d) {
  if (segCrosses(a, b, c, d)) return 0;
  return Math.min(
    distPointSeg(a.x, a.y, c.x, c.y, d.x, d.y),
    distPointSeg(b.x, b.y, c.x, c.y, d.x, d.y),
    distPointSeg(c.x, c.y, a.x, a.y, b.x, b.y),
    distPointSeg(d.x, d.y, a.x, a.y, b.x, b.y),
  );
}

function ropeCrossesPoly(samples, poly) {
  if (!poly || poly.length < 3) return false;
  for (const p of samples) {
    if (pointInPoly(p.x, p.y, poly)) return true;
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    for (let k = 0; k < poly.length; k++) {
      if (segCrosses(a, b, poly[k], poly[(k + 1) % poly.length])) return true;
    }
  }
  return false;
}

function ropeEntersCircle(samples, cx, cy, r) {
  for (const p of samples) {
    if (Math.hypot(p.x - cx, p.y - cy) < r) return true;
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (distPointSeg(cx, cy, a.x, a.y, b.x, b.y) < r) return true;
  }
  return false;
}

function ropeMeetsStroke(samples, stroke, reach) {
  if (!stroke || stroke.length < 2) return false;
  for (let i = 0; i < samples.length - 1; i++) {
    for (let k = 0; k < stroke.length - 1; k++) {
      if (segGap(samples[i], samples[i + 1], stroke[k], stroke[k + 1]) < reach) return true;
    }
  }
  return false;
}

function bornOutlineWorld(body, local) {
  const pts = [];
  for (const p of local) {
    const w = body.getWorldPoint(V(p.x, p.y));
    pts.push({ x: w.x, y: w.y });
  }
  return pts;
}

// true, wenn die Seilmittellinie die fertige Form schneidet oder in ihr liegt.
function bornOverRope(draw, rope) {
  const samples = ropeSamplePoints(rope);
  if (samples.length < 2 || !draw || !draw.body || !draw.meta) return false;
  const meta = draw.meta;
  const pos = draw.body.getPosition();
  const ang = draw.body.getAngle();
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  if (meta.circles && meta.circles.length) {
    for (const c of meta.circles) {
      const cx = pos.x + c.x * ca - c.y * sa;
      const cy = pos.y + c.x * sa + c.y * ca;
      if (ropeEntersCircle(samples, cx, cy, c.r)) return true;
    }
    return false;
  }
  if (!meta.outline || !meta.outline.local || meta.outline.local.length < 2) return false;
  const world = bornOutlineWorld(draw.body, meta.outline.local);
  if (meta.outline.closed) return ropeCrossesPoly(samples, world);
  return ropeMeetsStroke(samples, world, (meta.thick || THICK) * 0.5);
}

// Geburtsregel: überdeckt die fertige Form ein vorhandenes Seil, bleibt der
// Körper hinter genau diesem Seil. Die Liste klebt am Paar.
function markBornBehindRopes(draw) {
  if (!draw || !draw.body || !draw.meta || draw.kind === "rope") return;
  const ids = [];
  for (const rope of drawings) {
    if (!rope || rope.kind !== "rope" || rope.ropeId == null) continue;
    if (bornOverRope(draw, rope) && ids.indexOf(rope.ropeId) < 0) ids.push(rope.ropeId);
  }
  if (!ids.length) return;
  draw.meta.behindRopeIds = ids;
}

// Eine Seilhälfte nach dem Schnitt bleibt dasselbe Seil für die Geburtsregel.
function carryRopeBehind(oldId, newId) {
  if (oldId == null || newId == null || oldId === newId) return;
  for (const d of drawings) {
    const ids = d.meta && d.meta.behindRopeIds;
    if (!ids || ids.indexOf(oldId) < 0 || ids.indexOf(newId) >= 0) continue;
    ids.push(newId);
  }
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
    if (playDrag && playDrag.body === body && inDragGroup(pin.body)) continue;
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

// Überlappt eine der Posen (Map Körper → Pose) etwas außerhalb der Gruppe?
// `hosts` sind Nagelwirte, an die sich der gezogene Körper heften würde.
function groupOverlapAt(poses, hosts) {
  const skip = new Set(poses.keys());
  for (const [b, pose] of poses) {
    const s2 = new Set(skip);
    if (hosts && b === playDrag.body) for (const h of hosts) s2.add(h);
    if (overlapAtPose(b, pose, s2)) return true;
  }
  return false;
}

function lerpPoses(from, now, t) {
  const out = new Map();
  for (const [b, p] of now) out.set(b, lerpPose(from.get(b) || p, p, t));
  return out;
}

// Freie Nagelgruppe: Geist, Schatten und Rücksprung gelten für alle Körper.
function updateDragGhostGroup() {
  const body = playDrag.body;
  const now = new Map();
  for (const b of dragGroupBodies()) now.set(b, poseOfBody(b));
  const targets = dragPinTargets(body);
  const hosts = new Set(targets.map((p) => p.body));
  const hit = groupOverlapAt(now, hosts);
  playDrag.targets = hit ? [] : targets;
  playDrag.ghost = hit;
  if (!groupOverlapAt(now, null)) {
    playDrag.groupFree = now;
    playDrag.free = now.get(body);
    playDrag.wasFree = true;
    return;
  }
  if (playDrag.wasFree && playDrag.groupFree) {
    let lo = 0;
    let hi = 1;
    const from = playDrag.groupFree;
    for (let i = 0; i < GHOST_BISECT; i++) {
      const t = (lo + hi) / 2;
      if (groupOverlapAt(lerpPoses(from, now, t), null)) hi = t;
      else lo = t;
    }
    playDrag.groupFree = lerpPoses(from, now, lo);
    playDrag.free = playDrag.groupFree.get(body);
  }
  playDrag.wasFree = false;
}

// Nach jedem Physikschritt: Geist-Zustand und letzte freie Pose nachführen.
function updateDragGhost() {
  if (!playDrag || !playDrag.body || !playDrag.noCollide) return;
  if (playDrag.group) {
    updateDragGhostGroup();
    return;
  }
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
  if (drag.group && drag.groupFree) {
    for (const [b, pose] of drag.groupFree) {
      if (b !== drag.body && !bodyMeta.has(b)) continue;
      b.setTransform(V(pose.x, pose.y), pose.a);
      b.setLinearVelocity(V(0, 0));
      b.setAngularVelocity(0);
      b.setAwake(true);
    }
    return true;
  }
  const body = drag.body;
  body.setTransform(V(drag.free.x, drag.free.y), drag.free.a);
  body.setLinearVelocity(V(0, 0));
  body.setAngularVelocity(0);
  body.setAwake(true);
  return true;
}
