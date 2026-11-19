// ---------------------------------------------------------------------------
// Umlenkrolle: Ein Seil, das von Nagel A über einen Nagel P zu Nagel B
// gezeichnet wird, läuft über P. P muss fest sitzen (Boden, statischer oder
// verankerter Körper). Das Seil besteht aus zwei Perlenketten (A–P und P–B).
// Hängt an einem Ende eine bewegliche Last, trägt ein Joint zwischen den
// Lastkörpern: lA + lB <= L. Hängen beide Enden fest, bleibt die Summe der
// Ruhelängen L. Eine einzelne Last zieht die leere Seite stramm. Zwei Lasten
// gleichen den Durchhang an und kommen zur Ruhe.
//
// Reibung nach der Seilreibungsformel (Euler-Eytelwein): Rutschen beginnt erst,
// wenn T_hoch / T_tief > e^(mu·Umschlingungswinkel).
// - Schlichter Nagel: mu = Tune "Nagelreibung" (Standard 0,3; bei 180° also
//   Faktor 2,57: 2 kg gegen 1 kg hält).
// - Motornagel im Stillstand: mu = 0, verlustfreie Umlenkrolle.
// - Laufender Motornagel: Treibscheibe. Das Seil läuft mit Windentempo von der
//   einen auf die andere Seite (beide Seiten sind dann eigene Seile mit
//   Länge s bzw. L - s); zu viel Zugunterschied bringt sie zum Stehen.
const PULLEY_MARGIN = 0.04;    // m, Perlenketten etwas länger als die Seilstrecke
const PULLEY_LOAD_N = 8;       // N, darunter ist eine Seite unbelastet
const PULLEY_SLIDE_V = 2.2;    // m/s, leere Seite wird stramm gezogen
const PULLEY_BALANCE_V = 0.45; // m/s, zwei Lasten gleichen sich langsam an

function pulleyMu(pin) {
  if (pin && pin.isMotor) return 0;
  return Math.max(0, tuneCode("nailFriction", NAIL_ROPE_FRICTION));
}

function pulleyList() {
  const out = [];
  for (const d of drawings) {
    if (d.kind === "rope" && d.pulley && out.indexOf(d.pulley) < 0) out.push(d.pulley);
  }
  return out;
}

// Nagel, über den ein Zug von a nach b läuft: fester Nagel nah am Zug,
// nicht an dessen Enden. Liefert { pin, k } (k = nächster Zugpunkt) oder null.
function ropePulleyPin(ink, a, b) {
  if (!ink || ink.length < 5 || !a || !b) return null;
  if (a.body === b.body) return null;
  // Auch zwei feste Enden (Türme): das Seil läuft über P und fällt durch
  // dessen Körper, statt auf dem Turm liegen zu bleiben.
  const cum = [0];
  for (let i = 1; i < ink.length; i++) cum.push(cum[i - 1] + dist(ink[i - 1], ink[i]));
  const total = cum[cum.length - 1];
  let best = null;
  for (const pin of pins) {
    if (pin === a || pin === b || !pin.body || pin.body.isDynamic()) continue;
    const p = pinWorld(pin);
    for (let i = 1; i < ink.length - 1; i++) {
      if (cum[i] < 0.25 || total - cum[i] < 0.25) continue;
      const d = Math.hypot(ink[i].x - p.x, ink[i].y - p.y);
      if (d < NAIL_HIT && (!best || d < best.d)) best = { pin, k: i, d };
    }
  }
  return best;
}

function pulleyAnchor(body, local, c, a) {
  const lc = body.m_sweep.localCenter;
  const lx = local.x - lc.x;
  const ly = local.y - lc.y;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const rx = cs * lx - sn * ly;
  const ry = sn * lx + cs * ly;
  return { rx, ry, px: c.x + rx, py: c.y + ry };
}

