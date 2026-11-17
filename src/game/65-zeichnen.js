function burstConfetti() {
  const origins = [];
  for (const star of stars) {
    if (!star.body) continue;
    const p = star.body.getPosition();
    origins.push({ x: p.x, y: p.y });
  }
  if (!origins.length) return;
  const total = 20;
  const pieces = [];
  for (let i = 0; i < total; i++) {
    const origin = origins[i % origins.length];
    const pair = CONFETTI_PAIRS[i % CONFETTI_PAIRS.length];
    const swap = ((i * 17) % 3) === 0;
    const ang = Math.PI * (0.05 + ((i * 47) % 1000) / 1000 * 0.9);
    const speed = 5 + ((i * 91) % 1000) / 1000 * 9;
    const jitter = ((i * 13) % 100) / 100;
    pieces.push({
      ox: origin.x,
      oy: origin.y,
      x: origin.x,
      y: origin.y,
      vx: Math.cos(ang) * speed * (0.65 + jitter * 0.7),
      vy: Math.abs(Math.sin(ang)) * speed + 3.5,
      spin: (i % 628) / 100,
      spinV: (1.4 + ((i * 37) % 50) / 12) * (i % 2 ? 1 : -1),
      flip: ((i * 19) % 628) / 100,
      flipV: (1.6 + ((i * 53) % 50) / 10) * (i % 3 ? 1 : -1),
      w: 0.28 + ((i * 29) % 100) / 100 * 0.34,
      h: 0.12 + ((i * 31) % 100) / 100 * 0.2,
      front: swap ? pair[1] : pair[0],
      back: swap ? pair[0] : pair[1],
      delay: (i % 10) / 40,
      age: 0,
    });
  }
  confetti = pieces;
}

function stepConfetti(dt) {
  if (!confetti.length) return;
  const keep = [];
  for (const c of confetti) {
    c.age += dt;
    if (c.delay > 0) {
      c.delay -= dt;
      keep.push(c);
      continue;
    }
    c.vy -= 11 * dt;
    c.vx *= Math.exp(-0.35 * dt);
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.spin += c.spinV * dt;
    c.flip += c.flipV * dt;
    if (c.age < 8 && c.y > -4) keep.push(c);
  }
  confetti = keep;
}

