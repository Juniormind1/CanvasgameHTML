const ROPE_SPACING = 0.22;
const ROPE_BEAD_R = 0.10;
const ROPE_BEAD_DENSITY = 1.6;
const ROPE_MAX_STRETCH = 1.01;
const ROPE_CHORD_SLIP = 0.002;               // Anteil, ab dem die Sehne hart nachgefasst wird
const ROPE_CUT_ANGLE = 15 * Math.PI / 180;   // Innenwinkel der Spitze
const ROPE_CUT_ALIGN = 30 * Math.PI / 180;   // Abweichung von der Senkrechten
const ROPE_CUT_SPEED = 2.5;                  // m/s, Mindestgeschwindigkeit
const ROPE_FROM_NAIL_MIN = 0.25;             // m, kürzer: kein Seilfragment vom Nagel

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
  const endA = pinA ? targetWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pinA.body,
    bodyB: bodies[0],
    localAnchorA: V(pinA.local.x, pinA.local.y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  })) : null;
  const endB = pinB ? targetWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pinB.body,
    bodyB: bodies[bodies.length - 1],
    localAnchorA: V(pinB.local.x, pinB.local.y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  })) : null;
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

// Seil-Sehne direkt zwischen den beiden Nagelkörpern. Die Perlen sind sehr
// leicht (rund 0,05 kg); hängt an ihnen ein Klotz von 20 kg, kann der Löser die
// Kette allein nicht halten. Die Sehne trägt deshalb die Last im selben
// Lösungsschritt wie die Kontakte, so kämpft das Seil nicht gegen den Boden.
// collideConnected bleibt an, sonst fiele ein Klotz am Bodennagel durch den Boden.
function createRopeChord(targetWorld, pinA, pinB, restLength) {
  if (!pinA || !pinB || !pinA.body || !pinB.body || pinA.body === pinB.body) return null;
  return targetWorld.createJoint(new planck.RopeJoint({
    bodyA: pinA.body,
    bodyB: pinB.body,
    localAnchorA: V(pinA.local.x, pinA.local.y),
    localAnchorB: V(pinB.local.x, pinB.local.y),
    maxLength: restLength * ROPE_MAX_STRETCH,
    collideConnected: true,
  }));
}

function jointAlive(targetWorld, joint) {
  if (!targetWorld || !joint) return false;
  for (let j = targetWorld.getJointList(); j; j = j.getNext()) {
    if (j === joint) return true;
  }
  return false;
}

function dropRopeChord(draw) {
  if (!draw || !draw.chordJoint) return;
  if (jointAlive(world, draw.chordJoint)) world.destroyJoint(draw.chordJoint);
  draw.chordJoint = null;
}