// Lage beider Seiten aus den Löserpositionen.
function pulleyFrame(j, useSolver) {
  const d = j.cg;
  const A = j.m_bodyA;
  const B = j.m_bodyB;
  const P = pinWorld(d.pin);
  const ca = useSolver ? A.c_position.c : A.getWorldCenter();
  const aa = useSolver ? A.c_position.a : A.getAngle();
  const cb = useSolver ? B.c_position.c : B.getWorldCenter();
  const ab = useSolver ? B.c_position.a : B.getAngle();
  const gA = pulleyAnchor(A, j.m_localAnchorA, ca, aa);
  const gB = pulleyAnchor(B, j.m_localAnchorB, cb, ab);
  let uAx = gA.px - P.x;
  let uAy = gA.py - P.y;
  let uBx = gB.px - P.x;
  let uBy = gB.py - P.y;
  const lA = Math.hypot(uAx, uAy);
  const lB = Math.hypot(uBx, uBy);
  if (lA > 1e-4) { uAx /= lA; uAy /= lA; } else { uAx = 0; uAy = 0; }
  if (lB > 1e-4) { uBx /= lB; uBy /= lB; } else { uBx = 0; uBy = 0; }
  const cA = gA.rx * uAy - gA.ry * uAx;
  const cB = gB.rx * uBy - gB.ry * uBx;
  return {
    gA, gB, lA, lB, uAx, uAy, uBx, uBy,
    mA: A.m_invMass + A.m_invI * cA * cA,
    mB: B.m_invMass + B.m_invI * cB * cB,
  };
}

// Impulse (Seilzug × dt) auf beide Seiten: zieht den Körper zum Nagel hin.
function pulleyPush(j, f, impA, impB) {
  const A = j.m_bodyA;
  const B = j.m_bodyB;
  if (impA) {
    const px = -impA * f.uAx;
    const py = -impA * f.uAy;
    const v = A.c_velocity.v;
    v.x += A.m_invMass * px;
    v.y += A.m_invMass * py;
    A.c_velocity.w += A.m_invI * (f.gA.rx * py - f.gA.ry * px);
  }
  if (impB) {
    const px = -impB * f.uBx;
    const py = -impB * f.uBy;
    const v = B.c_velocity.v;
    v.x += B.m_invMass * px;
    v.y += B.m_invMass * py;
    B.c_velocity.w += B.m_invI * (f.gB.rx * py - f.gB.ry * px);
  }
}

// Geschwindigkeit, mit der sich die Seiten verlängern (>0 = weg vom Nagel).
function pulleyRates(j, f) {
  const A = j.m_bodyA;
  const B = j.m_bodyB;
  const va = A.c_velocity.v;
  const wa = A.c_velocity.w;
  const vb = B.c_velocity.v;
  const wb = B.c_velocity.w;
  const ra = f.uAx * (va.x - wa * f.gA.ry) + f.uAy * (va.y + wa * f.gA.rx);
  const rb = f.uBx * (vb.x - wb * f.gB.ry) + f.uBy * (vb.y + wb * f.gB.rx);
  return { ra, rb };
}

function pulleyInitVelocity(step) {
  const d = this.cg;
  const f = pulleyFrame(this, true);
  d.f = f;
  d.invDt = step.inv_dt;
  const mode = d.drive ? "drive" : "slide";
  if (mode !== d.solveMode) {
    d.iA = 0;
    d.iB = 0;
    d.iN = 0;
    d.iF = 0;
    d.solveMode = mode;
  }
  // Umschlingungswinkel: 180° minus Winkel zwischen den beiden Seiten.
  const cosAB = Math.max(-1, Math.min(1, f.uAx * f.uBx + f.uAy * f.uBy));
  d.wrap = Math.PI - Math.acos(cosAB);
  const E = Math.exp(d.mu * d.wrap);
  d.k = (E - 1) / (E + 1);
  if (step.warmStarting) {
    const r = step.dtRatio;
    d.iA *= r; d.iB *= r; d.iN *= r; d.iF *= r;
    if (mode === "drive") pulleyPush(this, f, d.iA, d.iB);
    else pulleyPush(this, f, d.iN + d.iF, d.iN - d.iF);
  } else {
    d.iA = 0; d.iB = 0; d.iN = 0; d.iF = 0;
  }
}

