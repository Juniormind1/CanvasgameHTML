function ensureCradle() {
  if (cradleWorld) return;
  cradleWorld = new planck.World(V(0, -24));
  cradleGround = cradleWorld.createBody();
  cradleWorld.on("pre-solve", (contact) => {
    // Planck merges touching balls into one block; resolveCradleHits handles ball hits instead.
    const a = contact.getFixtureA().getBody();
    const b = contact.getFixtureB().getBody();
    if (cradleBalls.some((rec) => rec.body === a) && cradleBalls.some((rec) => rec.body === b)) contact.setEnabled(false);
  });
  const n = 5;
  const r = 0.2;
  const gap = 0.001;
  const len = 1.15;
  const anchorY = 0;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (r * 2 + gap);
    const anchor = cradleWorld.createBody({ position: V(x, anchorY) });
    const body = cradleWorld.createDynamicBody({
      position: V(x, anchorY - len),
      bullet: true,
      linearDamping: 0.012,
      angularDamping: 0.02,
    });
    body.createFixture(new planck.Circle(r), {
      density: 3.2,
      friction: 0.01,
      restitution: 0,
    });
    cradleWorld.createJoint(new planck.RevoluteJoint({
      bodyA: anchor,
      bodyB: body,
      localAnchorA: V(0, 0),
      localAnchorB: V(0, len),
      collideConnected: false,
    }));
    cradleBalls.push({
      body,
      anchorX: x,
      anchorY,
      len,
      r,
      side: i === 0 ? -1 : i === n - 1 ? 1 : 0,
    });
  }
}

function cradlePose(rec, ang) {
  return {
    x: rec.anchorX + Math.sin(ang) * rec.len,
    y: rec.anchorY - Math.cos(ang) * rec.len,
  };
}

function mapFrame() {
  const cols = (viewW >= 860 || (viewW >= 700 && viewH < 780)) ? 2 : 1;
  const margin = viewW < 520 ? 16 : 48;
  const colGap = 16;
  const cardW = cols === 1 ? Math.min(460, viewW - margin * 2) : Math.min(360, (viewW - margin * 2 - colGap) / 2);
  const rows = Math.ceil(ISLANDS.length / cols);
  const buttonTop = viewH - 58;
  const limit = buttonTop - 8;
  const compact = viewH < 720 || viewW < 520;
  const titleY = compact ? 16 : 28;
  const titleSize = compact ? 36 : 48;
  const subY = titleY + (compact ? 40 : 56);
  const wrapSub = viewW < 720;
  const starY = subY + (wrapSub ? 40 : 0) + (compact ? 22 : 28);
  const headerBottom = starY + 24;
  const gridRight = margin + cols * cardW + (cols - 1) * colGap;
  const sideRoom = viewW - gridRight;
  const rowGap = 10;
  const useSide = sideRoom >= 300 && viewH >= 640;
  if (useSide) {
    const cardsTop = Math.max(168, headerBottom);
    const avail = limit - cardsTop;
    let cardH = Math.floor((avail - (rows - 1) * rowGap) / rows);
    cardH = Math.max(112, Math.min(156, cardH));
    const cradle = {
      x: gridRight + 20,
      y: cardsTop,
      w: Math.min(460, sideRoom - 36),
      h: Math.min(400, Math.max(180, cardH * rows + rowGap * (rows - 1))),
    };
    return { cols, margin, colGap, cardW, rows, cardsTop, cardH, rowGap, cradle, side: true, titleY, titleSize, subY, starY, buttonTop, gridRight };
  }
  const minCard = 112;
  const need = rows * minCard + (rows - 1) * rowGap;
  let cradleH = Math.min(compact ? 124 : 158, Math.max(88, limit - need - headerBottom));
  let cardsTop = headerBottom + cradleH + 6;
  let avail = limit - cardsTop;
  let cardH = Math.floor((avail - (rows - 1) * rowGap) / rows);
  if (cardH < minCard) {
    cradleH = Math.max(78, limit - need - headerBottom);
    cardsTop = headerBottom + cradleH + 6;
    avail = limit - cardsTop;
    cardH = Math.floor((avail - (rows - 1) * rowGap) / rows);
  }
  cardH = Math.max(90, Math.min(156, cardH));
  const cradle = {
    x: margin,
    y: headerBottom,
    w: Math.max(160, Math.min(viewW - margin * 2, cardW * cols + colGap * (cols - 1))),
    h: Math.max(78, cradleH),
  };
  return { cols, margin, colGap, cardW, rows, cardsTop, cardH, rowGap, cradle, side: false, titleY, titleSize, subY, starY, buttonTop, gridRight };
}

function cradleLayout() {
  ensureCradle();
  const frame = mapFrame();
  const band = frame.cradle;
  const r = cradleBalls[0].r;
  const len = cradleBalls[0].len;
  const span = cradleBalls[cradleBalls.length - 1].anchorX - cradleBalls[0].anchorX;
  const worldW = span + (r + len * 0.92) * 2;
  const worldH = len + r * 2 + 0.18;
  const head = 36;
  const scale = Math.max(8, Math.min((band.w - 12) / worldW, (band.h - head - 10) / worldH));
  return {
    frame,
    band,
    scale,
    originX: band.x + band.w / 2,
    originY: band.y + head,
  };
}

function cradleToScreen(x, y, lay) {
  const box = lay || cradleLayout();
  return {
    x: box.originX + x * box.scale,
    y: box.originY - y * box.scale,
  };
}

