// Onager: ein Arm im gedrehten Hanfbündel, Lederschale, Querbalken.
// Die Sehne ist ein Drehmoment am vorhandenen Drehgelenk, nur in dieser Welt.
// Ruhelage liegt hinter dem Balken, das Revolute-Limit ist der Anschlag.
const ONAGER_PIVOT_Y = 1.62;
const ONAGER_ARM_LEN = 2.25;
const ONAGER_ARM_H = 0.1;
const ONAGER_COCKED = -0.4;
const ONAGER_STOP = 1.0;
const ONAGER_REST = 1.72;
const ONAGER_K = 170;
const ONAGER_C = 4;
const ONAGER_C_STOP = 48;
const ONAGER_HOLD_DELAY = 0.85;
const ONAGER_BALL_R = 0.2;
const ONAGER_VIEW_W = 9.2;
const ONAGER_VIEW_H = 4.8;
const ONAGER_VIEW_RIGHT = 3.15;
const ONAGER_CUP_X = 2.12;
const ONAGER_CUP_Y = 0.2;
const ONAGER_CUP_W = 0.3;
const ONAGER_CUP_H = 0.055;
const ONA_GROUND = 0x0001;
const ONA_ARM = 0x0002;
const ONA_BALL = 0x0004;
const ONA_LEATHER = "#7a4a2e";
const ONA_LEATHER_DARK = "#5a3220";

function onagerBallLocal() {
  return {
    x: ONAGER_CUP_X - 0.02,
    y: ONAGER_CUP_Y + ONAGER_CUP_H + ONAGER_BALL_R - 0.012,
  };
}

function onagerFinite(body) {
  if (!body) return false;
  const p = body.getPosition();
  const v = body.getLinearVelocity();
  return [p.x, p.y, v.x, v.y, body.getAngle(), body.getAngularVelocity()].every(Number.isFinite);
}

function onaArmFix(density) {
  return {
    density: density,
    friction: 0.85,
    restitution: 0,
    filterCategoryBits: ONA_ARM,
    filterMaskBits: ONA_BALL,
  };
}

function resetOnager() {
  onagerWorld = null;
  onager = null;
  ensureOnager();
}

function ensureOnager() {
  if (onagerWorld && onager) return;
  onagerWorld = new planck.World(V(0, -24));
  const ground = onagerWorld.createBody();
  ground.createFixture(new planck.Edge(V(-80, 0), V(20, 0)), {
    friction: 0.6,
    restitution: 0.05,
    filterCategoryBits: ONA_GROUND,
    filterMaskBits: ONA_BALL,
  });
  const frame = onagerWorld.createBody({ position: V(0, 0) });
  const arm = onagerWorld.createDynamicBody({
    position: V(0, ONAGER_PIVOT_Y),
    angle: ONAGER_COCKED,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.03,
    allowSleep: false,
  });
  arm.createFixture(new planck.Box(ONAGER_ARM_LEN / 2, ONAGER_ARM_H, V(ONAGER_ARM_LEN / 2, 0), 0), onaArmFix(2.1));
  arm.createFixture(new planck.Box(ONAGER_CUP_W, ONAGER_CUP_H, V(ONAGER_CUP_X, ONAGER_CUP_Y), 0), onaArmFix(1.4));
  arm.createFixture(new planck.Box(0.045, 0.13, V(ONAGER_CUP_X + ONAGER_CUP_W - 0.02, ONAGER_CUP_Y + 0.1), 0), onaArmFix(1.2));
  arm.createFixture(new planck.Box(0.04, 0.08, V(ONAGER_CUP_X - ONAGER_CUP_W + 0.02, ONAGER_CUP_Y + 0.07), 0), onaArmFix(1.2));
  onagerWorld.createJoint(new planck.RevoluteJoint({
    bodyA: frame,
    bodyB: arm,
    localAnchorA: V(0, ONAGER_PIVOT_Y),
    localAnchorB: V(0, 0),
    referenceAngle: 0,
    enableLimit: true,
    lowerAngle: ONAGER_COCKED - 0.05,
    upperAngle: ONAGER_STOP,
    collideConnected: false,
  }));
  const holdJoint = onagerWorld.createJoint(new planck.WeldJoint({
    bodyA: frame,
    bodyB: arm,
    localAnchorA: V(0, ONAGER_PIVOT_Y),
    localAnchorB: V(0, 0),
    referenceAngle: ONAGER_COCKED,
    collideConnected: false,
  }));
  const home = onagerBallLocal();
  const at = arm.getWorldPoint(V(home.x, home.y));
  const ball = onagerWorld.createDynamicBody({
    position: V(at.x, at.y),
    bullet: true,
    linearDamping: 0.01,
    angularDamping: 0.02,
    allowSleep: false,
  });
  ball.createFixture(new planck.Circle(ONAGER_BALL_R), {
    density: 2.4,
    friction: 0.35,
    restitution: 0.04,
    filterCategoryBits: ONA_BALL,
    filterMaskBits: ONA_ARM | ONA_GROUND,
  });
  onager = {
    frame,
    arm,
    ball,
    holdJoint,
    released: false,
    inCup: true,
    left: false,
    kick: null,
    holdTimer: 0,
    frozen: false,
    exploded: false,
    minX: at.x,
    startX: at.x,
  };
  for (let i = 0; i < 12; i++) onagerWorld.step(1 / 60, 16, 10);
  ball.setLinearVelocity(V(0, 0));
  ball.setAngularVelocity(0);
  arm.setLinearVelocity(V(0, 0));
  arm.setAngularVelocity(0);
  const settled = ball.getPosition();
  const local = arm.getLocalPoint(settled);
  onager.minX = settled.x;
  onager.startX = settled.x;
  onager.inCup = Math.hypot(local.x - home.x, local.y - home.y) < ONAGER_BALL_R + 0.28
    && local.y < home.y + ONAGER_BALL_R;
}