function pulleySolveVelocity(step) {
  const d = this.cg;
  const f = d.f;
  if (!f) return;
  if (d.solveMode === "drive") {
    // Zwei eigene Seile: lA <= s, lB <= L - s; s läuft mit d.sdot.
    let r = pulleyRates(this, f);
    if (f.mA > 0) {
      let cd = r.ra - d.sdot;
      const C = f.lA - d.s;
      if (C < 0) cd += C * d.invDt;
      const old = d.iA;
      d.iA = Math.max(0, old + cd / f.mA);
      pulleyPush(this, f, d.iA - old, 0);
    }
    r = pulleyRates(this, f);
    if (f.mB > 0) {
      let cd = r.rb + d.sdot;
      const C = f.lB - (d.L - d.s);
      if (C < 0) cd += C * d.invDt;
      const old = d.iB;
      d.iB = Math.max(0, old + cd / f.mB);
      pulleyPush(this, f, 0, d.iB - old);
    }
    return;
  }
  const K = f.mA + f.mB;
  if (!(K > 0)) return;
  // Reibung zuerst (wie bei Kontakten), begrenzt durch den Seilzug.
  if (d.k > 0) {
    const r = pulleyRates(this, f);
    const cf = r.ra - r.rb;
    const old = d.iF;
    const max = d.k * d.iN;
    d.iF = Math.max(-max, Math.min(max, old + cf / K));
    const dl = d.iF - old;
    if (dl) pulleyPush(this, f, dl, -dl);
  }
  const r = pulleyRates(this, f);
  let cn = r.ra + r.rb;
  const C = f.lA + f.lB - d.L;
  if (C < 0) cn += C * d.invDt;
  const old = d.iN;
  d.iN = Math.max(0, old + cn / K);
  const dl = d.iN - old;
  if (dl) pulleyPush(this, f, dl, dl);
}

function pulleyShift(body, g, ux, uy, imp) {
  const px = -imp * ux;
  const py = -imp * uy;
  const c = body.c_position.c;
  c.x += body.m_invMass * px;
  c.y += body.m_invMass * py;
  body.c_position.a += body.m_invI * (g.rx * py - g.ry * px);
}

function pulleySolvePosition(step) {
  const d = this.cg;
  const f = pulleyFrame(this, true);
  const slop = 0.005;
  const maxFix = 0.2;
  if (d.solveMode === "drive") {
    const eA = f.lA - d.s;
    const eB = f.lB - (d.L - d.s);
    if (eA > slop && f.mA > 0) pulleyShift(this.m_bodyA, f.gA, f.uAx, f.uAy, Math.min(eA - slop, maxFix) / f.mA);
    if (eB > slop && f.mB > 0) pulleyShift(this.m_bodyB, f.gB, f.uBx, f.uBy, Math.min(eB - slop, maxFix) / f.mB);
    return Math.max(eA, eB) < 3 * slop;
  }
  const C = f.lA + f.lB - d.L;
  const K = f.mA + f.mB;
  if (C <= slop || !(K > 0)) return true;
  const imp = Math.min(C - slop, maxFix) / K;
  pulleyShift(this.m_bodyA, f.gA, f.uAx, f.uAy, imp);
  pulleyShift(this.m_bodyB, f.gB, f.uBx, f.uBy, imp);
  return C < 3 * slop;
}

// Seilzug in N: die stärker gezogene Seite.
function pulleyTensions(pul) {
  const inv = pul.invDt || 60;
  if (pul.solveMode === "drive") return { a: pul.iA * inv, b: pul.iB * inv };
  return { a: (pul.iN + pul.iF) * inv, b: (pul.iN - pul.iF) * inv };
}

// Knick des Seils am Nagel: rechts herum (Uhrzeigersinn) = +1.
function pulleyWrapSign(pinA, pin, pinB) {
  const a = pinWorld(pinA);
  const p = pinWorld(pin);
  const b = pinWorld(pinB);
  const turn = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
  return turn > 0 ? -1 : 1;
}

