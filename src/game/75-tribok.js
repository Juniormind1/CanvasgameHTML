const TREB_PIVOT_Y = 6.7;
const TREB_ARM_SHORT = 1.35;
const TREB_ARM_LONG = 4.7;
const TREB_ARM_THICK = 0.14;
const TREB_COCKED = -1.05;
const TREB_HOLD_DELAY = 0.7;
const TREB_BALL_R = 0.28;
const TREB_SLING_LEN = 1.42;
const TREB_SLING_RELEASE = 0;
const TREB_SLING_WOUND = -0.8;
const TREB_ARM_SAFETY = 1.35;
const TREB_VIEW_W = 36;
const TREB_VIEW_H = 16;
const TREB_VIEW_RIGHT = 4.5;
const TREB_POUCH_INNER = 0.7;
const TREB_POUCH_WALL = 0.09;
const TREB_POUCH_DEPTH = 0.52;
const TREB_POUCH_FLOOR = 0.1;
const TREB_LEATHER = "#7a4a2e";
const TREB_LEATHER_DARK = "#5a3220";
const TREB_CAT_GROUND = 0x0001;
const TREB_CAT_FRAME = 0x0002;
const TREB_CAT_ROPE = 0x0004;
const TREB_CAT_POUCH = 0x0008;
const TREB_CAT_BALL = 0x0010;

function setMapDemo(kind) {
  mapDemo = kind === "trebuchet" ? "trebuchet" : "cradle";
  if (mapDemo === "trebuchet") ensureTrebuchet();
  else endCradleDrag();
}

function mapDemoBandHit(sx, sy) {
  const band = mapFrame().cradle;
  return sx >= band.x && sx <= band.x + band.w && sy >= band.y && sy <= band.y + band.h;
}

function mapDemoToggleAt(sx, sy) {
  const band = mapFrame().cradle;
  if (sy < band.y || sy > band.y + 28 || sx < band.x + band.w - 160 || sx > band.x + band.w - 8) return null;
  const mid = band.x + band.w - 84;
  if (sx < mid) return "cradle";
  return "trebuchet";
}

function trebPin(body, lx, ly) {
  return { body, local: { x: lx, y: ly } };
}

function trebFinite(body) {
  if (!body) return false;
  const p = body.getPosition();
  const v = body.getLinearVelocity();
  return [p.x, p.y, v.x, v.y, body.getAngle(), body.getAngularVelocity()].every(Number.isFinite);
}

function trebFrameFix(extra) {
  return Object.assign({
    density: 0,
    friction: 0.7,
    restitution: 0,
    filterGroupIndex: -3,
    filterCategoryBits: TREB_CAT_FRAME,
    filterMaskBits: TREB_CAT_GROUND | TREB_CAT_FRAME,
  }, extra || {});
}

function trebPouchFix(density) {
  return {
    density: density,
    friction: 0.95,
    restitution: 0,
    filterGroupIndex: -4,
    filterCategoryBits: TREB_CAT_POUCH,
    filterMaskBits: TREB_CAT_GROUND | TREB_CAT_BALL,
  };
}

