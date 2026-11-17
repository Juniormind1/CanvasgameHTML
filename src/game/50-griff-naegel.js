const NAIL_MOTOR_SPEED = Math.PI / 2;
const NAIL_MOTOR_TORQUE = 8000;
const NAIL_HIT = 0.32;

function applyNailMotor(pin) {
  if (!pin) return;
  const mode = pin.motor || 0;
  const on = mode !== 0;
  const speed = mode * NAIL_MOTOR_SPEED;
  for (const j of pin.joints) {
    if (!j) continue;
    j.enableMotor(on);
    if (on) {
      j.setMotorSpeed(speed);
      j.setMaxMotorTorque(NAIL_MOTOR_TORQUE);
    }
  }
}

function cycleNailMotor(pin) {
  if (!pin) return 0;
  const cur = pin.motor || 0;
  pin.motor = cur === 0 ? 1 : cur === 1 ? -1 : 0;
  applyNailMotor(pin);
  return pin.motor;
}

function hingeWorldPoints(body) {
  const pts = [];
  for (const pin of pins) {
    for (const j of pin.joints) {
      if (!j) continue;
      if (j.getBodyA() !== body && j.getBodyB() !== body) continue;
      const wp = pinWorld(pin);
      if (pts.some((p) => Math.hypot(p.x - wp.x, p.y - wp.y) < 0.05)) continue;
      pts.push({ x: wp.x, y: wp.y, pin });
      break;
    }
  }
  return pts;
}

function constrainNailedGoal(body, goal) {
  if (!playDrag) return null;
  const hinges = hingeWorldPoints(body);
  if (hinges.length >= 2) {
    const g = body.getWorldPoint(V(playDrag.local.x, playDrag.local.y));
    return { x: g.x, y: g.y, hinges };
  }
  if (hinges.length === 1) {
    const p = hinges[0];
    const grab = body.getWorldPoint(V(playDrag.local.x, playDrag.local.y));
    const r = Math.hypot(grab.x - p.x, grab.y - p.y);
    if (r < 0.02) return { x: p.x, y: p.y, hinges };
    const dx = goal.x - p.x;
    const dy = goal.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / d * r, y: p.y + dy / d * r, hinges };
  }
  return null;
}

function dragGoalVelocity(dt) {
  if (!playDrag || !playDrag.prevGoal) return { x: 0, y: 0 };
  const stepDt = dt > 1e-8 ? dt : 1 / 60;
  let vx = (playDrag.goal.x - playDrag.prevGoal.x) / stepDt;
  let vy = (playDrag.goal.y - playDrag.prevGoal.y) / stepDt;
  const speed = Math.hypot(vx, vy);
  const maxV = tuneCode("dragMaxV", DRAG_MAX_V);
  if (speed > maxV && speed > 1e-12) {
    vx *= maxV / speed;
    vy *= maxV / speed;
  }
  return { x: vx, y: vy };
}

function applyDragPivotImpulse(body, offx, offy, dt) {
  const goalV = dragGoalVelocity(dt);
  const lastV = playDrag.lastGoalV || { x: 0, y: 0 };
  const dvx = goalV.x - lastV.x;
  const dvy = goalV.y - lastV.y;
  const mass = Math.max(1e-6, body.getMass());
  const inertia = Math.max(1e-6, body.getInertia());
  const pivotI = inertia + mass * (offx * offx + offy * offy);
  const w = body.getAngularVelocity() + mass * (offy * dvx - offx * dvy) / pivotI;
  body.setAngularVelocity(w);
  body.setLinearVelocity(V(-w * offy, w * offx));
  playDrag.lastGoalV = { x: goalV.x, y: goalV.y };
}

function restDragAboutGrab(body, offx, offy) {
  const w = body.getAngularVelocity();
  body.setLinearVelocity(V(-w * offy, w * offx));
}

function clampDragFollow(body) {
  const anchor = body.getWorldPoint(V(playDrag.local.x, playDrag.local.y));
  const com = body.getPosition();
  const offx = com.x - anchor.x;
  const offy = com.y - anchor.y;
  // Am Griff stößt der Körper mit nichts zusammen (Geist-Regel, 52-ebenen.js),
  // deshalb folgt er dem Ziel ohne Anschlag.
  const clamped = { x: playDrag.goal.x + offx, y: playDrag.goal.y + offy };
  return { offx, offy, clamped };
}

function chaseDrag(dt) {
  if (!playDrag || !world || !playDrag.joint) return;
  const body = playDrag.body;
  const nailed = constrainNailedGoal(body, playDrag.goal);
  if (nailed) {
    playDrag.joint.setTarget(V(nailed.x, nailed.y));
    return;
  }
  const follow = clampDragFollow(body);
  body.setTransform(V(follow.clamped.x, follow.clamped.y), body.getAngle());
  applyDragPivotImpulse(body, follow.offx, follow.offy, dt);
  body.setAwake(true);
  playDrag.joint.setTarget(V(follow.clamped.x - follow.offx, follow.clamped.y - follow.offy));
}