function createPulleyJoint(targetWorld, pul) {
  const P = pinWorld(pul.pin);
  const a = pinWorld(pul.pinA);
  const b = pinWorld(pul.pinB);
  const j = new planck.PulleyJoint({ collideConnected: true }, pul.pinA.body, pul.pinB.body,
    V(P.x, P.y), V(P.x, P.y), V(a.x, a.y), V(b.x, b.y), 1);
  j.m_localAnchorA = V(pul.pinA.local.x, pul.pinA.local.y);
  j.m_localAnchorB = V(pul.pinB.local.x, pul.pinB.local.y);
  j.cg = pul;
  j.initVelocityConstraints = pulleyInitVelocity;
  j.solveVelocityConstraints = pulleySolveVelocity;
  j.solvePositionConstraints = pulleySolvePosition;
  j.getReactionForce = function (invDt) {
    const t = pulleyTensions(pul);
    return V(Math.max(t.a, t.b), 0);
  };
  j.getReactionTorque = function () { return 0; };
  return targetWorld.createJoint(j);
}

// Baut das Seil A–P–B. sideA/sideB sind gewöhnliche Seilzeichnungen ohne
// Sehne und ohne Spannjoint; die Last trägt der Umlenk-Joint.
function makePulley(targetWorld, sideA, sideB, pin, length, opt) {
  for (const side of [sideA, sideB]) {
    if (side.chordJoint && jointAlive(targetWorld, side.chordJoint)) targetWorld.destroyJoint(side.chordJoint);
    side.chordJoint = null;
    if (side.spanJoint && jointAlive(targetWorld, side.spanJoint)) targetWorld.destroyJoint(side.spanJoint);
    side.spanJoint = null;
    // Die Perlen hängen nicht an den Nägeln, sie werden nur an sie gesetzt
    // (tightenRopeDraw): sonst zöge die träge Kette mit an der Last.
    for (const ej of side.endJoints || []) {
      if (ej && jointAlive(targetWorld, ej)) targetWorld.destroyJoint(ej);
    }
    side.endJoints = [null, null];
  }
  const pul = {
    pin,
    pinA: sideA.pinA,
    pinB: sideB.pinB,
    sideA,
    sideB,
    L: length,
    s: (opt && opt.s != null) ? opt.s : sideA.restLength,
    wrapSign: (opt && opt.wrapSign) ? opt.wrapSign : pulleyWrapSign(sideA.pinA, pin, sideB.pinB),
    drive: false,
    sdot: 0,
    mu: pulleyMu(pin),
    iA: 0, iB: 0, iN: 0, iF: 0,
    solveMode: null,
    state: "slide",
    joint: null,
  };
  sideA.pulley = pul;
  sideB.pulley = pul;
  pul.joint = createPulleyJoint(targetWorld, pul);
  return pul;
}

function spawnPulleyRope(a, via, b, ink) {
  if (!world || !via) return null;
  const P = pinWorld(via.pin);
  const k = via.k;
  const ink1 = ink.slice(0, k).concat([{ x: P.x, y: P.y }]);
  const ink2 = [{ x: P.x, y: P.y }].concat(ink.slice(k + 1));
  if (ink1.length < 2 || ink2.length < 2) return null;
  const sideA = buildRope(world, a, via.pin, ink1, track);
  if (!sideA) return null;
  const sideB = buildRope(world, via.pin, b, ink2, track);
  if (!sideB) {
    drawings.push(sideA);
    destroyDrawing(sideA);
    return null;
  }
  drawings.push(sideA, sideB);
  const pul = makePulley(world, sideA, sideB, via.pin, sideA.restLength + sideB.restLength);
  stats.shapes += 1;
  stats.ropes += 1;
  return pul ? sideA : null;
}

// Seil von a nach b: läuft es über einen festen Nagel, wird es eine Umlenkung.
function spawnRopeVia(a, b, ink) {
  const via = ropePulleyPin(ink, a, b);
  if (via) {
    const r = spawnPulleyRope(a, via, b, ink);
    if (r) return r;
  }
  return spawnRope(a, b, ink);
}

// Beide Endnägel fest (Türme, Boden): der Joint zwischen ihnen bewegt nichts.
function pulleyEndsFixed(pul) {
  const a = pul && pul.pinA && pul.pinA.body;
  const b = pul && pul.pinB && pul.pinB.body;
  if (!a || !b || typeof a.isDynamic !== "function") return false;
  return !a.isDynamic() && !b.isDynamic();
}