function trebStrandLen(strand) {
  if (!strand || !strand.anchorA || !strand.anchorB) return 0;
  const a = strand.anchorA.body.getWorldPoint(V(strand.anchorA.local.x, strand.anchorA.local.y));
  const b = strand.anchorB.body.getWorldPoint(V(strand.anchorB.local.x, strand.anchorB.local.y));
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function trebMakeStrand(pinA, pinB) {
  const a = pinWorld(pinA);
  const b = pinWorld(pinB);
  const length = Math.max(0.2, Math.hypot(b.x - a.x, b.y - a.y));
  const distJ = trebWorld.createJoint(new planck.DistanceJoint({
    bodyA: pinA.body,
    bodyB: pinB.body,
    localAnchorA: V(pinA.local.x, pinA.local.y),
    localAnchorB: V(pinB.local.x, pinB.local.y),
    length,
    frequencyHz: 0,
    dampingRatio: 0,
    collideConnected: false,
  }));
  const ropeJ = trebWorld.createJoint(new planck.RopeJoint({
    bodyA: pinA.body,
    bodyB: pinB.body,
    localAnchorA: V(pinA.local.x, pinA.local.y),
    localAnchorB: V(pinB.local.x, pinB.local.y),
    maxLength: length * ROPE_MAX_STRETCH,
    collideConnected: false,
  }));
  return { anchorA: pinA, anchorB: pinB, restLength: length, distJoint: distJ, ropeJoint: ropeJ };
}

function trebCockedTip() {
  return {
    x: TREB_ARM_LONG * Math.cos(TREB_COCKED),
    y: TREB_PIVOT_Y + TREB_ARM_LONG * Math.sin(TREB_COCKED),
  };
}

function trebPouchPose() {
  const tip = trebCockedTip();
  const half = TREB_POUCH_INNER / 2;
  const L = TREB_SLING_LEN;
  const reach = Math.sqrt(Math.max(1e-6, L * L - half * half));
  const minMouthY = 0.78;
  let mx;
  let my;
  if (tip.y - reach >= minMouthY) {
    mx = tip.x;
    my = tip.y - reach;
  } else {
    my = minMouthY;
    const dy = tip.y - my;
    mx = tip.x + Math.sqrt(Math.max(1e-6, reach * reach - dy * dy));
  }
  const tx = tip.x - mx;
  const ty = tip.y - my;
  const tlen = Math.hypot(tx, ty) || 1;
  const ux = tx / tlen;
  const uy = ty / tlen;
  const px = uy;
  const py = -ux;
  const angle = Math.atan2(py, px);
  function at(lx, ly) {
    return { x: mx + px * lx + ux * ly, y: my + py * lx + uy * ly };
  }
  return {
    tip,
    mx,
    my,
    angle,
    ux,
    uy,
    px,
    py,
    leftRim: at(-half, 0),
    rightRim: at(half, 0),
    bottom: at(0, -(TREB_POUCH_DEPTH - TREB_POUCH_FLOOR / 2)),
    leftWall: at(-half, -TREB_POUCH_DEPTH / 2),
    rightWall: at(half, -TREB_POUCH_DEPTH / 2),
    ball: at(0, -(TREB_POUCH_DEPTH - TREB_POUCH_FLOOR - TREB_BALL_R)),
  };
}

function trebMouthLocalY() {
  return TREB_POUCH_DEPTH - TREB_POUCH_FLOOR / 2;
}

function trebBallRestLocalY() {
  return TREB_POUCH_FLOOR / 2 + TREB_BALL_R;
}

function trebBallInPouch(slack) {
  if (!treb || !treb.ball || !treb.pouchBottom) return false;
  const pad = slack == null ? 0.2 : slack;
  const local = treb.pouchBottom.getLocalPoint(treb.ball.getPosition());
  const yRest = trebBallRestLocalY();
  const mouthY = trebMouthLocalY();
  if (Math.abs(local.x) > TREB_POUCH_INNER / 2 + TREB_BALL_R + pad) return false;
  if (local.y < -TREB_POUCH_FLOOR - pad) return false;
  if (local.y > mouthY + TREB_BALL_R + pad) return false;
  return Math.hypot(local.x, local.y - yRest) < TREB_POUCH_INNER + TREB_BALL_R + pad;
}

function keepBallInPouch() {
  if (!treb || !treb.hooked || !treb.ball || !treb.pouchBottom) return;
  const ball = treb.ball;
  const local = treb.pouchBottom.getLocalPoint(ball.getPosition());
  const yRest = trebBallRestLocalY();
  const mouthY = trebMouthLocalY();
  let x = local.x;
  let y = local.y;
  let fix = false;
  if (y < yRest - 0.05) {
    y = yRest;
    fix = true;
  }
  const wallX = TREB_POUCH_INNER / 2 + TREB_BALL_R * 0.2;
  if (y < mouthY && Math.abs(x) > wallX) {
    x = Math.sign(x) * wallX;
    fix = true;
  }
  if (!fix) return;
  const world = treb.pouchBottom.getWorldPoint(V(x, y));
  ball.setTransform(V(world.x, world.y), ball.getAngle());
  const pv = treb.pouchBottom.getLinearVelocityFromWorldPoint
    ? treb.pouchBottom.getLinearVelocityFromWorldPoint(V(world.x, world.y))
    : treb.pouchBottom.getLinearVelocity();
  const bv = ball.getLinearVelocity();
  ball.setLinearVelocity(V(pv.x + (bv.x - pv.x) * 0.2, pv.y + (bv.y - pv.y) * 0.2));
  ball.setAngularVelocity(treb.pouchBottom.getAngularVelocity());
}

function trebSlingArmRaw() {
  if (!treb || !treb.arm || !treb.pouchRight) return 0;
  const hook = treb.arm.getWorldPoint(V(treb.hookLocal.x, treb.hookLocal.y));
  const rim = treb.pouchRight.getWorldPoint(V(0, TREB_POUCH_DEPTH / 2));
  const sx = rim.x - hook.x;
  const sy = rim.y - hook.y;
  const ang = treb.arm.getAngle();
  const ax = Math.cos(ang);
  const ay = Math.sin(ang);
  return Math.atan2(ax * sy - ay * sx, ax * sx + ay * sy);
}

function trebSlingArmAngle() {
  const raw = trebSlingArmRaw();
  if (!treb) return raw;
  if (treb.lastRel == null) {
    treb.lastRel = raw;
    treb.slingAng = raw;
    return treb.slingAng;
  }
  let delta = raw - treb.lastRel;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  treb.slingAng = (treb.slingAng == null ? raw : treb.slingAng) + delta;
  treb.lastRel = raw;
  return treb.slingAng;
}

function tightenTrebStrands() {
  if (!treb) return;
  const crew = [treb.pouchBottom, treb.pouchLeft, treb.pouchRight, treb.ball];
  if (treb.hookRing && !treb.hooked) crew.push(treb.hookRing);
  function shift(body, mx, my, nx, ny) {
    if (!body || body === treb.arm || body === treb.frame) return;
    const q = body.getPosition();
    body.setPosition(V(q.x + mx, q.y + my));
    const v = body.getLinearVelocity();
    const sep = v.x * nx + v.y * ny;
    const along = mx * nx + my * ny;
    if (along < 0 && sep > 0) body.setLinearVelocity(V(v.x - sep * nx, v.y - sep * ny));
    if (along > 0 && sep < 0) body.setLinearVelocity(V(v.x - sep * nx, v.y - sep * ny));
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const strand of [treb.strandA, treb.strandB]) {
      if (!strand || !strand.restLength || !strand.anchorA || !strand.anchorB) continue;
      const live = trebStrandLen(strand);
      const maxL = strand.restLength * ROPE_MAX_STRETCH;
      if (live <= maxL) continue;
      const a = strand.anchorA.body.getWorldPoint(V(strand.anchorA.local.x, strand.anchorA.local.y));
      const b = strand.anchorB.body.getWorldPoint(V(strand.anchorB.local.x, strand.anchorB.local.y));
      const nx = (b.x - a.x) / live;
      const ny = (b.y - a.y) / live;
      const excess = live - strand.restLength;
      const bIsArm = strand.anchorB.body === treb.arm;
      if (bIsArm) {
        for (const body of crew) shift(body, nx * excess, ny * excess, nx, ny);
      } else {
        for (const body of crew) shift(body, nx * excess * 0.5, ny * excess * 0.5, nx, ny);
        shift(strand.anchorB.body, -nx * excess * 0.5, -ny * excess * 0.5, nx, ny);
      }
    }
  }
  for (const strand of [treb.strandA, treb.strandB]) {
    if (!strand || !strand.restLength) continue;
    treb.maxLive = Math.max(treb.maxLive, trebStrandLen(strand) / strand.restLength);
  }
}

