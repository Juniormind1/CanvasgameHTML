function nudgeDirFromClick(ballX, clickX) {
  return clickX >= ballX ? 1 : -1;
}

function doNudge(dir) {
  if (!ball || won) return;
  if (simTime < (ball._cool || 0)) return;
  ball._cool = simTime + 0.4;
  stats.nudges += 1;
  ball.applyLinearImpulse(V(dir * 8.2, 0.55), ball.getWorldCenter(), true);
}

function addStaticSolid(pts, color) {
  const clean = ensureCCW(dedupe(pts));
  if (clean.length < 3) return;
  const opt = fixtureOpt({ density: 0, friction: 0.5, restitution: 0 });
  if (!addConvexFixture(ground, clean, opt)) {
    const localTris = triangulate(clean.map((p) => ({ x: p.x, y: p.y })));
    const tris = localTris.length ? localTris : (() => {
      const hull = convexHull(clean);
      const t = [];
      for (let i = 1; i < hull.length - 1; i++) t.push([hull[0], hull[i], hull[i + 1]]);
      return t;
    })();
    for (const tri of tris) addTriFixture(ground, tri, opt);
  }
  geometry.push({ closed: true, pts: clean });
  scenery.push({ kind: "poly", pts: clean, color, width: 0.16 });
}

function addStaticWire(pts, color) {
  const clean = dedupe(pts);
  if (clean.length < 2) return;
  const opt = fixtureOpt({ density: 0, friction: 0.55, restitution: 0 });
  for (const p of clean) ground.createFixture(new planck.Circle(V(p.x, p.y), 0.1), opt);
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.05) continue;
    const shape = new planck.Box(len / 2, 0.1, V((a.x + b.x) / 2, (a.y + b.y) / 2), Math.atan2(b.y - a.y, b.x - a.x));
    ground.createFixture(shape, opt);
  }
  geometry.push({ closed: false, pts: clean });
  scenery.push({ kind: "line", pts: clean, color, width: 0.18 });
}

function makeBox(def) {
  const body = world.createDynamicBody({
    position: V(def.x, def.y),
    linearDamping: 0.15,
    angularDamping: 0.4,
  });
  body.createFixture(new planck.Box(def.hw, def.hh), fixtureOpt({
    density: def.density || 1,
    friction: 0.7,
  }));
  const local = [
    { x: -def.hw, y: -def.hh },
    { x: def.hw, y: -def.hh },
    { x: def.hw, y: def.hh },
    { x: -def.hw, y: def.hh },
  ];
  const meta = track(body, {
    kind: "draw",
    tag: def.tag || "",
    outline: { local, closed: true, color: MAT.wood, width: 0.12, fixed: false },
  });
  drawings.push({ kind: "solid", body, meta, color: MAT.wood, preset: true });
  if (def.pin) rememberPin(def.x, def.y + def.hh - 0.05, body, false);
  return body;
}

function makeRocket(def) {
  const body = world.createBody({
    type: "static",
    position: V(def.x, def.y),
    angle: def.a || 0,
    fixedRotation: true,
    linearDamping: 0.02,
  });
  body.createFixture(new planck.Box(0.85, 0.36), fixtureOpt({ density: 1.4, friction: 0.4, restitution: 0 }));
  const local = [
    { x: -0.9, y: -0.38 },
    { x: 0.55, y: -0.38 },
    { x: 1.15, y: 0 },
    { x: 0.55, y: 0.38 },
    { x: -0.9, y: 0.38 },
  ];
  const meta = track(body, {
    kind: "rocket",
    outline: { local, closed: true, color: "#d94b3a", width: 0.1, fixed: false },
  });
  const rocket = {
    x: def.x, y: def.y, a: def.a || 0,
    body, meta,
    mode: "idle",
    timer: 0,
    wait: 0,
    armed: false,
  };
  rockets.push(rocket);
  return rocket;
}

function ignite(rocket) {
  if (!rocket || rocket.mode !== "idle" || !rocket.armed) return;
  rocket.mode = "fly";
  rocket.timer = 2.3;
  rocket.body.setDynamic();
  rocket.body.setBullet(true);
  rocket.body.setAwake(true);
}

function resetBall() {
  if (!ball || !levelDef) return;
  ball.setTransform(V(levelDef.ball[0], levelDef.ball[1]), 0);
  ball.setLinearVelocity(V(0, 0));
  ball.setAngularVelocity(0);
  ball.setAwake(true);
}

function isWireMeta(meta) {
  return !!(meta && meta.outline && meta.outline.closed === false);
}

function attachPlayContacts(targetWorld) {
  targetWorld.on("begin-contact", (contact) => {
    contactQ.push([contact.getFixtureA().getBody(), contact.getFixtureB().getBody()]);
  });
  targetWorld.on("pre-solve", (contact) => {
    const ma = bodyMeta.get(contact.getFixtureA().getBody());
    const mb = bodyMeta.get(contact.getFixtureB().getBody());
    const roundA = ma && (ma.kind === "ball" || ma.round);
    const roundB = mb && (mb.kind === "ball" || mb.round);
    if (roundA && roundB) contact.setRestitution(0.98);
    else if ((roundA || roundB) && !isWireMeta(ma) && !isWireMeta(mb)) {
      contact.setRestitution(BALL_RESTITUTION);
    }
    noteRopeCutContact(contact);
  });
}