// Richtung, in der die Kette den Umlenknagel verlässt ("A" oder "B" an der Rolle).
function pulleyDeparture(side, atPulley) {
  const bodies = side && side.bodies;
  if (!bodies || bodies.length < 2) return null;
  const atB = atPulley === "B";
  const pinBead = bodies[atB ? bodies.length - 1 : 0];
  const next = bodies[atB ? bodies.length - 2 : 1];
  if (!pinBead || !next || typeof pinBead.getPosition !== "function") return null;
  const a = pinBead.getPosition();
  const b = next.getPosition();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.02) return null;
  return { x: dx / d, y: dy / d };
}

// Umschlingung aus den Ketten, nicht aus der geraden Nagelverbindung: ein
// durchhängendes Seil liegt am Nagel um, auch wenn die Endnägel auf einer Höhe sind.
function pulleyHangWrap(pul, f) {
  const da = pulleyDeparture(pul.sideA, "B");
  const db = pulleyDeparture(pul.sideB, "A");
  if (da && db) {
    const cos = Math.max(-1, Math.min(1, da.x * db.x + da.y * db.y));
    return Math.PI - Math.acos(cos);
  }
  const cosAB = Math.max(-1, Math.min(1, f.uAx * f.uBx + f.uAy * f.uBy));
  return Math.PI - Math.acos(cosAB);
}

// Gewicht der Körper, die auf dieser Seite liegen, in N. Boden, Pfosten und
// die Perlen selbst zählen nicht: ein leeres Seil soll sich nicht selbst ziehen.
function pulleySideWeight(side) {
  if (!side || !side.bodies || !world) return 0;
  const g = world.getGravity ? world.getGravity() : null;
  const grav = g ? Math.abs(g.y) : 0;
  if (!(grav > 0)) return 0;
  const beads = side.bodies;
  let weight = 0;
  const seen = [];
  for (let c = world.getContactList(); c; c = c.getNext()) {
    if (!c.isTouching()) continue;
    const ba = c.getFixtureA().getBody();
    const bb = c.getFixtureB().getBody();
    let other = null;
    if (beads.indexOf(ba) >= 0) other = bb;
    else if (beads.indexOf(bb) >= 0) other = ba;
    if (!other || typeof other.isDynamic !== "function" || !other.isDynamic()) continue;
    if (seen.indexOf(other) >= 0) continue;
    const meta = bodyMeta.get(other);
    if (meta && (meta.kind === "rope" || meta.kind === "level" || meta.kind === "rocket")) continue;
    seen.push(other);
    weight += other.getMass() * grav;
  }
  return weight;
}

// Zug aus Gewicht und Durchhang. Ein tiefer Bauch trägt die Last mit wenig Zug,
// ein fast gerades Seil mit viel Zug. Die Gelenkkraft am Rollenende taugt nicht:
// sie bleibt bei den leichten Perlen hängen und sieht die Kugel nicht.
function pulleyHangTension(side, weight) {
  const bodies = side && side.bodies;
  if (!bodies || bodies.length < 2 || !(weight > 0)) return 0;
  let low = null;
  for (let i = 0; i < bodies.length; i++) {
    const p = bodies[i].getPosition();
    if (!low || p.y < low.y) low = p;
  }
  const ends = [bodies[0].getPosition(), bodies[bodies.length - 1].getPosition()];
  let sines = 0;
  for (let i = 0; i < ends.length; i++) {
    const e = ends[i];
    const dx = e.x - low.x;
    const dy = e.y - low.y;
    const d = Math.hypot(dx, dy) || 1;
    sines += Math.max(0, dy / d);
  }
  return weight / Math.max(0.18, sines);
}

// Länge von der Geberseite auf die Nehmerseite schieben. Geberende ist der
// Nagel an der Rolle, damit das Seil dort über die Rolle läuft.
function pulleyShiftLength(from, fromEnd, to, toEnd, amount) {
  if (!(amount > 1e-5) || !from || !to) return 0;
  if (!from.bodies || from.bodies.length < 2 || !to.bodies || to.bodies.length < 2) return 0;
  const delta = reelRopeEnd(from, fromEnd, -amount);
  const moved = -delta;
  if (moved > 1e-5) reelRopeEnd(to, toEnd, moved);
  return moved > 0 ? moved : 0;
}

