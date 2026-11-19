// Doppelpendel: zwei Stangen, zwei Kugeln, zwei Drehgelenke. Die Bahn der
// unteren Kugel bleibt als Strich liegen. Ziehen fasst die getroffene Kugel.
const DP_L1 = 1.05;
const DP_L2 = 1.05;
const DP_R = 0.16;
const DP_A1 = 2.05;
const DP_A2 = -1.65;
const DP_TRAIL = 240;

function resetDouble() {
  endDoubleDrag();
  doubleWorld = null;
  doubleGround = null;
  doublePend = null;
  ensureDouble();
}

function dpFix() {
  return {
    density: 6.5,
    friction: 0.2,
    restitution: 0,
    filterGroupIndex: -6,
    filterCategoryBits: 0x0001,
    filterMaskBits: 0,
  };
}

function ensureDouble() {
  if (doubleWorld && doublePend) return;
  doubleWorld = new planck.World(V(0, -24));
  doubleGround = doubleWorld.createBody({ position: V(0, 0) });
  const upper = doubleWorld.createDynamicBody({
    position: V(0, 0),
    angle: DP_A1,
    allowSleep: false,
    linearDamping: 0.001,
    angularDamping: 0.001,
  });
  upper.createFixture(new planck.Circle(V(0, -DP_L1), DP_R), dpFix());
  doubleWorld.createJoint(new planck.RevoluteJoint({
    bodyA: doubleGround,
    bodyB: upper,
    localAnchorA: V(0, 0),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  const hinge = upper.getWorldPoint(V(0, -DP_L1));
  const lower = doubleWorld.createDynamicBody({
    position: V(hinge.x, hinge.y),
    angle: DP_A2,
    allowSleep: false,
    linearDamping: 0.001,
    angularDamping: 0.001,
  });
  lower.createFixture(new planck.Circle(V(0, -DP_L2), DP_R), dpFix());
  doubleWorld.createJoint(new planck.RevoluteJoint({
    bodyA: upper,
    bodyB: lower,
    localAnchorA: V(0, -DP_L1),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  doublePend = {
    upper,
    lower,
    trail: [],
    frozen: false,
    exploded: false,
  };
}

function doubleBobPoint(which) {
  if (!doublePend) return { x: 0, y: 0 };
  if (which === "upper") return doublePend.upper.getWorldPoint(V(0, -DP_L1));
  return doublePend.lower.getWorldPoint(V(0, -DP_L2));
}

function doubleEnergy() {
  const g = 24;
  let energy = 0;
  const bodies = doublePend ? [doublePend.upper, doublePend.lower] : [];
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const mass = body.getMass();
    const vel = body.getLinearVelocity();
    const center = body.getWorldCenter();
    energy += mass * g * center.y;
    energy += 0.5 * mass * (vel.x * vel.x + vel.y * vel.y);
    energy += 0.5 * body.getInertia() * body.getAngularVelocity() * body.getAngularVelocity();
  }
  return energy;
}

function doubleFinite() {
  if (!doublePend) return false;
  return [doublePend.upper, doublePend.lower].every((body) => {
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    return [p.x, p.y, v.x, v.y, body.getAngle(), body.getAngularVelocity()].every(Number.isFinite);
  });
}

function poseDouble(a1, a2) {
  if (!doublePend || !doublePend.upper || !doublePend.lower) return;
  endDoubleDrag();
  doublePend.upper.setTransform(V(0, 0), a1);
  const hinge = doublePend.upper.getWorldPoint(V(0, -DP_L1));
  doublePend.lower.setTransform(V(hinge.x, hinge.y), a2);
  doublePend.upper.setLinearVelocity(V(0, 0));
  doublePend.upper.setAngularVelocity(0);
  doublePend.lower.setLinearVelocity(V(0, 0));
  doublePend.lower.setAngularVelocity(0);
  doublePend.upper.setAwake(true);
  doublePend.lower.setAwake(true);
  doublePend.trail = [];
  doublePend.exploded = false;
}

function onDoubleClick() {
  resetDouble();
}

function beginDoubleDrag(which) {
  if (!doublePend || !doubleWorld || (doubleWorld.isLocked && doubleWorld.isLocked())) return false;
  endDoubleDrag();
  const body = which === "upper" ? doublePend.upper : doublePend.lower;
  const local = which === "upper" ? V(0, -DP_L1) : V(0, -DP_L2);
  const p = body.getWorldPoint(local);
  const joint = doubleWorld.createJoint(new planck.MouseJoint({
    bodyA: doubleGround,
    bodyB: body,
    target: V(p.x, p.y),
    maxForce: Math.max(120, body.getMass() * 900),
    frequencyHz: 7,
    dampingRatio: 0.85,
    collideConnected: false,
  }));
  doubleDrag = { which, joint, goal: { x: p.x, y: p.y } };
  return true;
}

function endDoubleDrag() {
  if (!doubleDrag) return;
  const drag = doubleDrag;
  doubleDrag = null;
  if (!doubleWorld || !drag.joint) return;
  if (doubleWorld.isLocked && doubleWorld.isLocked()) return;
  doubleWorld.destroyJoint(drag.joint);
  if (doublePend) {
    doublePend.upper.setAwake(true);
    doublePend.lower.setAwake(true);
  }
}

function doubleBobAt(sx, sy) {
  if (!doublePend) return null;
  const lay = doubleLayout();
  let best = null;
  let bestD = 1e9;
  for (const which of ["lower", "upper"]) {
    const p = doubleBobPoint(which);
    const s = doubleToScreen(p.x, p.y, lay);
    const hit = Math.max(DP_R * lay.scale * 1.5, 18);
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d <= hit && d < bestD) {
      best = which;
      bestD = d;
    }
  }
  return best;
}

function stepDouble(dt) {
  if (!doubleWorld || !doublePend || doublePend.frozen) return;
  if (doubleDrag && doubleDrag.joint) {
    doubleDrag.joint.setTarget(V(doubleDrag.goal.x, doubleDrag.goal.y));
  }
  const parts = dt > 1 / 90 ? 4 : 1;
  const h = dt / parts;
  for (let s = 0; s < parts; s++) doubleWorld.step(h, 16, 10);
  if (!doubleFinite()) {
    doublePend.exploded = true;
    return;
  }
  const tip = doubleBobPoint("lower");
  const trail = doublePend.trail;
  const prev = trail.length ? trail[trail.length - 1] : null;
  if (!prev || Math.hypot(tip.x - prev.x, tip.y - prev.y) > 0.03) {
    trail.push({ x: tip.x, y: tip.y });
    if (trail.length > DP_TRAIL) trail.shift();
  }
}

function doubleLayout() {
  ensureDouble();
  const frame = mapFrame();
  const band = frame.cradle;
  const head = mapDemoMetrics(band).head;
  const reach = DP_L1 + DP_L2 + DP_R + 0.12;
  const scale = Math.max(8, Math.min((band.w - 16) / (reach * 2), (band.h - head - 12) / (reach + 0.08)));
  return {
    band,
    scale,
    originX: band.x + band.w / 2,
    originY: band.y + head + 4,
  };
}

function doubleToScreen(x, y, lay) {
  const box = lay || doubleLayout();
  return { x: box.originX + x * box.scale, y: box.originY - y * box.scale };
}

function screenToDouble(sx, sy) {
  const lay = doubleLayout();
  return {
    x: (sx - lay.originX) / lay.scale,
    y: (lay.originY - sy) / lay.scale,
  };
}

function drawDouble() {
  const lay = doubleLayout();
  const band = lay.band;
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.fillStyle = "rgba(255,252,240,0.55)";
  ctx.fill();
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 2;
  ctx.stroke();
  label("Zieh eine Kugel. Klick setzt neu.", band.x + 12, band.y + 3, 13, "#5c4632");
  if (!doublePend) {
    drawMapDemoToggle(band);
    return;
  }
  ctx.save();
  ctx.beginPath();
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.clip();
  const trail = doublePend.trail;
  if (trail.length > 1) {
    ctx.beginPath();
    const s0 = doubleToScreen(trail[0].x, trail[0].y, lay);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < trail.length; i++) {
      const s = doubleToScreen(trail[i].x, trail[i].y, lay);
      ctx.lineTo(s.x, s.y);
    }
    ctx.strokeStyle = "rgba(92,83,72,0.55)";
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
  const hinge = doublePend.upper.getWorldPoint(V(0, -DP_L1));
  const tip = doublePend.lower.getWorldPoint(V(0, -DP_L2));
  const pivot = doubleToScreen(0, 0, lay);
  const hs = doubleToScreen(hinge.x, hinge.y, lay);
  const ts = doubleToScreen(tip.x, tip.y, lay);
  ctx.strokeStyle = "#8d5a34";
  ctx.lineWidth = Math.max(3, 0.07 * lay.scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(hs.x, hs.y);
  ctx.lineTo(ts.x, ts.y);
  ctx.stroke();
  ctx.fillStyle = "#5c4632";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, Math.max(3, 0.06 * lay.scale), 0, Math.PI * 2);
  ctx.fill();
  paintSteelBall(hs.x, hs.y, Math.max(5, DP_R * lay.scale), doublePend.upper.getAngle());
  paintSteelBall(ts.x, ts.y, Math.max(5, DP_R * lay.scale), doublePend.lower.getAngle());
  ctx.restore();
  drawMapDemoToggle(band);
}