function addSideWalls() {
  addStaticSolid([[-0.5, -2], [0.4, -2], [0.4, 18], [-0.5, 18]], "#c9b48a");
  addStaticSolid([[31.6, -2], [32.5, -2], [32.5, 18], [31.6, 18]], "#c9b48a");
}

function beginPlayWorld(def, opt) {
  clearWorld();
  levelDef = def;
  if (!opt || opt.resetCam !== false) resetCam();
  world = new planck.World(V(0, -24));
  attachPlayContacts(world);
  ground = world.createBody();
  track(ground, { kind: "level" });
  addSideWalls();
  for (const solid of (def && def.solids) || []) addStaticSolid(solid.pts, solid.color);
  for (const wire of (def && def.wires) || []) addStaticWire(wire.pts, wire.color);
  for (const d of (def && def.decor) || []) scenery.push({ kind: "line", pts: d.pts, color: d.color, width: d.width || 0.12 });
}

function addStarAt(x, y, got) {
  const body = world.createBody({ position: V(x, y) });
  body.createFixture(new planck.Circle(0.58), { isSensor: true, density: 0 });
  const meta = track(body, { kind: "star", got: !!got });
  stars.push(meta);
  return meta;
}

function spawnQuestBall(x, y) {
  ball = world.createDynamicBody({
    position: V(x, y),
    bullet: true,
    linearDamping: 0.01,
    angularDamping: 0.02,
  });
  ball.createFixture(new planck.Circle(BALL_R), {
    density: 3.2,
    friction: 0.12,
    restitution: 0,
  });
  track(ball, { kind: "ball" });
  return ball;
}

function buildLevel(def) {
  beginPlayWorld(def);
  for (const box of def.boxes || []) makeBox(box);
  for (const xy of def.pins || []) {
    const host = hostAt(xy[0], xy[1]);
    if (host) rememberPin(xy[0], xy[1], host, false);
  }
  for (const r of def.rockets || []) makeRocket(r);
  for (const xy of def.stars || []) addStarAt(xy[0], xy[1], false);
  spawnQuestBall(def.ball[0], def.ball[1]);
  mode = "play";
}

function handleContacts() {
  const batch = contactQ.splice(0);
  for (const [a, b] of batch) {
    const ma = bodyMeta.get(a);
    const mb = bodyMeta.get(b);
    if (!ma || !mb) continue;
    const star = ma.kind === "star" ? ma : mb.kind === "star" ? mb : null;
    const isBall = ma.kind === "ball" || mb.kind === "ball";
    if (star && isBall) star.got = true;
    if (isBall && (dragBodyHot(a) || dragBodyHot(b))) stats.dragTrick = true;
    const rocketMeta = ma.kind === "rocket" ? ma : mb.kind === "rocket" ? mb : null;
    const other = rocketMeta === ma ? mb : rocketMeta === mb ? ma : null;
    if (rocketMeta && other && other.kind !== "star" && other.body && other.body.isDynamic()) {
      const rocket = rockets.find((r) => r.meta === rocketMeta);
      ignite(rocket);
    }
  }
}

function step(dt) {
  if (!world) return;
  chaseDrag(dt);
  simTime += dt;
  if (simTime > 0.35) {
    for (const rocket of rockets) rocket.armed = true;
  }
  const ropeLive = drawings.some((d) => d.kind === "rope" && d.bodies && d.bodies.length);
  world.step(dt, ropeLive ? 20 : 10, ropeLive ? 16 : 8);
  if (ropeLive) tightenRopes();
  snapDrag(dt);
  handleContacts();
  applyRopeCuts();
  stepDragFresh(dt);
  for (const rocket of rockets) {
    if (rocket.mode === "fly") {
      const angle = rocket.body.getAngle();
      rocket.body.applyForceToCenter(V(Math.cos(angle) * 78, Math.sin(angle) * 78), true);
      rocket.timer -= dt;
      if (rocket.timer <= 0) {
        rocket.mode = "gone";
        rocket.wait = 0.7;
        bodyMeta.delete(rocket.body);
        world.destroyBody(rocket.body);
        rocket.body = null;
      }
    } else if (rocket.mode === "gone") {
      rocket.wait -= dt;
      if (rocket.wait <= 0) {
        const fresh = makeRocket({ x: rocket.x, y: rocket.y, a: rocket.a });
        fresh.armed = true;
        rockets.splice(rockets.indexOf(rocket), 1);
      }
    }
  }
  if (ball) {
    const p = ball.getPosition();
    if (p.y < -1.5 || p.x < -2 || p.x > 34 || p.y > 28) resetBall();
  }
  if (!won && stars.length && stars.every((s) => s.got)) {
    won = true;
    if (!stats.dragTrick) {
      medals.elegant = stats.shapes === 1 && stats.nudges === 0;
      medals.oldschool = stats.nudges === 0 && stats.userPins === 0 && stats.ropes === 0 && !stats.drewUnder;
    }
    if (levelDef && !levelDef.sandbox && !levelDef.custom) {
      const store = progress();
      const prev = store.cleared[levelDef.id] || {};
      store.cleared[levelDef.id] = {
        elegant: !!(prev.elegant || medals.elegant),
        oldschool: !!(prev.oldschool || medals.oldschool),
      };
      saveJSON("crayon-progress", store);
    }
    if (!stats.dragTrick) burstConfetti();
  }
  stepConfetti(dt);
}

