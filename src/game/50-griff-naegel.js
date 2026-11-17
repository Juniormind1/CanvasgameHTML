function supportAlong(body, dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  const wx = dx / len;
  const wy = dy / len;
  const ang = body.getAngle();
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const lx = c * wx + s * wy;
  const ly = -s * wx + c * wy;
  let best = 0.02;
  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    const shape = f.getShape();
    if (shape.m_type === "circle") {
      const p = shape.m_p || { x: 0, y: 0 };
      best = Math.max(best, p.x * lx + p.y * ly + shape.m_radius);
    } else if (shape.m_vertices && shape.m_count) {
      for (let i = 0; i < shape.m_count; i++) {
        const v = shape.m_vertices[i];
        best = Math.max(best, v.x * lx + v.y * ly);
      }
    }
  }
  return best;
}

function rayBlock(body, x1, y1, x2, y2) {
  let best = null;
  const dirx = x2 - x1;
  const diry = y2 - y1;
  world.rayCast(V(x1, y1), V(x2, y2), (fixture, point, normal, fraction) => {
    const other = fixture.getBody();
    if (other === body || fixture.isSensor()) return -1;
    const meta = bodyMeta.get(other);
    if (meta && (meta.kind === "star" || meta.kind === "rope")) return -1;
    const nx = normal.x;
    const ny = normal.y;
    if (nx * dirx + ny * diry > 0) return -1;
    if (!best || fraction < best.fraction) best = { fraction, nx, ny, quest: other === ball };
    return Math.max(fraction, 1e-5);
  });
  return best;
}

function clampDragGoal(body, goal) {
  const origin = body.getPosition();
  let cx = origin.x;
  let cy = origin.y;
  let dx = goal.x - cx;
  let dy = goal.y - cy;
  // Other bodies stop 1.2 cm short. The quest ball is pressed 5 cm so the
  // contact solver actually shoves it; that shove is the drag trick.
  const skinOut = 0.012;
  const skinBall = -0.05;
  for (let slide = 0; slide < 4; slide++) {
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-4) break;
    const dirx = dx / seg;
    const diry = dy / seg;
    const support = supportAlong(body, dirx, diry);
    const cast = support + seg + skinBall;
    const hit = rayBlock(body, cx, cy, cx + dirx * cast, cy + diry * cast);
    if (!hit) {
      cx += dx;
      cy += dy;
      break;
    }
    const skin = hit.quest ? skinBall : skinOut;
    const allow = hit.fraction * cast - support - skin;
    const stepLen = Math.min(seg, Math.max(allow, 0));
    if (allow < 0) {
      cx += dirx * allow;
      cy += diry * allow;
    } else {
      cx += dirx * stepLen;
      cy += diry * stepLen;
    }
    if (allow >= seg - 1e-4) break;
    const nx = hit.nx;
    const ny = hit.ny;
    const leftx = dx - dirx * Math.max(allow, 0);
    const lefty = dy - diry * Math.max(allow, 0);
    const into = leftx * nx + lefty * ny;
    if (into >= 0) break;
    dx = leftx - nx * into;
    dy = lefty - ny * into;
  }
  return { x: cx, y: cy };
}

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
  const clamped = clampDragGoal(body, {
    x: playDrag.goal.x + offx,
    y: playDrag.goal.y + offy,
  });
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