// Feste Enden. Eine einzelne Last zieht die leere Seite stramm. Zwei Lasten
// schieben Länge nur, solange der Durchhang den Zug nicht ausgleicht, und
// lassen auf beiden Seiten Seil übrig. Ohne Last bleibt die gezeichnete Verteilung.
function pulleySlideFixed(pul, dt, f) {
  const sideA = pul.sideA;
  const sideB = pul.sideB;
  if (!sideA || !sideB) return;
  const rawA = pulleySideWeight(sideA);
  const rawB = pulleySideWeight(sideB);
  const blend = Math.min(1, Math.max(0, dt) * 4);
  pul.wA = pul.wA == null ? rawA : pul.wA + (rawA - pul.wA) * blend;
  pul.wB = pul.wB == null ? rawB : pul.wB + (rawB - pul.wB) * blend;
  const wA = pul.wA;
  const wB = pul.wB;
  pul.loadA = wA;
  pul.loadB = wB;
  const wrap = pulleyHangWrap(pul, f);
  pul.wrap = wrap;
  if (wA < PULLEY_LOAD_N && wB < PULLEY_LOAD_N) return;
  const minA = Math.max(0.2, f.lA);
  const minB = Math.max(0.2, f.lB);
  const slackA = sideA.restLength - minA;
  const slackB = sideB.restLength - minB;
  const one = (wA >= PULLEY_LOAD_N) !== (wB >= PULLEY_LOAD_N);
  let moved = 0;
  if (one) {
    if (wA >= PULLEY_LOAD_N && slackB > 0.08) {
      const give = Math.min(slackB - 0.04, PULLEY_SLIDE_V * dt);
      moved = pulleyShiftLength(sideB, "A", sideA, "B", give);
    } else if (wB >= PULLEY_LOAD_N && slackA > 0.08) {
      const give = Math.min(slackA - 0.04, PULLEY_SLIDE_V * dt);
      moved = pulleyShiftLength(sideA, "B", sideB, "A", give);
    }
  } else {
    const tA = pulleyHangTension(sideA, wA);
    const tB = pulleyHangTension(sideB, wB);
    pul.tenA = tA;
    pul.tenB = tB;
    const E = Math.exp(Math.max(0, pul.mu || 0) * wrap);
    const band = Math.max(40, 0.2 * Math.max(tA, tB));
    if (tA > tB * E + band && slackB > 0.25) {
      const v = Math.min(PULLEY_BALANCE_V, (tA - tB * E) * 0.0015);
      const give = Math.min(slackB - 0.2, Math.max(0, v) * dt);
      moved = pulleyShiftLength(sideB, "A", sideA, "B", give);
    } else if (tB > tA * E + band && slackA > 0.25) {
      const v = Math.min(PULLEY_BALANCE_V, (tB - tA * E) * 0.0015);
      const give = Math.min(slackA - 0.2, Math.max(0, v) * dt);
      moved = pulleyShiftLength(sideA, "B", sideB, "A", give);
    }
  }
  if (moved) pul.s = sideA.restLength;
}