function resetTrebuchet() {
  trebWorld = null;
  trebGround = null;
  treb = null;
  ensureTrebuchet();
}

function ensureTrebuchet() {
  if (trebWorld && treb) return;
  trebWorld = new planck.World(V(0, -24));
  trebGround = trebWorld.createBody();
  trebGround.createFixture(new planck.Edge(V(-200, 0), V(20, 0)), {
    friction: 0.55,
    restitution: 0,
    filterCategoryBits: TREB_CAT_GROUND,
    filterMaskBits: 0xffff,
  });
  const woodFix = trebFrameFix();
  const frame = trebWorld.createBody({ position: V(0, 0) });
  frame.createFixture(new planck.Box(2.4, 0.16, V(0, 0.16), 0), woodFix);
  frame.createFixture(new planck.Box(0.16, TREB_PIVOT_Y / 2, V(0, TREB_PIVOT_Y / 2), 0), woodFix);
  frame.createFixture(new planck.Box(0.14, 3.15, V(-1.2, 2.6), 0.48), woodFix);
  frame.createFixture(new planck.Box(0.14, 3.15, V(1.2, 2.6), -0.48), woodFix);

  const arm = trebWorld.createDynamicBody({
    position: V(0, TREB_PIVOT_Y),
    angle: TREB_COCKED,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.04,
  });
  const halfLen = (TREB_ARM_SHORT + TREB_ARM_LONG) / 2;
  const armOff = (TREB_ARM_LONG - TREB_ARM_SHORT) / 2;
  arm.createFixture(new planck.Box(halfLen, TREB_ARM_THICK, V(armOff, 0), 0), trebFrameFix({
    density: 1.4,
    friction: 0.62,
    restitution: 0,
  }));
  trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: frame,
    bodyB: arm,
    localAnchorA: V(0, TREB_PIVOT_Y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  const holdJoint = trebWorld.createJoint(new planck.WeldJoint({
    bodyA: frame,
    bodyB: arm,
    localAnchorA: V(0, TREB_PIVOT_Y),
    localAnchorB: V(0, 0),
    referenceAngle: TREB_COCKED,
    collideConnected: false,
  }));

  const tipS = arm.getWorldPoint(V(-TREB_ARM_SHORT, 0));
  const wh = 0.52;
  const ww = 0.48;
  const weight = trebWorld.createDynamicBody({
    position: V(tipS.x, tipS.y - wh - 0.1),
    angularDamping: 0.15,
    linearDamping: 0.02,
  });
  weight.createFixture(new planck.Box(ww, wh), trebFrameFix({
    density: 36,
    friction: 0.7,
    restitution: 0.05,
  }));
  trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: arm,
    bodyB: weight,
    localAnchorA: V(-TREB_ARM_SHORT, 0),
    localAnchorB: V(0, wh + 0.06),
    collideConnected: false,
  }));

  const pose = trebPouchPose();
  const pouchBottom = trebWorld.createDynamicBody({
    position: V(pose.bottom.x, pose.bottom.y),
    angle: pose.angle,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.08,
  });
  pouchBottom.createFixture(
    new planck.Box(TREB_POUCH_INNER / 2 + TREB_POUCH_WALL / 2, TREB_POUCH_FLOOR / 2),
    trebPouchFix(2.2)
  );
  const pouchLeft = trebWorld.createDynamicBody({
    position: V(pose.leftWall.x, pose.leftWall.y),
    angle: pose.angle,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.08,
  });
  pouchLeft.createFixture(
    new planck.Box(TREB_POUCH_WALL / 2, TREB_POUCH_DEPTH / 2),
    trebPouchFix(1.8)
  );
  const pouchRight = trebWorld.createDynamicBody({
    position: V(pose.rightWall.x, pose.rightWall.y),
    angle: pose.angle,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.08,
  });
  pouchRight.createFixture(
    new planck.Box(TREB_POUCH_WALL / 2, TREB_POUCH_DEPTH / 2),
    trebPouchFix(1.8)
  );
  trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pouchBottom,
    bodyB: pouchLeft,
    localAnchorA: V(-TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2),
    localAnchorB: V(0, -TREB_POUCH_DEPTH / 2 + TREB_POUCH_FLOOR / 2),
    enableLimit: true,
    lowerAngle: -2.4,
    upperAngle: 0.28,
    collideConnected: false,
  }));
  trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pouchBottom,
    bodyB: pouchRight,
    localAnchorA: V(TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2),
    localAnchorB: V(0, -TREB_POUCH_DEPTH / 2 + TREB_POUCH_FLOOR / 2),
    enableLimit: true,
    lowerAngle: -0.28,
    upperAngle: 2.4,
    collideConnected: false,
  }));
  const pouchWeldL = trebWorld.createJoint(new planck.WeldJoint({
    bodyA: pouchBottom,
    bodyB: pouchLeft,
    localAnchorA: V(-TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2),
    localAnchorB: V(0, -TREB_POUCH_DEPTH / 2 + TREB_POUCH_FLOOR / 2),
    collideConnected: false,
  }));
  const pouchWeldR = trebWorld.createJoint(new planck.WeldJoint({
    bodyA: pouchBottom,
    bodyB: pouchRight,
    localAnchorA: V(TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2),
    localAnchorB: V(0, -TREB_POUCH_DEPTH / 2 + TREB_POUCH_FLOOR / 2),
    collideConnected: false,
  }));

  const hookLocal = { x: TREB_ARM_LONG + 0.14, y: -0.05 };
  const fixedLocal = { x: TREB_ARM_LONG, y: 0.04 };
  const pinFixed = trebPin(arm, fixedLocal.x, fixedLocal.y);
  const pinHook = trebPin(arm, hookLocal.x, hookLocal.y);
  const pinPouchL = trebPin(pouchLeft, 0, TREB_POUCH_DEPTH / 2);
  const pinPouchR = trebPin(pouchRight, 0, TREB_POUCH_DEPTH / 2);
  const hookPos = pinWorld(pinHook);
  const hookRing = trebWorld.createDynamicBody({
    position: V(hookPos.x, hookPos.y),
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.02,
  });
  hookRing.createFixture(new planck.Circle(0.05), {
    density: 1.2,
    friction: 0,
    restitution: 0,
    filterCategoryBits: TREB_CAT_ROPE,
    filterMaskBits: 0,
  });
  const hookJoint = trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: arm,
    bodyB: hookRing,
    localAnchorA: V(hookLocal.x, hookLocal.y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  const pinRing = trebPin(hookRing, 0, 0);
  const strandA = trebMakeStrand(pinPouchL, pinFixed);
  const strandB = trebMakeStrand(pinPouchR, pinRing);

  const ball = trebWorld.createDynamicBody({
    position: V(pose.ball.x, pose.ball.y),
    bullet: true,
    linearDamping: 0.01,
    angularDamping: 0.02,
  });
  ball.createFixture(new planck.Circle(TREB_BALL_R), {
    density: 3.2,
    friction: 0.55,
    restitution: 0.08,
    filterCategoryBits: TREB_CAT_BALL,
    filterMaskBits: TREB_CAT_GROUND | TREB_CAT_POUCH,
  });

  treb = {
    frame,
    arm,
    weight,
    ball,
    holdJoint,
    pouchBottom,
    pouchLeft,
    pouchRight,
    pouchWeldL,
    pouchWeldR,
    strandA,
    strandB,
    hookRing,
    hookJoint,
    pinA: pinFixed,
    pinB: pinHook,
    hookLocal,
    fixedLocal,
    released: false,
    hooked: true,
    slingWound: false,
    holdTimer: 0,
    frozen: false,
    armOff,
    halfLen,
    ww,
    wh,
    exploded: false,
    maxBallX: ball.getPosition().x,
    minBallX: ball.getPosition().x,
    maxLive: 1,
    bestOut: 0,
    noSlip: false,
  };
  for (let i = 0; i < 12; i++) {
    trebWorld.step(1 / 60, 20, 16);
    keepBallInPouch();
    tightenTrebStrands();
  }
  treb.maxLive = 1;
  if (treb.ball) {
    const p = treb.ball.getPosition();
    treb.maxBallX = p.x;
    treb.minBallX = p.x;
    treb.ball.setLinearVelocity(V(0, 0));
    treb.ball.setAngularVelocity(0);
  }
  [pouchBottom, pouchLeft, pouchRight, arm, weight].forEach((body) => {
    if (!body) return;
    body.setLinearVelocity(V(0, 0));
    body.setAngularVelocity(0);
  });
  treb.lastRel = null;
  treb.slingAng = null;
}

