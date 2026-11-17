const ROPE_SPACING = 0.22;
const ROPE_BEAD_R = 0.10;
const ROPE_BEAD_DENSITY = 1.6;
const ROPE_MAX_STRETCH = 1.01;
const ROPE_CUT_ANGLE = 15 * Math.PI / 180;   // Innenwinkel der Spitze
const ROPE_CUT_ALIGN = 30 * Math.PI / 180;   // Abweichung von der Senkrechten
const ROPE_CUT_SPEED = 2.5;                  // m/s, Mindestgeschwindigkeit

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function ropeChainLength(draw) {
  if (!draw || !draw.bodies) return 0;
  let len = 0;
  let prev = null;
  for (const body of draw.bodies) {
    if (!body || (typeof body.isValid === "function" && !body.isValid())) continue;
    const p = body.getPosition();
    if (prev) len += dist(prev, p);
    prev = { x: p.x, y: p.y };
  }
  return len;
}

function attachRopePins(targetWorld, pinA, pinB, bodies) {
  const endA = targetWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pinA.body,
    bodyB: bodies[0],
    localAnchorA: V(pinA.local.x, pinA.local.y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  const endB = targetWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pinB.body,
    bodyB: bodies[bodies.length - 1],
    localAnchorA: V(pinB.local.x, pinB.local.y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  return [endA, endB];
}

function linkRopeSegment(targetWorld, a, b, length) {
  const distJ = targetWorld.createJoint(new planck.DistanceJoint({
    bodyA: a,
    bodyB: b,
    localAnchorA: V(0, 0),
    localAnchorB: V(0, 0),
    length,
    frequencyHz: 0,
    dampingRatio: 0,
    collideConnected: false,
  }));
  const ropeJ = targetWorld.createJoint(new planck.RopeJoint({
    bodyA: a,
    bodyB: b,
    localAnchorA: V(0, 0),
    localAnchorB: V(0, 0),
    maxLength: length * ROPE_MAX_STRETCH,
    collideConnected: false,
  }));
  return { dist: distJ, rope: ropeJ, length };
}

function buildRope(targetWorld, pinA, pinB, stroke, trackFn) {
  const start = pinWorld(pinA);
  const end = pinWorld(pinB);
  let pts = (stroke && stroke.length >= 2) ? stroke.map((p) => ({ x: p.x, y: p.y })) : [start, end];
  pts[0] = { x: start.x, y: start.y };
  pts[pts.length - 1] = { x: end.x, y: end.y };
  const restLength = pathLength(pts);
  if (restLength < 0.08) return null;
  const samples = resample(pts, ROPE_SPACING);
  if (samples.length < 2) return null;
  const ropeId = ropeSeq++;
  const bodies = [];
  for (const p of samples) {
    const body = targetWorld.createDynamicBody({
      position: V(p.x, p.y),
      bullet: true,
      linearDamping: 0.8,
      angularDamping: 0.8,
    });
    body.createFixture(new planck.Circle(ROPE_BEAD_R), fixtureOpt({
      density: ROPE_BEAD_DENSITY,
      friction: 0.45,
      restitution: 0,
      filterGroupIndex: -2,
    }));
    if (trackFn) trackFn(body, { kind: "rope", ropeId });
    bodies.push(body);
  }
  const segJoints = [];
  for (let i = 0; i < bodies.length - 1; i++) {
    const d = dist(samples[i], samples[i + 1]) || ROPE_SPACING;
    segJoints.push(linkRopeSegment(targetWorld, bodies[i], bodies[i + 1], d));
  }
  const endJoints = attachRopePins(targetWorld, pinA, pinB, bodies);
  // Spanne zwischen den Endgliedern, nicht zwischen den Nägeln: die Nägel
  // sitzen oft auf statischen Körpern, ein Joint dort würde nichts halten.
  const spanJoint = targetWorld.createJoint(new planck.RopeJoint({
    bodyA: bodies[0],
    bodyB: bodies[bodies.length - 1],
    localAnchorA: V(0, 0),
    localAnchorB: V(0, 0),
    maxLength: restLength * ROPE_MAX_STRETCH,
    collideConnected: false,
  }));
  return {
    kind: "rope",
    ropeId,
    bodies,
    color: MAT.hemp,
    restLength,
    segJoints,
    endJoints,
    spanJoint,
    pinA,
    pinB,
  };
}

function pinBodyMass(pin) {
  if (!pin || !pin.body || !pin.body.isDynamic()) return 0;
  const m = pin.body.getMass();
  return m > 1e-8 ? m : 0;
}

function movePinWithBead(pin, dx, dy) {
  if (!pin || !pin.body || !pin.body.isDynamic()) return;
  const p = pin.body.getPosition();
  pin.body.setPosition(V(p.x + dx, p.y + dy));
}

function tightenRopeDraw(draw, passes) {
  if (!draw || !draw.bodies || !draw.segJoints) return;
  const bodies = draw.bodies;
  const n = bodies.length;
  if (n < 2) return;
  const inv = [];
  for (let i = 0; i < n; i++) {
    const body = bodies[i];
    if (!body || (typeof body.isValid === "function" && !body.isValid()) || !body.isDynamic()) inv[i] = 0;
    else {
      const m = body.getMass();
      inv[i] = m > 1e-8 ? 1 / m : 0;
    }
  }
  function endMass(pin) {
    if (!pin) return -1;
    if (draw.fixedPins) return 0;
    return pinBodyMass(pin);
  }
  const massA = endMass(draw.pinA);
  const massB = endMass(draw.pinB);
  if (massA > 0) inv[0] = 1 / (massA + (1 / (inv[0] || 1e9)));
  else if (massA === 0) inv[0] = 0;
  if (massB > 0) inv[n - 1] = 1 / (massB + (1 / (inv[n - 1] || 1e9)));
  else if (massB === 0) inv[n - 1] = 0;
  const reps = passes || Math.max(50, bodies.length * 2);
  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < draw.segJoints.length; i++) {
      const rest = draw.segJoints[i].length;
      const A = bodies[i];
      const B = bodies[i + 1];
      if (!A || !B) continue;
      const pa = A.getPosition();
      const pb = B.getPosition();
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy) || 1e-9;
      if (d <= rest * 1.0005) continue;
      const wA = inv[i];
      const wB = inv[i + 1];
      const w = wA + wB;
      if (w <= 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const excess = d - rest;
      if (wA) {
        const mx = nx * excess * (wA / w);
        const my = ny * excess * (wA / w);
        A.setPosition(V(pa.x + mx, pa.y + my));
        if (i === 0) movePinWithBead(draw.pinA, mx, my);
        const va = A.getLinearVelocity();
        const sep = va.x * nx + va.y * ny;
        if (sep < 0) {
          A.setLinearVelocity(V(va.x - sep * nx, va.y - sep * ny));
          if (i === 0 && draw.pinA && draw.pinA.body && draw.pinA.body.isDynamic()) {
            const pv = draw.pinA.body.getLinearVelocity();
            const ps = pv.x * nx + pv.y * ny;
            if (ps < 0) draw.pinA.body.setLinearVelocity(V(pv.x - ps * nx, pv.y - ps * ny));
          }
        }
      }
      if (wB) {
        const qb = B.getPosition();
        const mx = nx * excess * (wB / w);
        const my = ny * excess * (wB / w);
        B.setPosition(V(qb.x - mx, qb.y - my));
        if (i === n - 2) movePinWithBead(draw.pinB, -mx, -my);
        const vb = B.getLinearVelocity();
        const sep = vb.x * nx + vb.y * ny;
        if (sep > 0) {
          B.setLinearVelocity(V(vb.x - sep * nx, vb.y - sep * ny));
          if (i === n - 2 && draw.pinB && draw.pinB.body && draw.pinB.body.isDynamic()) {
            const pv = draw.pinB.body.getLinearVelocity();
            const ps = pv.x * nx + pv.y * ny;
            if (ps > 0) draw.pinB.body.setLinearVelocity(V(pv.x - ps * nx, pv.y - ps * ny));
          }
        }
      }
    }
  }
  if (massA === 0 && draw.pinA && bodies[0]) {
    const p = pinWorld(draw.pinA);
    bodies[0].setTransform(V(p.x, p.y), bodies[0].getAngle());
    bodies[0].setLinearVelocity(V(0, 0));
  }
  if (massB === 0 && draw.pinB && bodies[n - 1]) {
    const p = pinWorld(draw.pinB);
    bodies[n - 1].setTransform(V(p.x, p.y), bodies[n - 1].getAngle());
    bodies[n - 1].setLinearVelocity(V(0, 0));
  }
}