// Eine Last auf einem Seil zwischen festen Nägeln soll liegen bleiben.
// Die Perlen sind viel leichter als die Kugel; der Löser und die Längenkorrektur
// stoßen sie sonst jeden Schritt neu an. Hier wird sie aus den Perlen geschoben
// und ihre Geschwindigkeit in das Seil hinein weggenommen.
function settlePulleyRiders() {
  if (!world) return;
  const beadSet = new Set();
  for (const pul of pulleyList()) {
    if (!pulleyEndsFixed(pul) || pul.drive) continue;
    for (const side of [pul.sideA, pul.sideB]) {
      const bodies = side && side.bodies;
      if (!bodies) continue;
      for (let i = 0; i < bodies.length; i++) beadSet.add(bodies[i]);
    }
  }
  if (!beadSet.size) return;
  const riders = new Map();
  for (let c = world.getContactList(); c; c = c.getNext()) {
    if (!c.isTouching()) continue;
    const ba = c.getFixtureA().getBody();
    const bb = c.getFixtureB().getBody();
    let bead = null;
    let rider = null;
    let beadIsA = false;
    if (beadSet.has(ba)) { bead = ba; rider = bb; beadIsA = true; }
    else if (beadSet.has(bb)) { bead = bb; rider = ba; }
    else continue;
    if (!rider.isDynamic() || dragBodyHot(rider)) continue;
    const meta = bodyMeta.get(rider);
    if (meta && (meta.kind === "rope" || meta.kind === "level" || meta.kind === "rocket")) continue;
    const wm = c.getWorldManifold && c.getWorldManifold();
    let nx = 0;
    let ny = 1;
    let push = 0;
    if (wm && wm.normal) {
      nx = wm.normal.x;
      ny = wm.normal.y;
      if (!beadIsA) { nx = -nx; ny = -ny; }
      const seps = wm.separations || [];
      const n = wm.pointCount || 0;
      for (let i = 0; i < n; i++) {
        const s = seps[i] || 0;
        if (s < push) push = s;
      }
    }
    const prev = riders.get(rider);
    if (!prev) riders.set(rider, { nx, ny, push });
    else {
      prev.nx += nx;
      prev.ny += ny;
      if (push < prev.push) prev.push = push;
    }
    bead.setLinearVelocity(V(0, 0));
    bead.setAngularVelocity(0);
  }
  riders.forEach((info, rider) => {
    const len = Math.hypot(info.nx, info.ny) || 1;
    const nx = info.nx / len;
    const ny = info.ny / len;
    if (info.push < -1e-4) {
      const p = rider.getPosition();
      const out = Math.min(0.04, -info.push);
      rider.setTransform(V(p.x + nx * out, p.y + ny * out), rider.getAngle());
    }
    const v = rider.getLinearVelocity();
    const vn = v.x * nx + v.y * ny;
    let vx = v.x;
    let vy = v.y;
    if (vn < 0) { vx -= vn * nx; vy -= vn * ny; }
    vx *= 0.5;
    vy *= 0.5;
    if (Math.hypot(vx, vy) < 0.85) { vx = 0; vy = 0; }
    rider.setLinearVelocity(V(vx, vy));
    const spin = rider.getAngularVelocity();
    rider.setAngularVelocity(Math.abs(spin) < 0.8 ? 0 : spin * 0.5);
  });
}

// Radieren einer Hälfte löscht das ganze Seil. Schneiden und Nagelziehen
// laufen weiter über dissolvePulley und lassen die andere Seite als Seil stehen.
function destroyPulleyRope(pul) {
  if (!pul || pul.dead) return;
  pul.dead = true;
  if (pul.joint && world && jointAlive(world, pul.joint)) world.destroyJoint(pul.joint);
  pul.joint = null;
  const sides = [pul.sideA, pul.sideB];
  for (const side of sides) {
    if (side && side.pulley === pul) side.pulley = null;
  }
  for (const side of sides) {
    if (!side || drawings.indexOf(side) < 0) continue;
    destroyDrawing(side);
  }
}

// Umlenkung auflösen (Seil geschnitten, Nagel gezogen, Körper gelöscht): die
// Seiten werden gewöhnliche Seile mit eigener Sehne.
function dissolvePulley(pul) {
  if (!pul || pul.dead) return;
  pul.dead = true;
  if (pul.joint && world && jointAlive(world, pul.joint)) world.destroyJoint(pul.joint);
  pul.joint = null;
  for (const side of [pul.sideA, pul.sideB]) {
    if (!side || side.pulley !== pul) continue;
    side.pulley = null;
    if (!world || drawings.indexOf(side) < 0 || !side.bodies || side.bodies.length < 2) continue;
    const ends = side.endJoints || [null, null];
    if (!ends[0] && !ends[1]) side.endJoints = attachRopePins(world, side.pinA, side.pinB, side.bodies);
    if (!side.chordJoint && side.pinA && side.pinB) {
      side.chordJoint = createRopeChord(world, side.pinA, side.pinB, side.restLength);
    }
  }
}

function dissolvePulleysAt(pin) {
  for (const pul of pulleyList()) {
    if (pul.pin === pin || pul.pinA === pin || pul.pinB === pin) dissolvePulley(pul);
  }
}