function releaseTrebuchet() {
  if (!treb || !trebWorld || treb.released) return;
  if (trebWorld.isLocked && trebWorld.isLocked()) return;
  if (treb.holdJoint) {
    trebWorld.destroyJoint(treb.holdJoint);
    treb.holdJoint = null;
  }
  treb.released = true;
  treb.arm.setAwake(true);
  treb.weight.setAwake(true);
  if (treb.ball) treb.ball.setAwake(true);
  if (treb.pouchBottom) treb.pouchBottom.setAwake(true);
  if (treb.pouchLeft) treb.pouchLeft.setAwake(true);
  if (treb.pouchRight) treb.pouchRight.setAwake(true);
}

function slipTrebuchetHook() {
  if (!treb || !treb.hooked || !trebWorld) return;
  if (trebWorld.isLocked && trebWorld.isLocked()) return;
  if (treb.hookJoint) {
    trebWorld.destroyJoint(treb.hookJoint);
    treb.hookJoint = null;
  }
  if (treb.pouchWeldR) {
    trebWorld.destroyJoint(treb.pouchWeldR);
    treb.pouchWeldR = null;
  }
  if (treb.ball) {
    for (let f = treb.ball.getFixtureList(); f; f = f.getNext()) {
      if (f.setFilterData) {
        f.setFilterData({
          groupIndex: 0,
          categoryBits: TREB_CAT_BALL,
          maskBits: TREB_CAT_GROUND,
        });
      }
    }
  }
  const tip = treb.arm ? treb.arm.getWorldPoint(V(TREB_ARM_LONG, 0)) : { x: 0, y: 0 };
  const bp = treb.ball ? treb.ball.getPosition() : { x: 0, y: 0 };
  const bv = treb.ball ? treb.ball.getLinearVelocity() : { x: 0, y: 0 };
  treb.slipAng = treb.arm ? treb.arm.getAngle() : 0;
  treb.slipRel = trebSlingArmAngle();
  treb.slip = { x: bp.x, y: bp.y, vx: bv.x, vy: bv.y, tipX: tip.x, tipY: tip.y };
  treb.hooked = false;
}