function limitRopeChord(draw) {
  if (!draw || !draw.pinA || !draw.pinB || draw.restLength == null) return;
  if (draw.fixedPins || draw.pinA.body === draw.pinB.body) return;
  const a = pinWorld(draw.pinA);
  const b = pinWorld(draw.pinB);
  const chord = dist(a, b);
  const maxL = draw.restLength * ROPE_MAX_STRETCH;
  if (chord <= maxL + 1e-6) return;
  const massA = pinBodyMass(draw.pinA);
  const massB = pinBodyMass(draw.pinB);
  const wA = massA > 0 ? 1 / massA : 0;
  const wB = massB > 0 ? 1 / massB : 0;
  const w = wA + wB;
  if (w <= 0) return;
  const nx = (b.x - a.x) / chord;
  const ny = (b.y - a.y) / chord;
  const excess = chord - maxL;
  if (wA) {
    const mx = nx * excess * (wA / w);
    const my = ny * excess * (wA / w);
    movePinWithBead(draw.pinA, mx, my);
    if (draw.bodies[0]) {
      const p = draw.bodies[0].getPosition();
      draw.bodies[0].setPosition(V(p.x + mx, p.y + my));
    }
  }
  if (wB) {
    const mx = nx * excess * (wB / w);
    const my = ny * excess * (wB / w);
    movePinWithBead(draw.pinB, -mx, -my);
    const last = draw.bodies[draw.bodies.length - 1];
    if (last) {
      const p = last.getPosition();
      last.setPosition(V(p.x - mx, p.y - my));
    }
  }
}