function screenToCradle(sx, sy) {
  const lay = cradleLayout();
  return {
    x: (sx - lay.originX) / lay.scale,
    y: (lay.originY - sy) / lay.scale,
  };
}

function cradleArcGoal(rec, x, y) {
  let ang = Math.atan2(x - rec.anchorX, -(y - rec.anchorY));
  const maxA = 1.15;
  if (rec.side < 0) ang = clamp(ang, -maxA, -0.02);
  else ang = clamp(ang, 0.02, maxA);
  return cradlePose(rec, ang);
}

function beginCradleDrag(rec) {
  if (!rec || !rec.side || !cradleWorld || cradleWorld.isLocked()) return false;
  endCradleDrag();
  const body = rec.body;
  const p = body.getPosition();
  const joint = cradleWorld.createJoint(new planck.MouseJoint({
    bodyA: cradleGround,
    bodyB: body,
    target: V(p.x, p.y),
    maxForce: Math.max(30, body.getMass() * 260),
    frequencyHz: 8,
    dampingRatio: 1,
    collideConnected: false,
  }));
  cradleDrag = { rec, joint, goal: { x: p.x, y: p.y } };
  return true;
}

function endCradleDrag() {
  if (!cradleDrag) return;
  const drag = cradleDrag;
  cradleDrag = null;
  if (!cradleWorld || !drag.joint) return;
  cradleWorld.destroyJoint(drag.joint);
  drag.rec.body.setLinearVelocity(V(0, 0));
  drag.rec.body.setAngularVelocity(0);
  drag.rec.body.setAwake(true);
}

const CRADLE_SUBSTEPS = 8;

// Newton's cradle hits between neighbouring balls: swap the normal velocity of
// approaching pairs, sweeping alternately from both sides so a hit runs through the row.
function resolveCradleHits(h) {
  const e = 1;
  const n = cradleBalls.length;
  for (let pass = 0; pass < 2 * n; pass++) {
    let hit = false;
    const forward = pass % 2 === 0;
    for (let k = 0; k < n - 1; k++) {
      const i = forward ? k : n - 2 - k;
      const A = cradleBalls[i].body;
      const B = cradleBalls[i + 1].body;
      const pa = A.getPosition();
      const pb = B.getPosition();
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.hypot(dx, dy) || 1e-9;
      const nx = dx / dist;
      const ny = dy / dist;
      const va = A.getLinearVelocity();
      const vb = B.getLinearVelocity();
      const vrel = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
      const gap = dist - cradleBalls[i].r - cradleBalls[i + 1].r;
      if (vrel > 1e-4 && gap < vrel * h + 0.002) {
        const j = 0.5 * (1 + e) * vrel;
        A.setLinearVelocity(V(va.x - j * nx, va.y - j * ny));
        B.setLinearVelocity(V(vb.x + j * nx, vb.y + j * ny));
        hit = true;
      }
    }
    if (!hit) break;
  }
}

function stepCradle(dt) {
  if (!cradleWorld) return;
  if (cradleDrag && cradleDrag.joint) {
    const goal = cradleArcGoal(cradleDrag.rec, cradleDrag.goal.x, cradleDrag.goal.y);
    cradleDrag.joint.setTarget(V(goal.x, goal.y));
  }
  const h = dt / CRADLE_SUBSTEPS;
  for (let q = 0; q < CRADLE_SUBSTEPS; q++) {
    cradleWorld.step(h, 12, 8);
    resolveCradleHits(h);
  }
}

function cradleBallAt(sx, sy) {
  const lay = cradleLayout();
  let best = null;
  let bestD = 1e9;
  for (const rec of cradleBalls) {
    if (!rec.side) continue;
    const p = rec.body.getPosition();
    const s = cradleToScreen(p.x, p.y, lay);
    const hit = Math.max(rec.r * lay.scale * 1.4, 18);
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d <= hit && d < bestD) {
      best = rec;
      bestD = d;
    }
  }
  return best;
}

function drawCradle() {
  const lay = cradleLayout();
  const band = lay.band;
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.fillStyle = "rgba(255,252,240,0.55)";
  ctx.fill();
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 2;
  ctx.stroke();
  label("Zieh eine äußere Kugel zur Seite", band.x + 12, band.y + 6, band.w < 280 ? 13 : 15, "#5c4632");
  const first = cradleBalls[0];
  const last = cradleBalls[cradleBalls.length - 1];
  const a0 = cradleToScreen(first.anchorX, first.anchorY, lay);
  const a1 = cradleToScreen(last.anchorX, last.anchorY, lay);
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a0.x - 10, a0.y);
  ctx.lineTo(a1.x + 10, a1.y);
  ctx.stroke();
  for (const rec of cradleBalls) {
    const p = rec.body.getPosition();
    const anchor = cradleToScreen(rec.anchorX, rec.anchorY, lay);
    const s = cradleToScreen(p.x, p.y, lay);
    ctx.strokeStyle = "#8d5a34";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    const rad = Math.max(5, rec.r * lay.scale);
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = MAT.steel;
    ctx.fill();
    ctx.strokeStyle = MAT.steelDark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawSteelMark(s.x, s.y, rad, rec.body.getAngle(), false);
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    ctx.clip();
    fillSteelHighlight(s.x - rad * 0.32, s.y - rad * 0.35, rad);
    ctx.restore();
  }
  drawMapDemoToggle(band);
}


