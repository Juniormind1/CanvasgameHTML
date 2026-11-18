// ---------------------------------------------------------------------------
// Umlenkrolle: Ein Seil, das von Nagel A über einen Nagel P zu Nagel B
// gezeichnet wird, läuft über P. P muss fest sitzen (Boden, statischer oder
// verankerter Körper). Das Seil besteht dann aus zwei Perlenketten (A–P und
// P–B, nur fürs Bild und für Stöße) und einem eigenen Joint zwischen den
// beiden Lastkörpern: lA + lB <= L (L = gezeichnete Seillänge), das Seil kann
// also über P von einer Seite auf die andere rutschen.
//
// Reibung nach der Seilreibungsformel (Euler-Eytelwein): Rutschen beginnt erst,
// wenn T_hoch / T_tief > e^(mu·Umschlingungswinkel).
// - Schlichter Nagel: mu = Tune "Nagelreibung" (Standard 0,3; bei 180° also
//   Faktor 2,57: 2 kg gegen 1 kg hält).
// - Motornagel im Stillstand: mu = 0, verlustfreie Umlenkrolle.
// - Laufender Motornagel: Treibscheibe. Das Seil läuft mit Windentempo von der
//   einen auf die andere Seite (beide Seiten sind dann eigene Seile mit
//   Länge s bzw. L - s); zu viel Zugunterschied bringt sie zum Stehen.
const PULLEY_MARGIN = 0.04;   // m, Perlenketten etwas länger als die Seilstrecke

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
  if (!a.body.isDynamic() && !b.body.isDynamic()) return null;
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
    } else {
      pul.drive = false;
      pul.sdot = 0;
      pul.state = "slide";
      pul.s = Math.max(f.lA, Math.min(pul.L - f.lB, pul.s));
      if (f.lA + f.lB >= pul.L) pul.s = f.lA;
    }
    // Rad der Umlenkrolle dreht mit dem Seil (Bildradius 0,16 m).
    pul.pin.rollAngle = (pul.pin.rollAngle || 0) + (pul.s - sPrev) * side / 0.16;
    // Perlenketten nur so lang, dass sie den Lastkörper nie halten.
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