function snapDrag(dt) {
  if (!playDrag || !playDrag.body) return;
  const body = playDrag.body;
  const nailed = constrainNailedGoal(body, playDrag.goal);
  if (nailed) {
    const hinges = nailed.hinges;
    if (hinges.length >= 2) {
      body.setLinearVelocity(V(0, 0));
      body.setAngularVelocity(0);
      playDrag.joint.setTarget(V(nailed.x, nailed.y));
      return;
    }
    const p = hinges[0];
    const grab = body.getWorldPoint(V(playDrag.local.x, playDrag.local.y));
    const a0 = Math.atan2(grab.y - p.y, grab.x - p.x);
    const a1 = Math.atan2(nailed.y - p.y, nailed.x - p.x);
    let dang = a1 - a0;
    while (dang > Math.PI) dang -= Math.PI * 2;
    while (dang < -Math.PI) dang += Math.PI * 2;
    const pos = body.getPosition();
    const c = Math.cos(dang);
    const s = Math.sin(dang);
    const ox = pos.x - p.x;
    const oy = pos.y - p.y;
    body.setTransform(V(p.x + ox * c - oy * s, p.y + ox * s + oy * c), body.getAngle() + dang);
    body.setLinearVelocity(V(0, 0));
    body.setAngularVelocity(0);
    body.setAwake(true);
    playDrag.joint.setTarget(V(nailed.x, nailed.y));
    return;
  }
  const follow = clampDragFollow(body);
  body.setTransform(V(follow.clamped.x, follow.clamped.y), body.getAngle());
  restDragAboutGrab(body, follow.offx, follow.offy);
  body.setAwake(true);
  playDrag.joint.setTarget(V(follow.clamped.x - follow.offx, follow.clamped.y - follow.offy));
  playDrag.prevGoal = { x: playDrag.goal.x, y: playDrag.goal.y };
}

// Gegriffenen Körper beim Loslassen an alle Nägel heften, die in seiner
// Form liegen (Innennägel dieses Körpers ausgenommen). Mehrere Nägel
// halten ihn fest. Ein Nagel in einem anderen Körper verbindet beide.
function tryPinDragEnd(body) {
  if (!world || !body || body === ball) return 0;
  if (world.isLocked && world.isLocked()) return 0;
  const meta = bodyMeta.get(body);
  if (!meta) return 0;
  return attachExistingPins(body, meta);
}

function beginDrag(x, y) {
  if (!world || world.isLocked()) return false;
  const draw = drawingAt(x, y);
  if (!draw) return false;
  endDrag();
  const body = draw.body;
  const wasBullet = body.isBullet();
  const angularDamping = body.getAngularDamping();
  body.setBullet(true);
  body.setAngularDamping(tuneCode("dragAngDamp", DRAG_ANG_DAMP));
  body.setAwake(true);
  const mass = Math.max(0.2, body.getMass());
  const local = body.getLocalPoint(V(x, y));
  const joint = world.createJoint(new planck.MouseJoint({
    bodyA: ground,
    bodyB: body,
    target: V(x, y),
    maxForce: mass * 24 * tuneCode("dragForceG", DRAG_FORCE_G),
    frequencyHz: tuneCode("dragFreq", DRAG_FREQ),
    dampingRatio: tuneCode("dragDamp", DRAG_DAMPING),
    collideConnected: true,
  }));
  playDrag = {
    body,
    joint,
    wasBullet,
    angularDamping,
    local: { x: local.x, y: local.y },
    goal: { x, y },
    prevGoal: { x, y },
    lastGoalV: { x: 0, y: 0 },
    noCollide: true,
    ghost: false,
    targets: [],
    free: poseOfBody(body),
    wasFree: true,
  };
  return true;
}

function moveDrag(x, y) {
  if (!playDrag) return;
  playDrag.goal.x = x;
  playDrag.goal.y = y;
}

function endDrag() {
  if (!playDrag) return;
  const drag = playDrag;
  playDrag = null;
  if (!world || !drag.joint) return;
  world.destroyJoint(drag.joint);
  if (!drag.body) return;
  if (drag.ghost) restoreDragFree(drag);
  drag.body.setLinearVelocity(V(0, 0));
  drag.body.setAngularVelocity(0);
  drag.body.setBullet(drag.wasBullet);
  drag.body.setAngularDamping(drag.angularDamping);
  drag.body.setAwake(true);
  dragFresh.set(drag.body, 0);
}

function dragBodyHot(body) {
  if (!body) return false;
  if (playDrag && playDrag.body === body) return true;
  return dragFresh.has(body);
}

function stepDragFresh(dt) {
  for (const [body, still] of dragFresh) {
    if (!bodyMeta.has(body)) {
      dragFresh.delete(body);
      continue;
    }
    const v = body.getLinearVelocity();
    const slow = Math.hypot(v.x, v.y) < 0.4 && Math.abs(body.getAngularVelocity()) < 0.45;
    if (slow && still + dt > 0.45) dragFresh.delete(body);
    else dragFresh.set(body, slow ? still + dt : 0);
  }
}