function scaleRopeToRest(draw) {
  if (!draw || !draw.bodies || draw.restLength == null) return;
  if (!draw.fixedPins && (pinBodyMass(draw.pinA) > 0 || pinBodyMass(draw.pinB) > 0)) return;
  const bodies = draw.bodies.filter((b) => b && (typeof b.isValid !== "function" || b.isValid()));
  if (bodies.length < 3) return;
  const pts = bodies.map((b) => {
    const p = b.getPosition();
    return { x: p.x, y: p.y };
  });
  const live = pathLength(pts);
  const maxL = draw.restLength * ROPE_MAX_STRETCH;
  if (live <= maxL) return;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const chord = dist(a, b) || 1e-9;
  const frac = [];
  let acc = 0;
  frac[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i]);
    frac[i] = acc;
  }
  const total = acc || 1;
  const chordPts = pts.map((_, i) => ({
    x: a.x + (b.x - a.x) * (frac[i] / total),
    y: a.y + (b.y - a.y) * (frac[i] / total),
  }));
  let lo = 0;
  let hi = 1;
  let best = 1;
  for (let k = 0; k < 12; k++) {
    const t = (lo + hi) / 2;
    let len = 0;
    let px = pts[0].x;
    let py = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const x = pts[i].x + (chordPts[i].x - pts[i].x) * t;
      const y = pts[i].y + (chordPts[i].y - pts[i].y) * t;
      len += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    if (len > maxL) lo = t;
    else {
      hi = t;
      best = t;
    }
  }
  for (let i = 1; i < bodies.length - 1; i++) {
    const x = pts[i].x + (chordPts[i].x - pts[i].x) * best;
    const y = pts[i].y + (chordPts[i].y - pts[i].y) * best;
    bodies[i].setPosition(V(x, y));
  }
}

function tightenRopes(list) {
  const src = list || drawings;
  for (const draw of src) {
    if (draw && draw.kind === "rope") {
      tightenRopeDraw(draw);
      limitRopeChord(draw);
      scaleRopeToRest(draw);
    }
  }
}