function releaseOnager() {
  if (!onager || !onagerWorld || onager.released) return;
  if (onagerWorld.isLocked && onagerWorld.isLocked()) return;
  if (onager.holdJoint) {
    onagerWorld.destroyJoint(onager.holdJoint);
    onager.holdJoint = null;
  }
  onager.released = true;
  onager.arm.setAwake(true);
  onager.ball.setAwake(true);
  const p = onager.ball.getPosition();
  onager.startX = p.x;
  onager.minX = p.x;
}

function onOnagerClick() {
  ensureOnager();
  if (!onager) return;
  if (!onager.released) releaseOnager();
  else resetOnager();
}

function stepOnager(dt) {
  if (!onagerWorld || !onager || onager.frozen) return;
  if (!onager.released) {
    onager.holdTimer += dt;
    if (onager.holdTimer >= ONAGER_HOLD_DELAY) releaseOnager();
  }
  if (onager.released && onager.arm) {
    const ang = onager.arm.getAngle();
    const w = onager.arm.getAngularVelocity();
    const damp = ang > ONAGER_STOP - 0.04 && w < 0 ? ONAGER_C_STOP : ONAGER_C;
    onager.arm.applyTorque(-ONAGER_K * (ang - ONAGER_REST) - damp * w, true);
  }
  onagerWorld.step(dt, 18, 12);
  if (!onager.ball || !onager.arm || !onagerFinite(onager.ball) || !onagerFinite(onager.arm)) {
    onager.exploded = true;
    return;
  }
  const p = onager.ball.getPosition();
  const v = onager.ball.getLinearVelocity();
  if (Math.hypot(v.x, v.y) > 80 || Math.abs(p.x) > 60 || Math.abs(p.y) > 40) onager.exploded = true;
  onager.minX = Math.min(onager.minX, p.x);
  const home = onagerBallLocal();
  const local = onager.arm.getLocalPoint(p);
  const inside = Math.hypot(local.x - home.x, local.y - home.y) < ONAGER_BALL_R + 0.22
    && local.y < home.y + ONAGER_BALL_R * 0.85;
  if (!onager.released) onager.inCup = inside;
  else if (onager.inCup && !inside && !onager.left) {
    onager.left = true;
    onager.kick = { vx: v.x, vy: v.y, ang: onager.arm.getAngle(), w: onager.arm.getAngularVelocity(), x: p.x, y: p.y };
  }
}

function onagerLayout() {
  ensureOnager();
  const frame = mapFrame();
  const band = frame.cradle;
  const head = mapDemoMetrics(band).head;
  const scale = Math.max(6, Math.min((band.w - 16) / ONAGER_VIEW_W, (band.h - head - 8) / ONAGER_VIEW_H));
  return {
    band,
    scale,
    originX: band.x + band.w - 10 - ONAGER_VIEW_RIGHT * scale,
    originY: band.y + band.h - 8,
  };
}

function onagerToScreen(x, y, lay) {
  const box = lay || onagerLayout();
  return { x: box.originX + x * box.scale, y: box.originY - y * box.scale };
}

function onaBoxPts(body, hx, hy, ox, oy, ang) {
  const ca = Math.cos(ang || 0);
  const sa = Math.sin(ang || 0);
  return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => {
    const lx = ox + x * ca - y * sa;
    const ly = oy + x * sa + y * ca;
    const p = body.getWorldPoint(V(lx, ly));
    return { x: p.x, y: p.y };
  });
}