function onTrebuchetClick() {
  ensureTrebuchet();
  if (!treb) return;
  if (!treb.released) releaseTrebuchet();
  else resetTrebuchet();
}

function stepTrebuchet(dt) {
  if (!trebWorld || !treb || treb.frozen) return;
  if (!treb.released) {
    treb.holdTimer += dt;
    if (treb.holdTimer >= TREB_HOLD_DELAY) releaseTrebuchet();
  }
  if (treb.released && treb.hooked) {
    const rel = trebSlingArmAngle();
    if (rel < TREB_SLING_WOUND) treb.slingWound = true;
    let ang = treb.arm.getAngle();
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    const bv = treb.ball.getLinearVelocity();
    const speed = Math.hypot(bv.x, bv.y);
    if (speed > treb.bestOut) treb.bestOut = speed;
    if (!treb.noSlip) {
      if (treb.slingWound && rel >= TREB_SLING_RELEASE) slipTrebuchetHook();
      else if (ang >= TREB_ARM_SAFETY) slipTrebuchetHook();
    }
  }
  tightenTrebStrands();
  trebWorld.step(dt, 24, 20);
  if (treb.hooked) keepBallInPouch();
  tightenTrebStrands();
  if (treb.hooked) keepBallInPouch();
  if (treb.ball) {
    const p = treb.ball.getPosition();
    treb.maxBallX = Math.max(treb.maxBallX, p.x);
    treb.minBallX = Math.min(treb.minBallX, p.x);
  }
  const pouchOk = [treb.pouchBottom, treb.pouchLeft, treb.pouchRight].every((b) => !b || trebFinite(b));
  if (![treb.arm, treb.weight, treb.ball].every(trebFinite) || !pouchOk) treb.exploded = true;
}

