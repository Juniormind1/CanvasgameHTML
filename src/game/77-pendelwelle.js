// Pendelwelle: ungekoppelte Pendel, deren Längen so gewählt sind, dass das
// längste WAVE_N0 Schwingungen und jedes nächste eine mehr in WAVE_CYCLE schafft.
// g = 24. Die Kugelträgheit steckt in der Länge. Sie stoßen nicht: wie in
// parallelen Ebenen, von vorn gesehen.
const WAVE_COUNT = 10;
const WAVE_N0 = 7;
const WAVE_CYCLE = 13;
const WAVE_AMP = 0.42;
const WAVE_R = 0.12;
const WAVE_GAP = 0.3;

function waveLength(n) {
  const ideal = 24 * Math.pow(WAVE_CYCLE / (Math.PI * 2 * n), 2);
  const disc = ideal * ideal - 2 * WAVE_R * WAVE_R;
  if (disc <= 0) return ideal;
  return 0.5 * (ideal + Math.sqrt(disc));
}

function resetWave() {
  pendWaveWorld = null;
  pendWave = null;
  ensureWave();
}

function ensureWave() {
  if (pendWaveWorld && pendWave) return;
  pendWaveWorld = new planck.World(V(0, -24));
  const bobs = [];
  let maxL = 0;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const n = WAVE_N0 + i;
    const len = waveLength(n);
    maxL = Math.max(maxL, len);
    const x = (i - (WAVE_COUNT - 1) / 2) * WAVE_GAP;
    const pivot = pendWaveWorld.createBody({ position: V(x, 0) });
    const bob = pendWaveWorld.createDynamicBody({
      position: V(x, 0),
      angle: WAVE_AMP,
      linearDamping: 0,
      angularDamping: 0,
      allowSleep: false,
    });
    bob.createFixture(new planck.Circle(V(0, -len), WAVE_R), {
      density: 4,
      friction: 0,
      restitution: 0,
      filterCategoryBits: 0x0001,
      filterMaskBits: 0,
    });
    pendWaveWorld.createJoint(new planck.RevoluteJoint({
      bodyA: pivot,
      bodyB: bob,
      localAnchorA: V(0, 0),
      localAnchorB: V(0, 0),
      collideConnected: false,
    }));
    bobs.push({ n, len, x, body: bob });
  }
  const longest = bobs[0].len;
  const shortest = bobs[bobs.length - 1].len;
  pendWave = {
    bobs,
    frozen: false,
    exploded: false,
    halfW: (WAVE_COUNT - 1) / 2 * WAVE_GAP + longest * Math.sin(WAVE_AMP) + WAVE_R + 0.06,
    depth: longest + WAVE_R + 0.08,
    shortest,
  };
}

function onWaveClick() {
  resetWave();
}

function stepWave(dt) {
  if (!pendWaveWorld || !pendWave || pendWave.frozen) return;
  pendWaveWorld.step(dt, 10, 6);
  for (let i = 0; i < pendWave.bobs.length; i++) {
    const body = pendWave.bobs[i].body;
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    if (![p.x, p.y, v.x, v.y, body.getAngle()].every(Number.isFinite)) pendWave.exploded = true;
  }
}

function waveLayout() {
  ensureWave();
  const frame = mapFrame();
  const band = frame.cradle;
  const head = mapDemoMetrics(band).head;
  const scale = Math.max(8, Math.min((band.w - 16) / (pendWave.halfW * 2), (band.h - head - 10) / pendWave.depth));
  return {
    band,
    scale,
    originX: band.x + band.w / 2,
    originY: band.y + head + 2,
  };
}

function waveToScreen(x, y, lay) {
  const box = lay || waveLayout();
  return { x: box.originX + x * box.scale, y: box.originY - y * box.scale };
}

function drawWave() {
  const lay = waveLayout();
  const band = lay.band;
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.fillStyle = "rgba(255,252,240,0.55)";
  ctx.fill();
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 2;
  ctx.stroke();
  label("Klick: neu anstoßen", band.x + 12, band.y + 3, 13, "#5c4632");
  if (!pendWave) {
    drawMapDemoToggle(band);
    return;
  }
  ctx.save();
  ctx.beginPath();
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.clip();
  const first = pendWave.bobs[0];
  const last = pendWave.bobs[pendWave.bobs.length - 1];
  const a0 = waveToScreen(first.x, 0, lay);
  const a1 = waveToScreen(last.x, 0, lay);
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a0.x - 8, a0.y);
  ctx.lineTo(a1.x + 8, a1.y);
  ctx.stroke();
  for (let i = 0; i < pendWave.bobs.length; i++) {
    const rec = pendWave.bobs[i];
    const bob = rec.body.getWorldPoint(V(0, -rec.len));
    const anchor = waveToScreen(rec.x, 0, lay);
    const s = waveToScreen(bob.x, bob.y, lay);
    ctx.strokeStyle = "#8d5a34";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    paintSteelBall(s.x, s.y, Math.max(4, WAVE_R * lay.scale), rec.body.getAngle());
  }
  ctx.restore();
  drawMapDemoToggle(band);
}