function makeRopeBead(targetWorld, x, y, ropeId, trackFn) {
  const body = targetWorld.createDynamicBody({
    position: V(x, y),
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
  return body;
}

function buildRope(targetWorld, pinA, pinB, stroke, trackFn) {
  const strokePts = (stroke && stroke.length >= 2) ? stroke.map((p) => ({ x: p.x, y: p.y })) : null;
  const start = pinA ? pinWorld(pinA) : (strokePts && strokePts[0]);
  const end = pinB ? pinWorld(pinB) : (strokePts && strokePts[strokePts.length - 1]);
  if (!start || !end) return null;
  let pts = strokePts ? strokePts : [start, end];
  pts[0] = { x: start.x, y: start.y };
  pts[pts.length - 1] = { x: end.x, y: end.y };
  const restLength = pathLength(pts);
  if (restLength < 0.08) return null;
  const samples = resample(pts, ROPE_SPACING);
  if (samples.length < 2) return null;
  const ropeId = ropeSeq++;
  const bodies = [];
  for (const p of samples) bodies.push(makeRopeBead(targetWorld, p.x, p.y, ropeId, trackFn));
  const segJoints = [];
  for (let i = 0; i < bodies.length - 1; i++) {
    const d = dist(samples[i], samples[i + 1]) || ROPE_SPACING;
    segJoints.push(linkRopeSegment(targetWorld, bodies[i], bodies[i + 1], d));
  }
  const endJoints = attachRopePins(targetWorld, pinA, pinB, bodies);
  // Spanne zwischen den Endgliedern, nicht zwischen den Nägeln: die Nägel
  // sitzen oft auf statischen Körpern, ein Joint dort würde nichts halten.
  // Ein Seil mit nur einem Nagel bleibt am freien Ende lose, ohne Spannjoint.
  const spanJoint = (pinA && pinB) ? targetWorld.createJoint(new planck.RopeJoint({
    bodyA: bodies[0],
    bodyB: bodies[bodies.length - 1],
    localAnchorA: V(0, 0),
    localAnchorB: V(0, 0),
    maxLength: restLength * ROPE_MAX_STRETCH,
    collideConnected: false,
  })) : null;
  return {
    kind: "rope",
    ropeId,
    bodies,
    color: MAT.hemp,
    restLength,
    drawnLength: restLength,
    segJoints,
    endJoints,
    spanJoint,
    chordJoint: createRopeChord(targetWorld, pinA, pinB, restLength),
    pinA: pinA || null,
    pinB: pinB || null,
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

function snapBeadToPin(bead, pin) {
  const p = pinWorld(pin);
  bead.setTransform(V(p.x, p.y), bead.getAngle());
  const v = pin.body.isDynamic() ? velocityAt(pin.body, p.x, p.y) : { x: 0, y: 0 };
  bead.setLinearVelocity(V(v.x, v.y));
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
  // Mit Sehne trägt der Löser die Last; die Perlen folgen dem Endkörper,
  // statt ihn ohne Rücksicht auf Kontakte zu verschieben.
  const chordLive = !!draw.chordJoint;
  function endMass(pin) {
    if (!pin) return -1;
    if (draw.fixedPins || chordLive) return 0;
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
  if (massA === 0 && draw.pinA && bodies[0]) snapBeadToPin(bodies[0], draw.pinA);
  if (massB === 0 && draw.pinB && bodies[n - 1]) snapBeadToPin(bodies[n - 1], draw.pinB);
}

// Effektive Masse eines Nagelpunkts entlang n: 1/m + (r x n)^2 / I.
// Nur dynamische Körper zählen; statische und kinematische halten fest.
function pinPointInfo(pin, nx, ny) {
  const body = pin && pin.body;
  if (!body || !body.isDynamic()) return null;
  const m = body.getMass();
  if (!(m > 1e-8)) return null;
  const c = body.getWorldCenter();
  const lc = body.getLocalCenter();
  const iCenter = body.getInertia() - m * (lc.x * lc.x + lc.y * lc.y);
  const invI = (body.isFixedRotation && body.isFixedRotation()) || !(iCenter > 1e-9) ? 0 : 1 / iCenter;
  const p = pinWorld(pin);
  const rx = p.x - c.x;
  const ry = p.y - c.y;
  const rn = rx * ny - ry * nx;
  return { body, invM: 1 / m, invI, rx, ry, k: 1 / m + invI * rn * rn, p };
}

// Verschiebt den Körper so, als wirke der Positionsimpuls (px, py) am
// Nagelpunkt: Schwerpunkt wandert, der Körper dreht sich um ihn.
function shiftPinBody(info, px, py) {
  const body = info.body;
  const dA = info.invI * (info.rx * py - info.ry * px);
  const c = body.getWorldCenter();
  const o = body.getPosition();
  const cx = c.x + px * info.invM;
  const cy = c.y + py * info.invM;
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const cs = Math.cos(dA);
  const sn = Math.sin(dA);
  body.setTransform(V(cx + ox * cs - oy * sn, cy + ox * sn + oy * cs), body.getAngle() + dA);
}

function pinPointVelocity(info) {
  return velocityAt(info.body, info.p.x, info.p.y);
}

// Harte Sehne zwischen den Nägeln. Früher wurde der Endkörper nur verschoben,
// seine Geschwindigkeit nach außen blieb aber stehen: Ein schwerer Klotz am
// gespannten Seil sammelte so jeden Schritt Fallgeschwindigkeit, wurde
// zurückteleportiert und rammte sich in den Boden. Jetzt wirkt die Sehne wie
// ein unelastisches Seil: Positionskorrektur am Nagelpunkt (mit Drehung) und
// ein Impuls, der die Trenngeschwindigkeit entlang des Seils aufhebt.
function limitRopeChord(draw) {
  if (!draw || !draw.pinA || !draw.pinB || draw.restLength == null) return;
  if (draw.fixedPins || draw.pinA.body === draw.pinB.body) return;
  const a = pinWorld(draw.pinA);
  const b = pinWorld(draw.pinB);
  const chord = dist(a, b);
  const maxL = draw.restLength * ROPE_MAX_STRETCH;
  // Die Sehne im Löser hält das Seil normalerweise; hier wird nur noch
  // nachgefasst, wenn sie bei harten Stößen merklich nachgibt.
  const slack = draw.chordJoint ? ROPE_CHORD_SLIP * draw.restLength : 0;
  if (chord <= maxL + slack + 1e-6) return;
  const nx = (b.x - a.x) / chord;
  const ny = (b.y - a.y) / chord;
  const infoA = pinPointInfo(draw.pinA, nx, ny);
  const infoB = pinPointInfo(draw.pinB, nx, ny);
  const kSum = (infoA ? infoA.k : 0) + (infoB ? infoB.k : 0);
  if (!(kSum > 0)) return;
  // Trenngeschwindigkeit der beiden Nagelpunkte entlang des Seils aufheben.
  const vA = infoA ? pinPointVelocity(infoA) : { x: 0, y: 0 };
  const vB = infoB ? pinPointVelocity(infoB) : { x: 0, y: 0 };
  const vSep = (vB.x - vA.x) * nx + (vB.y - vA.y) * ny;
  if (vSep > 0) {
    const jv = vSep / kSum;
    if (infoA) infoA.body.applyLinearImpulse(V(nx * jv, ny * jv), V(infoA.p.x, infoA.p.y), true);
    if (infoB) infoB.body.applyLinearImpulse(V(-nx * jv, -ny * jv), V(infoB.p.x, infoB.p.y), true);
  }
  // Lage korrigieren: Nagelpunkte zurück auf Seillänge, mit Drehung.
  const lambda = (chord - maxL) / kSum;
  const ends = [
    [infoA, 1, draw.bodies[0], draw.pinA],
    [infoB, -1, draw.bodies[draw.bodies.length - 1], draw.pinB],
  ];
  for (const [info, sign, bead, pin] of ends) {
    if (!info) continue;
    const before = pinWorld(pin);
    shiftPinBody(info, nx * lambda * sign, ny * lambda * sign);
    const after = pinWorld(pin);
    if (bead) {
      const p = bead.getPosition();
      bead.setPosition(V(p.x + after.x - before.x, p.y + after.y - before.y));
    }
  }
}

function scaleRopeToRest(draw) {
  if (!draw || !draw.bodies || draw.restLength == null) return;
  // Freies oder geschnittenes Ende nicht auf eine Sehne zwischen den
  // Endperlen zusammenziehen, sonst hängt ein einseitiges Seil falsch.
  if (!draw.pinA || !draw.pinB) return;
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

// Perlen stoßen nicht mit dem beweglichen Körper zusammen, an dem ihr eigenes
// Seil festgenagelt ist. Sonst klemmen die 0,05-kg-Perlen unter einem schweren
// Klotz: Er liegt auf ihnen statt auf dem Boden, die Kette zieht sie jeden
// Schritt zurück, und der Klotz sammelt Geschwindigkeit, ohne sich zu bewegen.
function ropeOwnEndContact(contact) {
  const ba = contact.getFixtureA().getBody();
  const bb = contact.getFixtureB().getBody();
  const ma = bodyMeta.get(ba);
  const mb = bodyMeta.get(bb);
  let beadMeta = null;
  let other = null;
  if (ma && ma.kind === "rope" && !(mb && mb.kind === "rope")) {
    beadMeta = ma;
    other = bb;
  } else if (mb && mb.kind === "rope" && !(ma && ma.kind === "rope")) {
    beadMeta = mb;
    other = ba;
  }
  if (!beadMeta || !other || !other.isDynamic()) return false;
  for (const d of drawings) {
    if (d.kind !== "rope" || d.ropeId !== beadMeta.ropeId) continue;
    return !!((d.pinA && d.pinA.body === other) || (d.pinB && d.pinB.body === other));
  }
  return false;
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
  dropRopeChord(draw);
  const leftBodies = bodies.slice(0, cut + 1);
  const rightBodies = bodies.slice(cut + 1);
  const leftJoints = draw.segJoints.slice(0, cut);
  const rightJoints = draw.segJoints.slice(cut + 1);
  if (!leftBodies.length || !rightBodies.length) return false;
  draw.bodies = leftBodies;
  draw.segJoints = leftJoints;
  draw.restLength = leftJoints.reduce((s, j) => s + (j && j.length ? j.length : 0), 0);
  draw.drawnLength = draw.restLength;
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
    drawnLength: rightJoints.reduce((s, j) => s + (j && j.length ? j.length : 0), 0),
    segJoints: rightJoints,
    endJoints: [null, ends[1]],
    spanJoint: null,
    chordJoint: null,
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


// ---------------------------------------------------------------------------
// Seilwinde: Ein Motornagel spult jedes Seil, das an ihm hängt.
// Rechtsrum (im Uhrzeigersinn, Motor -1) verkürzt, linksrum (Motor +1)
// verlängert, mit Tempo = Drehzahl × Spulenradius. Gespult wird nur das
// Glied am Nagel: Es wird kürzer oder länger, und wenn es zu kurz wird, fällt
// die Nachbarperle weg (ihr Glied geht im Nagelglied auf); wird es zu lang,
// kommt dazwischen eine neue Perle. Keine Perle wird dabei versetzt; den Rest
// erledigen Löser, Sehne und tightenRopes wie bisher. Die Last bleibt stehen,
// sobald der Seilzug am Nagel größer ist als Windenmoment / Spulenradius.
const WINCH_MERGE = 0.06;   // m, kürzeres Nagelglied geht im Nachbarglied auf

function ropeSegSetLength(seg, len) {
  seg.length = len;
  if (seg.dist && typeof seg.dist.setLength === "function") seg.dist.setLength(len);
  if (seg.rope && typeof seg.rope.setMaxLength === "function") seg.rope.setMaxLength(len * ROPE_MAX_STRETCH);
}

function ropeSegSum(draw) {
  return draw.segJoints.reduce((s, j) => s + (j && j.length ? j.length : 0), 0);
}

// restLength um die tatsächliche Änderung der Glieder verschieben (nicht neu
// summieren: gezeichnete Seile haben durch das Abtasten oft eine etwas
// kleinere Gliedersumme, ein Sprung würde den Klotz ruckartig anheben).
function ropeSyncRest(draw, delta) {
  draw.restLength += delta;
  const maxL = draw.restLength * ROPE_MAX_STRETCH;
  if (draw.spanJoint && typeof draw.spanJoint.setMaxLength === "function") draw.spanJoint.setMaxLength(maxL);
  if (draw.chordJoint && typeof draw.chordJoint.setMaxLength === "function") draw.chordJoint.setMaxLength(maxL);
}

function dropRopeBead(body) {
  if (!body) return;
  bodyMeta.delete(body);
  world.destroyBody(body);
}

// Seilzug am Nagel aus dem letzten Löserschritt (Sehne + Endgelenk), in N.
function ropeEndTension(draw, end, invDt) {
  let t = 0;
  if (draw.chordJoint && jointAlive(world, draw.chordJoint)) {
    const f = draw.chordJoint.getReactionForce(invDt);
    t += Math.hypot(f.x, f.y);
  }
  const ej = draw.endJoints && draw.endJoints[end === "A" ? 0 : 1];
  if (ej) {
    const f = ej.getReactionForce(invDt);
    t += Math.hypot(f.x, f.y);
  }
  return t;
}

// Ändert die Seillänge am Ende `end` ("A" oder "B") um dL (negativ = kürzer).
function reelRopeEnd(draw, end, dL) {
  const n = draw.bodies.length;
  if (n < 2 || !draw.segJoints.length) return 0;
  const atA = end === "A";
  // Indizes: e = Nagelperle, f = Nachbar, g = übernächste; Glied k0 = e–f, k1 = f–g.
  const e = atA ? 0 : n - 1;
  const f = atA ? 1 : n - 2;
  const g = atA ? 2 : n - 3;
  const k0 = atA ? 0 : n - 2;
  const k1 = atA ? 1 : n - 3;
  const seg0 = draw.segJoints[k0];
  const sumBefore = ropeSegSum(draw);
  let len = seg0.length + dL;
  if (dL < 0 && len < WINCH_MERGE && n >= 3 && draw.segJoints[k1]) {
    // Nachbarperle fällt weg, ihr Glied geht im Nagelglied auf.
    const seg1 = draw.segJoints[k1];
    const merged = Math.max(0.02, len) + seg1.length;
    const bead = draw.bodies[f];
    const a = draw.bodies[e];
    const c = draw.bodies[g];
    dropRopeBead(bead);
    const link = atA ? linkRopeSegment(world, a, c, merged) : linkRopeSegment(world, c, a, merged);
    if (atA) {
      draw.bodies.splice(1, 1);
      draw.segJoints.splice(0, 2, link);
    } else {
      draw.bodies.splice(n - 2, 1);
      draw.segJoints.splice(n - 3, 2, link);
    }
  } else if (dL > 0 && len > 2 * ROPE_SPACING) {
    // Neue Perle zwischen Nagelperle und Nachbar, auf der Verbindungslinie.
    const a = draw.bodies[e];
    const b = draw.bodies[f];
    const pa = a.getPosition();
    const pb = b.getPosition();
    const t = (len - ROPE_SPACING) / len;
    const va = a.getLinearVelocity();
    const vb = b.getLinearVelocity();
    const meta = bodyMeta.get(b);
    const bead = makeRopeBead(world, pa.x + (pb.x - pa.x) * t, pa.y + (pb.y - pa.y) * t, draw.ropeId || (meta && meta.ropeId), track);
    bead.setLinearVelocity(V(va.x + (vb.x - va.x) * t, va.y + (vb.y - va.y) * t));
    if (seg0.dist) world.destroyJoint(seg0.dist);
    if (seg0.rope) world.destroyJoint(seg0.rope);
    if (atA) {
      const l0 = linkRopeSegment(world, a, bead, len - ROPE_SPACING);
      const l1 = linkRopeSegment(world, bead, b, ROPE_SPACING);
      draw.bodies.splice(1, 0, bead);
      draw.segJoints.splice(0, 1, l0, l1);
    } else {
      const l1 = linkRopeSegment(world, b, bead, ROPE_SPACING);
      const l0 = linkRopeSegment(world, bead, a, len - ROPE_SPACING);
      draw.bodies.splice(n - 1, 0, bead);
      draw.segJoints.splice(n - 2, 1, l1, l0);
    }
  } else {
    ropeSegSetLength(seg0, Math.max(0.02, len));
  }
  const delta = ropeSegSum(draw) - sumBefore;
  ropeSyncRest(draw, delta);
  return delta;
}

function winchParams() {
  const spool = tuneCode("winchSpool", WINCH_SPOOL_R);
  return {
    spool,
    speed: NAIL_MOTOR_SPEED * spool,
    minLen: tuneCode("winchMin", WINCH_MIN_LEN),
    maxFactor: tuneCode("winchMaxFactor", WINCH_MAX_FACTOR),
    maxPull: tuneCode("winchTorque", WINCH_TORQUE) / Math.max(0.01, spool),
  };
}

function pinReelsRope(pin) {
  if (!pin || !pin.motor) return false;
  return drawings.some((d) => d.kind === "rope" && (d.pinA === pin || d.pinB === pin));
}

// Vor jedem world.step: alle Seile an laufenden Motornägeln spulen.
function reelRopes(dt) {
  if (!world || !(dt > 0)) return;
  const prm = winchParams();
  for (const draw of drawings.slice()) {
    if (draw.kind !== "rope" || !draw.bodies || !draw.segJoints) continue;
    if (draw.drawnLength == null) draw.drawnLength = draw.restLength;
    draw.winch = null;
    for (const end of ["A", "B"]) {
      const pin = end === "A" ? draw.pinA : draw.pinB;
      if (!pin || !pin.motor) continue;
      if (draw.bodies.length < 2) continue;
      // Motor -1 = rechtsrum (im Uhrzeigersinn) = aufspulen.
      const dir = pin.motor < 0 ? -1 : 1;
      const maxLen = draw.drawnLength * prm.maxFactor;
      const minLen = Math.min(prm.minLen, draw.drawnLength);
      let want = dir * prm.speed * dt;
      if (dir < 0) want = Math.max(want, minLen - draw.restLength);
      else want = Math.min(want, maxLen - draw.restLength);
      const tension = ropeEndTension(draw, end, 1 / dt);
      let state = dir < 0 ? "in" : "out";
      if (Math.abs(want) < 1e-6) state = "limit";
      else if (dir < 0 && tension > prm.maxPull) state = "stall";
      draw.winch = { state, tension, pin };
      if (state === "in" || state === "out") reelRopeEnd(draw, end, want);
    }
  }
}