// Vor jedem world.step: Modus (Rolle/Treibscheibe), Seillage s, Perlenketten.
function pulleyPreStep(dt) {
  for (const pul of pulleyList()) {
    if (!pul.joint || !jointAlive(world, pul.joint) || pins.indexOf(pul.pin) < 0) {
      dissolvePulley(pul);
      continue;
    }
    const f = pulleyFrame(pul.joint, false);
    pul.mu = pulleyMu(pul.pin);
    const slack = Math.max(0, pul.L - f.lA - f.lB);
    // Umschlingungssinn (beim Zeichnen festgelegt): +1 = von A im
    // Uhrzeigersinn über den Nagel nach B. Dreht die Rolle rechtsrum (Motor
    // -1), läuft das Seil dann von A nach B: Seite A wird kürzer.
    const side = pul.wrapSign || 1;
    const sPrev = pul.s;
    const motor = pul.pin.motor || 0;
    if (motor) {
      const prm = winchParams();
      if (!pul.drive) {
        pul.s = Math.max(0, Math.min(pul.L, f.lA + slack / 2));
        pul.drive = true;
      }
      // sdot > 0: Seite A wird länger.
      let sdot = side * motor * prm.speed;
      const minLen = prm.minLen;
      if (sdot < 0 && pul.s + sdot * dt < minLen) sdot = Math.min(0, (minLen - pul.s) / dt);
      if (sdot > 0 && pul.s + sdot * dt > pul.L - minLen) sdot = Math.max(0, (pul.L - minLen - pul.s) / dt);
      const t = pulleyTensions(pul);
      const against = sdot < 0 ? t.a - t.b : t.b - t.a;
      pul.state = Math.abs(sdot) < 1e-6 ? "limit" : (against > prm.maxPull ? "stall" : "drive");
      if (pul.state !== "drive") sdot = 0;
      pul.sdot = sdot;
      pul.s += sdot * dt;
    } else if (pulleyEndsFixed(pul)) {
      // Die Ketten sind das Seil. Länge wandert nur, wenn eine Seite Last trägt.
      pul.drive = false;
      pul.sdot = 0;
      pul.state = "slide";
      pulleySlideFixed(pul, dt, f);
    } else {
      pul.drive = false;
      pul.sdot = 0;
      pul.state = "slide";
      pul.s = Math.max(f.lA, Math.min(pul.L - f.lB, pul.s));
      if (f.lA + f.lB >= pul.L) pul.s = f.lA;
    }
    // Rad der Umlenkrolle dreht mit dem Seil (Bildradius 0,16 m).
    pul.pin.rollAngle = (pul.pin.rollAngle || 0) + (pul.s - sPrev) * side / 0.16;
    // Bewegliche Lasten: Perlenketten nur so lang, dass sie den Lastkörper nie halten.
    // Feste Enden: die Kettenlänge ist die Seillänge und bleibt, außer sie rutscht.
    if (pulleyEndsFixed(pul) && !pul.drive) continue;
    const va = pul.pinA.body.isDynamic() ? velocityAt(pul.pinA.body, f.gA.px, f.gA.py) : { x: 0, y: 0 };
    const vb = pul.pinB.body.isDynamic() ? velocityAt(pul.pinB.body, f.gB.px, f.gB.py) : { x: 0, y: 0 };
    const m = PULLEY_MARGIN + 3 * dt * Math.max(Math.hypot(va.x, va.y), Math.hypot(vb.x, vb.y));
    let wantA;
    let wantB;
    if (pul.drive) {
      wantA = Math.max(pul.s, f.lA) + m;
      wantB = Math.max(pul.L - pul.s, f.lB) + m;
    } else {
      const tot = pul.L + 2 * m;
      const lo = f.lA + m;
      const hi = tot - (f.lB + m);
      if (lo > hi) {
        wantA = lo;
        wantB = f.lB + m;
      } else {
        wantA = Math.max(lo, Math.min(hi, pul.sideA.restLength));
        wantB = tot - wantA;
      }
    }
    if (Math.abs(wantA - pul.sideA.restLength) > 1e-4 && pul.sideA.bodies.length >= 2) reelRopeEnd(pul.sideA, "B", wantA - pul.sideA.restLength);
    if (Math.abs(wantB - pul.sideB.restLength) > 1e-4 && pul.sideB.bodies.length >= 2) reelRopeEnd(pul.sideB, "A", wantB - pul.sideB.restLength);
  }
}