function drawConfetti() {
  if (!confetti.length) return;
  const scale = camScale();
  for (const c of confetti) {
    const p = worldToScreen(c.x, c.y);
    const facing = Math.cos(c.flip);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(c.spin);
    ctx.scale(Math.max(0.05, Math.abs(facing)), 1);
    ctx.fillStyle = facing >= 0 ? c.front : c.back;
    const w = c.w * scale;
    const h = c.h * scale;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = "rgba(36,24,12,0.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// Zeichnen mit abweichender Pose (Geisterschatten) und Deckkraft-Faktor (Geist).
let drawPose = null;
let inkAlpha = 1;

function bodyDrawPose(body) {
  if (drawPose && drawPose.body === body) return drawPose;
  const p = body.getPosition();
  return { x: p.x, y: p.y, a: body.getAngle() };
}

function outlineWorld(meta) {
  if (!meta || !meta.outline) return null;
  const pose = bodyDrawPose(meta.body);
  const c = Math.cos(pose.a);
  const s = Math.sin(pose.a);
  return meta.outline.local.map((p) => ({ x: pose.x + p.x * c - p.y * s, y: pose.y + p.x * s + p.y * c }));
}

function crayonPath(pts, color, width) {
  if (!pts || pts.length < 2) return;
  if (width === "live") {
    for (let i = 0; i < pts.length - 1; i++) {
      const w = pts[i].thick || pts[i + 1].thick || THICK;
      crayonPath([pts[i], pts[i + 1]], color, w);
    }
    return;
  }
  const scr = pts.map((p) => worldToScreen(p.x, p.y));
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  const passes = 3;
  for (let pass = 0; pass < passes; pass++) {
    ctx.globalAlpha = (pass === 0 ? 0.8 : 0.32) * inkAlpha;
    ctx.lineWidth = Math.max(1.4, width * camScale() * (pass === 0 ? 1 : 0.62));
    ctx.beginPath();
    for (let i = 0; i < scr.length; i++) {
      const jx = (hash(i, pass + 2) - 0.5) * 1.4;
      const jy = (hash(i, pass + 5) - 0.5) * 1.4;
      const x = scr[i].x + jx;
      const y = scr[i].y + jy;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function crayonFill(pts, color) {
  if (!pts || pts.length < 3) return;
  const scr = pts.map((p) => worldToScreen(p.x, p.y));
  ctx.save();
  ctx.beginPath();
  scr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = (0.28) * inkAlpha;
  ctx.fill();
  ctx.clip();
  ctx.globalAlpha = (0.18) * inkAlpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const bounds = scr.reduce((b, p) => ({
    minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
    minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  for (let y = bounds.minY; y < bounds.maxY; y += 7) {
    ctx.beginPath();
    ctx.moveTo(bounds.minX - 4, y + (hash(y, 3) - 0.5) * 2);
    ctx.lineTo(bounds.maxX + 4, y + 3);
    ctx.stroke();
  }
  ctx.restore();
}

function steelLightPoint(wx, wy, reach) {
  const lx = -0.55;
  const ly = 0.62;
  const len = Math.hypot(lx, ly);
  return { x: wx + (lx / len) * reach, y: wy + (ly / len) * reach };
}

function fillSteelHighlight(sx, sy, rad) {
  const grd = ctx.createRadialGradient(sx, sy, Math.max(0.5, rad * 0.02), sx, sy, rad * 0.55);
  grd.addColorStop(0, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.28, "rgba(236,242,248,0.42)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.globalAlpha = (1) * inkAlpha;
  ctx.beginPath();
  ctx.arc(sx, sy, rad * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawSteelMark(sx, sy, rad, angle, quest) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-angle);
  if (quest) {
    ctx.strokeStyle = "#8a3a32";
    ctx.lineWidth = Math.max(1.6, rad * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.62, -0.55, 0.55);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(40,45,52,0.5)";
    ctx.lineWidth = Math.max(1.3, rad * 0.09);
    ctx.beginPath();
    ctx.moveTo(-rad * 0.58, 0);
    ctx.lineTo(rad * 0.58, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rad * 0.28, 0, Math.max(1.2, rad * 0.11), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(40,45,52,0.45)";
    ctx.fill();
  }
  ctx.restore();
}

function drawSteelCircle(wx, wy, r, angle, quest) {
  const s = worldToScreen(wx, wy);
  const rad = r * camScale();
  ctx.save();
  ctx.beginPath();
  ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
  ctx.fillStyle = MAT.steel;
  ctx.globalAlpha = (0.96) * inkAlpha;
  ctx.fill();
  ctx.strokeStyle = MAT.steelDark;
  ctx.globalAlpha = (0.9) * inkAlpha;
  ctx.lineWidth = Math.max(1.5, rad * 0.08);
  ctx.stroke();
  drawSteelMark(s.x, s.y, rad, angle || 0, quest);
  ctx.beginPath();
  ctx.arc(s.x, s.y, Math.max(0, rad - 0.5), 0, Math.PI * 2);
  ctx.clip();
  const hiW = steelLightPoint(wx, wy, r * 0.45);
  const hi = worldToScreen(hiW.x, hiW.y);
  fillSteelHighlight(hi.x, hi.y, rad);
  ctx.restore();
}

function drawSteelEllipse(draw) {
  if (!draw || !draw.body) return;
  const pos = bodyDrawPose(draw.body);
  const phi = pos.a + (draw.angle || 0);
  const pts = ellipseWorldPts(draw, 48);
  const scr = pts.map((p) => worldToScreen(p.x, p.y));
  const scale = camScale();
  ctx.save();
  ctx.beginPath();
  scr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = MAT.steel;
  ctx.globalAlpha = (0.96) * inkAlpha;
  ctx.fill();
  ctx.strokeStyle = MAT.steelDark;
  ctx.globalAlpha = (0.9) * inkAlpha;
  ctx.lineWidth = Math.max(1.5, Math.min(draw.a, draw.b) * scale * 0.08);
  ctx.stroke();
  const ca = Math.cos(phi);
  const sa = Math.sin(phi);
  const a0 = worldToScreen(pos.x - draw.a * 0.55 * ca, pos.y - draw.a * 0.55 * sa);
  const a1 = worldToScreen(pos.x + draw.a * 0.55 * ca, pos.y + draw.a * 0.55 * sa);
  ctx.beginPath();
  ctx.strokeStyle = "rgba(40,45,52,0.5)";
  ctx.lineWidth = Math.max(1.3, Math.min(draw.a, draw.b) * scale * 0.09);
  ctx.moveTo(a0.x, a0.y);
  ctx.lineTo(a1.x, a1.y);
  ctx.stroke();
  ctx.beginPath();
  scr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  const lx = -0.55;
  const ly = 0.62;
  const len = Math.hypot(lx, ly);
  const dx = lx / len;
  const dy = ly / len;
  const u = dx * ca + dy * sa;
  const v = -dx * sa + dy * ca;
  const reach = 1 / Math.sqrt((u * u) / (draw.a * draw.a) + (v * v) / (draw.b * draw.b));
  const hi = worldToScreen(pos.x + dx * reach * 0.5, pos.y + dy * reach * 0.5);
  fillSteelHighlight(hi.x, hi.y, Math.min(draw.a, draw.b) * scale);
  ctx.restore();
}

function drawBall() {
  if (!ball) return;
  const p = ball.getPosition();
  drawSteelCircle(p.x, p.y, BALL_R, ball.getAngle(), true);
}

function drawStar(meta) {
  const p = meta.body.getPosition();
  const s = worldToScreen(p.x, p.y);
  const wobble = meta.got ? 0.9 : 1 + Math.sin(simTime * 3 + p.x) * 0.06;
  const r = 0.46 * camScale() * wobble;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(meta.got ? 0 : simTime * 0.4);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? r : r * 0.46;
    const x = Math.cos(ang) * rad;
    const y = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = meta.got ? "#c9a24a" : "#f2c14b";
  ctx.globalAlpha = meta.got ? 0.55 : 0.95;
  ctx.fill();
  ctx.strokeStyle = "#a67820";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawPin(pin) {
  const p = pinWorld(pin);
  const s = worldToScreen(p.x, p.y);
  const r = 0.16 * camScale();
  const motor = pin.motor || 0;
  ctx.save();
  ctx.translate(s.x, s.y);
  if (motor && pinReelsRope(pin)) {
    // Seilwinde: Spule im wirksamen Radius, Hanf aufgewickelt.
    const sr = winchParams().spool * camScale();
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(201,165,106,0.35)";
    ctx.strokeStyle = MAT.hemp;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, sr * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = motor ? (motor > 0 ? "#1f7a4c" : "#8a3a22") : "#24324a";
  ctx.fillStyle = "#f4e6c6";
  ctx.lineWidth = motor ? 2.4 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (motor) {
    ctx.rotate(motor * simTime * NAIL_MOTOR_SPEED);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, -0.95, 0.95);
    ctx.stroke();
    const ar = r * 0.82;
    const tip = 0.95;
    const tx = Math.cos(tip) * ar;
    const ty = Math.sin(tip) * ar;
    const dir = motor > 0 ? 1 : -1;
    const hx = tx - Math.cos(tip) * r * 0.28;
    const hy = ty - Math.sin(tip) * r * 0.28;
    const px = -Math.sin(tip) * r * 0.2 * dir;
    const py = Math.cos(tip) * r * 0.2 * dir;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx + px, hy + py);
    ctx.lineTo(hx - px, hy - py);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  } else {
    ctx.rotate(simTime * 2);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0.4, Math.PI * 1.7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRope(draw) {
  const pts = [];
  for (const body of draw.bodies) {
    if (!bodyMeta.has(body)) continue;
    const p = body.getPosition();
    pts.push({ x: p.x, y: p.y });
  }
  crayonPath(pts, draw.color || MAT.hemp, 0.09);
}

function drawRocket(rocket) {
  if (!rocket.body) return;
  const pts = outlineWorld(rocket.meta);
  if (!pts) return;
  crayonFill(pts, "#d4533c");
  crayonPath(pts.concat([pts[0]]), "#8d2b22", 0.1);
  if (rocket.mode === "fly") {
    const angle = rocket.body.getAngle();
    const tail = rocket.body.getWorldPoint(V(-0.95, 0));
    for (let i = 0; i < 4; i++) {
      const len = 0.4 + hash(i, Math.floor(simTime * 20)) * 0.7;
      const spread = (i - 1.5) * 0.12;
      const tip = {
        x: tail.x - Math.cos(angle + spread) * len,
        y: tail.y - Math.sin(angle + spread) * len,
      };
      crayonPath([{ x: tail.x, y: tail.y }, tip], i % 2 ? "#f2c14b" : "#ef8b2c", 0.1);
    }
  }
}

function drawGeoGrid() {
  const inset = viewInset();
  const tl = screenToWorld(0, inset.top);
  const br = screenToWorld(viewW, viewH - inset.bottom);
  const minX = Math.min(tl.x, br.x);
  const maxX = Math.max(tl.x, br.x);
  const minY = Math.min(tl.y, br.y);
  const maxY = Math.max(tl.y, br.y);
  const x0 = Math.ceil(minX / GEO_GRID - 1e-6) * GEO_GRID;
  const y0 = Math.ceil(minY / GEO_GRID - 1e-6) * GEO_GRID;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, inset.top, viewW, Math.max(0, viewH - inset.top - inset.bottom));
  ctx.clip();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= maxX + 1e-6; x += GEO_GRID) {
    const a = worldToScreen(x, minY);
    const b = worldToScreen(x, maxY);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let y = y0; y <= maxY + 1e-6; y += GEO_GRID) {
    const a = worldToScreen(minX, y);
    const b = worldToScreen(maxX, y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = "rgba(43,43,43,0.12)";
  ctx.stroke();
  ctx.beginPath();
  for (let x = x0; x <= maxX + 1e-6; x += GEO_GRID) {
    if (Math.abs(x / GEO_GRID) % 2 > 0.1) continue;
    const a = worldToScreen(x, minY);
    const b = worldToScreen(x, maxY);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let y = y0; y <= maxY + 1e-6; y += GEO_GRID) {
    if (Math.abs(y / GEO_GRID) % 2 > 0.1) continue;
    const a = worldToScreen(minX, y);
    const b = worldToScreen(maxX, y);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = "rgba(43,43,43,0.2)";
  ctx.stroke();
  ctx.restore();
}

function renderPlay() {
  if (geoSnap) drawGeoGrid();
  for (const item of scenery) {
    if (item.kind === "poly") {
      crayonFill(item.pts, item.color);
      crayonPath(item.pts.concat([item.pts[0]]), item.color, item.width || 0.16);
    } else crayonPath(item.pts, item.color, item.width || 0.14);
  }
  for (const rocket of rockets) drawRocket(rocket);
  // Ebenen: hinten nach vorn; der Körper an der Maus kommt ganz zuletzt.
  // Eine freie Nagelgruppe kommt als Ganzes nach vorn, in ihrer Ebenenfolge.
  const held = playDrag && playDrag.body ? playDrag.body : null;
  const heldDraws = [];
  for (const draw of drawingsByLayer()) {
    if (held && draw.body && draw.kind !== "rope" && inDragGroup(draw.body)) {
      heldDraws.push(draw);
      continue;
    }
    drawDrawing(draw);
  }
  drawAnchorLinks();
  for (const pin of pins) drawPin(pin);
  for (const star of stars) drawStar(star);
  drawBall();
  if (heldDraws.length) drawHeldDrawings(heldDraws);
  if (pointer && pointer.pts && pointer.pts.length) {
    crayonPath(pointer.pts, MAT.ink, pointer.pts.some((p) => p.thick) ? "live" : THICK);
  }
  if (shotCaptions) {
    for (const cap of shotCaptions) {
      const s = worldToScreen(cap.x, cap.y);
      label(cap.text, s.x, s.y, 22, "#3a2a1c", "center");
    }
  }
}

function drawDrawing(draw) {
  if (draw.kind === "rope") drawRope(draw);
  else if (draw.kind === "blob" || draw.kind === "roller") {
    const p = bodyDrawPose(draw.body);
    drawSteelCircle(p.x, p.y, draw.r, p.a, false);
  } else if (draw.kind === "ellipse") {
    drawSteelEllipse(draw);
  } else if (draw.meta) {
    const pts = outlineWorld(draw.meta);
    if (!pts) return;
    if (draw.meta.outline && draw.meta.outline.closed) {
      crayonFill(pts, draw.color);
      crayonPath(pts.concat([pts[0]]), draw.color, 0.13);
    } else crayonPath(pts, draw.color, (draw.meta && draw.meta.thick) || THICK);
  }
}

// Gezogener Körper (bzw. freie Nagelgruppe): ganz vorn. Als Geist halb
// durchsichtig, dazu je ein blasser Schatten an der letzten freien Pose. Über einem Nagel wird der Nagel markiert.
function drawHeldDrawings(draws) {
  const drag = playDrag;
  if (drag && drag.ghost && drag.free) {
    for (const draw of draws) {
      const pose = drag.groupFree ? drag.groupFree.get(draw.body) : (draw.body === drag.body ? drag.free : null);
      if (!pose) continue;
      drawPose = { body: draw.body, x: pose.x, y: pose.y, a: pose.a };
      inkAlpha = GHOST_SHADOW_ALPHA;
      drawDrawing(draw);
      drawPose = null;
    }
  }
  inkAlpha = drag && drag.ghost ? GHOST_ALPHA : 1;
  for (const draw of draws) drawDrawing(draw);
  inkAlpha = 1;
  // Die Nägel, die die Gruppe zusammenhalten, bleiben sichtbar.
  if (drag && drag.group) for (const pin of pins) if (inDragGroup(pin.body)) drawPin(pin);
  if (drag && !drag.ghost && drag.targets && drag.targets.length) {
    for (const pin of drag.targets) {
      drawPin(pin);
      const p = pinWorld(pin);
      const s = worldToScreen(p.x, p.y);
      ctx.save();
      ctx.strokeStyle = "#3c7fd6";
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 0.3 * camScale(), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function ellipseWorldPts(draw, n) {
  if (!draw || !draw.body) return [];
  const pos = bodyDrawPose(draw.body);
  const rot = pos.a;
  const phi = draw.angle || 0;
  const ca = Math.cos(phi);
  const sa = Math.sin(phi);
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const pts = [];
  const count = Math.max(8, n | 0);
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI * 2;
    const u = draw.a * Math.cos(t);
    const v = draw.b * Math.sin(t);
    const lx = u * ca - v * sa;
    const ly = u * sa + v * ca;
    pts.push({ x: pos.x + lx * cr - ly * sr, y: pos.y + lx * sr + ly * cr });
  }
  return pts;
}

function circlePts(x, y, r, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return pts;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function button(x, y, w, h, label, onClick, opt) {
  opt = opt || {};
  ui.push({ x, y, w, h, onClick });
  ctx.save();
  roundRect(x, y, w, h, 12);
  ctx.fillStyle = opt.on ? "rgba(60,127,214,0.28)" : "rgba(255,252,240,0.72)";
  ctx.fill();
  ctx.strokeStyle = opt.locked ? "#b7a88a" : "#5c4632";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = opt.locked ? "#8a7b64" : "#3a2a1c";
  ctx.font = (opt.size || 18) + "px 'Segoe Print', 'Comic Sans MS', cursive";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function label(text, x, y, size, color, align) {
  ctx.save();
  ctx.fillStyle = color || "#3a2a1c";
  ctx.font = size + "px 'Segoe Print', 'Comic Sans MS', cursive";
  ctx.textAlign = align || "left";
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawHUD() {
  if (!levelDef) return;
  label(levelDef.name, 24, 16, 28);
  label(levelDef.hint || "", 24, 50, 16, "#5c4632");
  const got = stars.filter((s) => s.got).length;
  label("Sterne " + got + "/" + stars.length, 24, 76, 16, "#8a5a20");
  if (stats.shapes === 1 && stats.nudges === 0) label("bisher elegant", 150, 76, 16, "#3e9a48");
  const geoW = 36;
  const geoH = 22;
  const geoX = viewW - 24 - geoW;
  const geoY = 18;
  ui.push({
    x: geoX, y: geoY, w: geoW, h: geoH,
    onClick: () => { geoSnap = !geoSnap; },
  });
  ctx.save();
  ctx.fillStyle = "rgba(255,252,240,0.92)";
  ctx.fillRect(geoX, geoY, geoW, geoH);
  ctx.strokeStyle = geoSnap ? "#2b2b2b" : "rgba(0,0,0,0.22)";
  ctx.lineWidth = geoSnap ? 3 : 1;
  const inset = geoSnap ? 1.5 : 0.5;
  ctx.strokeRect(geoX + inset, geoY + inset, geoW - inset * 2, geoH - inset * 2);
  const ax = geoX + 8;
  const ay = geoY + geoH - 6;
  const leg = 12;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + leg, ay);
  ctx.lineTo(ax, ay - leg);
  ctx.closePath();
  ctx.fillStyle = "rgba(60,127,214,0.16)";
  ctx.fill();
  ctx.strokeStyle = "#2b2b2b";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ax + 3.2, ay);
  ctx.lineTo(ax + 3.2, ay - 3.2);
  ctx.lineTo(ax, ay - 3.2);
  for (let i = 1; i <= 3; i++) {
    const t = (i / 4) * leg;
    ctx.moveTo(ax + t, ay);
    ctx.lineTo(ax + t, ay - 2.4);
  }
  ctx.stroke();
  ctx.restore();
  label("Rechtsklick: radiert    R: neu    M: Karte    H: Hilfe    Shift+Rad: Zoom", 24, viewH - 32, 15, "#6b5844");
  if (won) {
    const w = 440;
    const h = 220;
    const x = (viewW - w) / 2;
    const y = (viewH - h) / 2;
    roundRect(x, y, w, h, 18);
    ctx.fillStyle = "rgba(255,250,235,0.94)";
    ctx.fill();
    ctx.strokeStyle = "#5c4632";
    ctx.lineWidth = 3;
    ctx.stroke();
    label("Stern gefangen", x + 36, y + 24, 32);
    const bits = [];
    if (stats.dragTrick) bits.push("Unerlaubtes Tricksen");
    else {
      if (medals.elegant) bits.push("Elegant");
      if (medals.oldschool) bits.push("Old School");
    }
    label(bits.length ? bits.join("  ·  ") : "Ein Weg von vielen.", x + 36, y + 78, 20, stats.dragTrick ? "#a33b32" : "#3e9a48");
    button(x + 30, y + 140, 110, 46, "Nochmal", () => buildLevel(levelDef));
    button(x + 155, y + 140, 110, 46, "Karte", showMap);
    const next = nextLevelId();
    if (next) button(x + 280, y + 140, 130, 46, "Weiter", () => buildLevel(LEVELS[next]));
  }
}

function nextLevelId() {
  if (!levelDef || levelDef.custom || levelDef.sandbox) return null;
  const i = ORDER.indexOf(levelDef.id);
  if (i >= 0 && i < ORDER.length - 1) return ORDER[i + 1];
  return null;
}