function velocityAt(body, wx, wy) {
  const v = body.getLinearVelocity();
  const w = body.getAngularVelocity();
  const p = body.getPosition();
  return { x: v.x - w * (wy - p.y), y: v.y + w * (wx - p.x) };
}

function ropeTips(worldPts, maxAng) {
  if (!worldPts || worldPts.length < 3) return [];
  const ccw = ensureCCW(worldPts.map((p) => ({ x: p.x, y: p.y })));
  const angs = interiorAngles(ccw);
  const tips = [];
  for (let i = 0; i < ccw.length; i++) {
    if (angs[i] >= maxAng) continue;
    const prev = ccw[(i + ccw.length - 1) % ccw.length];
    const cur = ccw[i];
    const next = ccw[(i + 1) % ccw.length];
    const e1x = prev.x - cur.x;
    const e1y = prev.y - cur.y;
    const e2x = next.x - cur.x;
    const e2y = next.y - cur.y;
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    let ox = -(e1x / l1 + e2x / l2);
    let oy = -(e1y / l1 + e2y / l2);
    const lo = Math.hypot(ox, oy) || 1;
    tips.push({ x: cur.x, y: cur.y, nx: ox / lo, ny: oy / lo, ang: angs[i] });
  }
  return tips;
}

function ropeTangentAtBead(draw, index, contact) {
  const bodies = draw.bodies;
  const i = index;
  let ax, ay, bx, by;
  if (i > 0 && i < bodies.length - 1) {
    const pa = bodies[i - 1].getPosition();
    const pb = bodies[i + 1].getPosition();
    ax = pa.x;
    ay = pa.y;
    bx = pb.x;
    by = pb.y;
  } else if (i < bodies.length - 1) {
    const pa = bodies[i].getPosition();
    const pb = bodies[i + 1].getPosition();
    ax = pa.x;
    ay = pa.y;
    bx = pb.x;
    by = pb.y;
  } else if (i > 0) {
    const pa = bodies[i - 1].getPosition();
    const pb = bodies[i].getPosition();
    ax = pa.x;
    ay = pa.y;
    bx = pb.x;
    by = pb.y;
  } else return null;
  const d = Math.hypot(bx - ax, by - ay) || 1;
  return { x: (bx - ax) / d, y: (by - ay) / d };
}

function noteRopeCutContact(contact) {
  const ba = contact.getFixtureA().getBody();
  const bb = contact.getFixtureB().getBody();
  const ma = bodyMeta.get(ba);
  const mb = bodyMeta.get(bb);
  if (!ma || !mb) return;
  let bead = null;
  let cutter = null;
  let cutMeta = null;
  if (ma.kind === "rope" && mb.kind !== "rope") {
    bead = ba;
    cutter = bb;
    cutMeta = mb;
  } else if (mb.kind === "rope" && ma.kind !== "rope") {
    bead = bb;
    cutter = ba;
    cutMeta = ma;
  } else return;
  if (!cutMeta || cutMeta.kind === "ball" || cutMeta.kind === "star" || cutMeta.kind === "wire" || cutMeta.round) return;
  const wm = contact.getWorldManifold && contact.getWorldManifold();
  if (!wm || !wm.pointCount) return;
  const pt = wm.points[0];
  const x = pt.x;
  const y = pt.y;
  const vc = velocityAt(cutter, x, y);
  const vb = velocityAt(bead, x, y);
  ropeCutQ.push({
    bead,
    cutter,
    cutMeta,
    x,
    y,
    vx: vc.x - vb.x,
    vy: vc.y - vb.y,
  });
}