function onaFill(pts, lay, fill, stroke) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  const s0 = onagerToScreen(pts[0].x, pts[0].y, lay);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = onagerToScreen(pts[i].x, pts[i].y, lay);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke || "#5c4632";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function onagerBeamWorld() {
  const t = ONAGER_ARM_LEN * 0.74;
  const face = ONAGER_ARM_H + 0.11;
  const c = Math.cos(ONAGER_STOP);
  const s = Math.sin(ONAGER_STOP);
  return { x: t * c - face * s, y: ONAGER_PIVOT_Y + t * s + face * c, ang: ONAGER_STOP };
}

function drawOnager() {
  const lay = onagerLayout();
  const band = lay.band;
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.fillStyle = "rgba(255,252,240,0.55)";
  ctx.fill();
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 2;
  ctx.stroke();
  const hint = !onager || !onager.released ? "Klick: Arm lösen" : "Klick: neu spannen";
  label(hint, band.x + 12, band.y + 3, 13, "#5c4632");
  if (!onager) {
    drawMapDemoToggle(band);
    return;
  }
  ctx.save();
  ctx.beginPath();
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.clip();
  const g0 = onagerToScreen(-(ONAGER_VIEW_W - ONAGER_VIEW_RIGHT), 0, lay);
  const g1 = onagerToScreen(ONAGER_VIEW_RIGHT + 0.4, 0, lay);
  ctx.strokeStyle = "#d7c39a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.stroke();
  const frame = onager.frame;
  onaFill(onaBoxPts(frame, 1.55, 0.13, 1.05, 0.13, 0), lay, MAT.wood, "#5c4632");
  onaFill(onaBoxPts(frame, 0.11, 0.85, 2.45, 0.95, 0), lay, MAT.wood, "#5c4632");
  onaFill(onaBoxPts(frame, 0.1, 1.05, -0.28, 1.15, 0), lay, MAT.wood, "#5c4632");
  onaFill(onaBoxPts(frame, 0.09, 0.85, 1.15, 1.35, -0.55), lay, MAT.wood, "#5c4632");
  const beam = onagerBeamWorld();
  onaFill(onaBoxPts(frame, 0.7, 0.1, beam.x, beam.y, beam.ang), lay, MAT.wood, "#5c4632");
  const pivot = onagerToScreen(0, ONAGER_PIVOT_Y, lay);
  const bundle = Math.max(7, 0.34 * lay.scale);
  ctx.fillStyle = MAT.hemp;
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, bundle, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8d7348";
  ctx.lineWidth = Math.max(1.2, bundle * 0.12);
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, bundle * (0.28 + i * 0.18), 0.4, 5.2);
    ctx.stroke();
  }
  onaFill(onaBoxPts(onager.arm, ONAGER_ARM_LEN / 2, ONAGER_ARM_H, ONAGER_ARM_LEN / 2, 0, 0), lay, MAT.wood, "#5c4632");
  onaFill(onaBoxPts(onager.arm, ONAGER_CUP_W, ONAGER_CUP_H, ONAGER_CUP_X, ONAGER_CUP_Y, 0), lay, ONA_LEATHER, ONA_LEATHER_DARK);
  onaFill(onaBoxPts(onager.arm, 0.045, 0.13, ONAGER_CUP_X + ONAGER_CUP_W - 0.02, ONAGER_CUP_Y + 0.1, 0), lay, ONA_LEATHER, ONA_LEATHER_DARK);
  onaFill(onaBoxPts(onager.arm, 0.04, 0.08, ONAGER_CUP_X - ONAGER_CUP_W + 0.02, ONAGER_CUP_Y + 0.07, 0), lay, ONA_LEATHER, ONA_LEATHER_DARK);
  if (onager.holdJoint) {
    const pin = onager.arm.getWorldPoint(V(ONAGER_ARM_LEN * 0.42, 0));
    const s = onagerToScreen(pin.x, pin.y, lay);
    ctx.fillStyle = MAT.steel;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(3, 0.07 * lay.scale), 0, Math.PI * 2);
    ctx.fill();
  }
  const bp = onager.ball.getPosition();
  const bs = onagerToScreen(bp.x, bp.y, lay);
  paintSteelBall(bs.x, bs.y, Math.max(4, ONAGER_BALL_R * lay.scale), onager.ball.getAngle());
  ctx.fillStyle = "#5c4632";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, Math.max(3, 0.08 * lay.scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawMapDemoToggle(band);
}