function trebuchetLayout() {
  ensureTrebuchet();
  const frame = mapFrame();
  const band = frame.cradle;
  const worldW = TREB_VIEW_W;
  const worldH = TREB_VIEW_H;
  const scale = Math.max(5, Math.min((band.w - 16) / worldW, (band.h - 36) / worldH));
  return {
    frame,
    band,
    scale,
    originX: band.x + band.w - 10 - TREB_VIEW_RIGHT * scale,
    originY: band.y + band.h - 10,
  };
}

function trebToScreen(x, y, lay) {
  const box = lay || trebuchetLayout();
  return { x: box.originX + x * box.scale, y: box.originY - y * box.scale };
}

function fillTrebPoly(pts, lay, fill, stroke, width) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  const s0 = trebToScreen(pts[0].x, pts[0].y, lay);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = trebToScreen(pts[i].x, pts[i].y, lay);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke || "#5c4632";
  ctx.lineWidth = width || 1.5;
  ctx.stroke();
}

function trebBoxPts(body, hx, hy, ox, oy, ang) {
  const ca = Math.cos(ang || 0);
  const sa = Math.sin(ang || 0);
  const corners = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  return corners.map(([x, y]) => {
    const lx = ox + x * ca - y * sa;
    const ly = oy + x * sa + y * ca;
    const p = body.getWorldPoint(V(lx, ly));
    return { x: p.x, y: p.y };
  });
}