function ropeShouldCut(ev) {
  if (!ev || !ev.cutter || !ev.bead || !ev.cutMeta) return false;
  const draw = drawings.find((d) => d.kind === "rope" && d.bodies && d.bodies.indexOf(ev.bead) >= 0);
  if (!draw) return false;
  const maxAng = tuneCode("ropeCutAngle", ROPE_CUT_ANGLE);
  const align = tuneCode("ropeCutAlign", ROPE_CUT_ALIGN);
  const minSpeed = tuneCode("ropeCutSpeed", ROPE_CUT_SPEED);
  const speed = Math.hypot(ev.vx, ev.vy);
  if (speed < minSpeed) return false;
  const outline = outlineWorld(ev.cutMeta);
  if (!outline || outline.length < 3) return false;
  const tips = ropeTips(outline, maxAng);
  if (!tips.length) return false;
  let best = null;
  let bestD = 0.28;
  for (const tip of tips) {
    const d = Math.hypot(tip.x - ev.x, tip.y - ev.y);
    if (d < bestD) {
      bestD = d;
      best = tip;
    }
  }
  if (!best) return false;
  const sm = speed || 1;
  const rx = ev.vx / sm;
  const ry = ev.vy / sm;
  if (best.nx * rx + best.ny * ry < 0.35) return false;
  const idx = draw.bodies.indexOf(ev.bead);
  const tan = ropeTangentAtBead(draw, idx, ev);
  if (!tan) return false;
  const along = Math.abs(rx * tan.x + ry * tan.y);
  if (along > Math.sin(align)) return false;
  const tipAlong = Math.abs(best.nx * tan.x + best.ny * tan.y);
  if (tipAlong > Math.sin(align)) return false;
  ev.draw = draw;
  ev.index = idx;
  return true;
}

function cutRopeAtBead(ev) {
  const draw = ev.draw;
  if (!draw || !world) return false;
  const bodies = draw.bodies;
  const i = ev.index;
  if (i < 0 || bodies.length < 3) return false;
  let cut = i;
  if (i <= 0) cut = 0;
  else if (i >= bodies.length - 1) cut = i - 1;
  else {
    const pa = bodies[i - 1].getPosition();
    const pb = bodies[i].getPosition();
    const pc = bodies[i + 1].getPosition();
    const d1 = distPointSeg(ev.x, ev.y, pa.x, pa.y, pb.x, pb.y);
    const d2 = distPointSeg(ev.x, ev.y, pb.x, pb.y, pc.x, pc.y);
    cut = d1 <= d2 ? i - 1 : i;
  }
  const seg = draw.segJoints[cut];
  if (!seg) return false;
  if (seg.dist) world.destroyJoint(seg.dist);
  if (seg.rope) world.destroyJoint(seg.rope);
  if (draw.spanJoint) {
    world.destroyJoint(draw.spanJoint);
    draw.spanJoint = null;
  }
  const leftBodies = bodies.slice(0, cut + 1);
  const rightBodies = bodies.slice(cut + 1);
  const leftJoints = draw.segJoints.slice(0, cut);
  const rightJoints = draw.segJoints.slice(cut + 1);
  if (!leftBodies.length || !rightBodies.length) return false;
  draw.bodies = leftBodies;
  draw.segJoints = leftJoints;
  draw.restLength = leftJoints.reduce((s, j) => s + (j && j.length ? j.length : 0), 0);
  const ends = draw.endJoints || [null, null];
  draw.endJoints = [ends[0], null];
  const rightPin = draw.pinB;
  draw.pinB = null;
  const rightId = ropeSeq++;
  for (const body of rightBodies) {
    const meta = bodyMeta.get(body);
    if (meta) meta.ropeId = rightId;
  }
  drawings.push({
    kind: "rope",
    ropeId: rightId,
    bodies: rightBodies,
    color: draw.color || MAT.hemp,
    restLength: rightJoints.reduce((s, j) => s + (j && j.length ? j.length : 0), 0),
    segJoints: rightJoints,
    endJoints: [null, ends[1]],
    spanJoint: null,
    pinA: null,
    pinB: rightPin,
  });
  return true;
}

function applyRopeCuts() {
  if (!ropeCutQ.length || !world || (world.isLocked && world.isLocked())) {
    ropeCutQ = [];
    return;
  }
  const batch = ropeCutQ.splice(0);
  const seen = new Set();
  for (const ev of batch) {
    if (!ropeShouldCut(ev)) continue;
    if (seen.has(ev.draw)) continue;
    if (cutRopeAtBead(ev)) seen.add(ev.draw);
  }
}

function spawnRope(pinA, pinB, stroke) {
  if (!world) return null;
  const draw = buildRope(world, pinA, pinB, stroke, track);
  if (!draw) return null;
  drawings.push(draw);
  stats.shapes += 1;
  stats.ropes += 1;
  return draw;
}