function drawMapDemoToggle(band) {
  const x = band.x + band.w - 156;
  const y = band.y + 5;
  label("Pendel", x + 4, y, 14, mapDemo === "cradle" ? "#3a2a1c" : "#8a7b64");
  label("Tribok", x + 78, y, 14, mapDemo === "trebuchet" ? "#3a2a1c" : "#8a7b64");
}

function drawTrebStrand(strand, lay) {
  if (!strand || !strand.anchorA || !strand.anchorB) return;
  const a = strand.anchorA.body.getWorldPoint(V(strand.anchorA.local.x, strand.anchorA.local.y));
  const b = strand.anchorB.body.getWorldPoint(V(strand.anchorB.local.x, strand.anchorB.local.y));
  const s0 = trebToScreen(a.x, a.y, lay);
  const s1 = trebToScreen(b.x, b.y, lay);
  ctx.strokeStyle = MAT.hemp;
  ctx.lineWidth = Math.max(2, 0.16 * lay.scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y);
  ctx.lineTo(s1.x, s1.y);
  ctx.stroke();
}

function drawTrebPouch(lay) {
  if (!treb.pouchBottom || !treb.pouchLeft || !treb.pouchRight) return;
  fillTrebPoly(trebBoxPts(treb.pouchBottom, TREB_POUCH_INNER / 2 + TREB_POUCH_WALL / 2, TREB_POUCH_FLOOR / 2, 0, 0, 0), lay, TREB_LEATHER, TREB_LEATHER_DARK, 1.6);
  fillTrebPoly(trebBoxPts(treb.pouchLeft, TREB_POUCH_WALL / 2, TREB_POUCH_DEPTH / 2, 0, 0, 0), lay, TREB_LEATHER, TREB_LEATHER_DARK, 1.6);
  fillTrebPoly(trebBoxPts(treb.pouchRight, TREB_POUCH_WALL / 2, TREB_POUCH_DEPTH / 2, 0, 0, 0), lay, TREB_LEATHER, TREB_LEATHER_DARK, 1.6);
  const lTop = treb.pouchLeft.getWorldPoint(V(0, TREB_POUCH_DEPTH / 2));
  const rTop = treb.pouchRight.getWorldPoint(V(0, TREB_POUCH_DEPTH / 2));
  const lBot = treb.pouchBottom.getWorldPoint(V(-TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2));
  const rBot = treb.pouchBottom.getWorldPoint(V(TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2));
  const midBot = treb.pouchBottom.getWorldPoint(V(0, -TREB_POUCH_FLOOR / 2));
  const sL = trebToScreen(lTop.x, lTop.y, lay);
  const sLB = trebToScreen(lBot.x, lBot.y, lay);
  const sM = trebToScreen(midBot.x, midBot.y, lay);
  const sRB = trebToScreen(rBot.x, rBot.y, lay);
  const sR = trebToScreen(rTop.x, rTop.y, lay);
  ctx.beginPath();
  ctx.moveTo(sL.x, sL.y);
  ctx.lineTo(sLB.x, sLB.y);
  ctx.quadraticCurveTo(sM.x, sM.y, sRB.x, sRB.y);
  ctx.lineTo(sR.x, sR.y);
  ctx.strokeStyle = TREB_LEATHER_DARK;
  ctx.lineWidth = Math.max(2.2, 0.11 * lay.scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawTrebuchet() {
  const lay = trebuchetLayout();
  const band = lay.band;
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.fillStyle = "rgba(255,252,240,0.55)";
  ctx.fill();
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 2;
  ctx.stroke();
  const hint = !treb || !treb.released ? "Klick: Haltepin lösen" : "Klick: neu spannen";
  label(hint, band.x + 12, band.y + 6, band.w < 280 ? 13 : 15, "#5c4632");
  drawMapDemoToggle(band);
  if (!treb) return;
  ctx.save();
  ctx.beginPath();
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.clip();
  const g0 = trebToScreen(-(TREB_VIEW_W - TREB_VIEW_RIGHT), 0, lay);
  const g1 = trebToScreen(TREB_VIEW_RIGHT + 2, 0, lay);
  ctx.strokeStyle = "#d7c39a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.stroke();
  fillTrebPoly(trebBoxPts(treb.frame, 2.4, 0.16, 0, 0.16, 0), lay, MAT.wood, "#5c4632");
  fillTrebPoly(trebBoxPts(treb.frame, 0.16, TREB_PIVOT_Y / 2, 0, TREB_PIVOT_Y / 2, 0), lay, MAT.wood, "#5c4632");
  fillTrebPoly(trebBoxPts(treb.frame, 0.14, 3.15, -1.2, 2.6, 0.48), lay, MAT.wood, "#5c4632");
  fillTrebPoly(trebBoxPts(treb.frame, 0.14, 3.15, 1.2, 2.6, -0.48), lay, MAT.wood, "#5c4632");
  fillTrebPoly(trebBoxPts(treb.arm, treb.halfLen, TREB_ARM_THICK, treb.armOff, 0, 0), lay, MAT.wood, "#5c4632", 2);
  fillTrebPoly(trebBoxPts(treb.weight, treb.ww, treb.wh, 0, 0, 0), lay, MAT.wood, "#5c4632", 2);
  if (treb.arm && treb.hookLocal) {
    const hookBase = treb.arm.getWorldPoint(V(TREB_ARM_LONG, 0));
    const hookTip = treb.arm.getWorldPoint(V(treb.hookLocal.x + 0.06, treb.hookLocal.y - 0.06));
    const a = trebToScreen(hookBase.x, hookBase.y, lay);
    const b = trebToScreen(hookTip.x, hookTip.y, lay);
    ctx.strokeStyle = MAT.steel;
    ctx.lineWidth = Math.max(2, 0.07 * lay.scale);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = MAT.steel;
    ctx.beginPath();
    ctx.arc(b.x, b.y, Math.max(2.2, 0.055 * lay.scale), 0, Math.PI * 2);
    ctx.fill();
  }
  drawTrebStrand(treb.strandA, lay);
  drawTrebStrand(treb.strandB, lay);
  if (treb.hookRing) {
    const rp = treb.hookRing.getPosition();
    const rs = trebToScreen(rp.x, rp.y, lay);
    ctx.strokeStyle = MAT.steel;
    ctx.lineWidth = Math.max(1.4, 0.05 * lay.scale);
    ctx.beginPath();
    ctx.arc(rs.x, rs.y, Math.max(2.4, 0.07 * lay.scale), 0, Math.PI * 2);
    ctx.stroke();
  }
  drawTrebPouch(lay);
  if (treb.holdJoint) {
    const tip = treb.arm.getWorldPoint(V(TREB_ARM_LONG * 0.35, 0));
    const s = trebToScreen(tip.x, tip.y, lay);
    ctx.fillStyle = MAT.steel;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(3, 0.08 * lay.scale), 0, Math.PI * 2);
    ctx.fill();
  }
  const bp = treb.ball.getPosition();
  const bs = trebToScreen(bp.x, bp.y, lay);
  const rad = Math.max(4, TREB_BALL_R * lay.scale);
  ctx.beginPath();
  ctx.arc(bs.x, bs.y, rad, 0, Math.PI * 2);
  ctx.fillStyle = MAT.steel;
  ctx.fill();
  ctx.strokeStyle = MAT.steelDark;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  drawSteelMark(bs.x, bs.y, rad, treb.ball.getAngle(), false);
  ctx.save();
  ctx.beginPath();
  ctx.arc(bs.x, bs.y, rad, 0, Math.PI * 2);
  ctx.clip();
  fillSteelHighlight(bs.x - rad * 0.32, bs.y - rad * 0.35, rad);
  ctx.restore();
  const pivot = trebToScreen(0, TREB_PIVOT_Y, lay);
  ctx.fillStyle = "#5c4632";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, Math.max(3, 0.1 * lay.scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

