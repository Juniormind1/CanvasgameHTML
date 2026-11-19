function runTests() {
  const lines = [];
  function check(name, cond) {
    lines.push((cond ? "PASS " : "FAIL ") + name);
  }
  try {
    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 3.7, y: 2.5 }, { x: 5.2, y: 2.5 }, { x: 5.2, y: 4.8 }, { x: 3.7, y: 4.8 }, { x: 3.7, y: 2.5 },
    ], "#3c7fd6");
    for (let i = 0; i < 180; i++) step(1 / 60);
    const b1 = ball.getPosition();
    check("klotz moves ball", b1.x > 7.5 || stars.every((s) => s.got));

    {
      // Regression: Rest-Teilschritte im Frame-Loop haben den Warmstart-Impuls
      // vervielfacht. Unregelmäßige Form fällt auf Rechteck auf Klotz.
      const jumpFrames = { even: [0.0172], ragged: [0.0201, 0.0133, 0.0168], jitter: [0.0168, 0.0165, 0.0171, 0.0163, 0.0174, 0.0167] };
      for (const jumpName of Object.keys(jumpFrames)) {
        const jumpDts = jumpFrames[jumpName];
        buildLevel(LEVELS["ein-klotz"]);
        world.destroyBody(ball);
        ball = null;
        stars = [];
        const jumpBlock = makeBox({ x: 16, y: 2.4, hw: 2.2, hh: 0.4, color: "#3c7fd6" });
        for (let i = 0; i < 60; i++) step(1 / 60);
        const jumpTop = jumpBlock.getPosition().y + 0.4;
        const jumpRect = commitStroke([
          { x: 15, y: jumpTop + 1.2 }, { x: 17, y: jumpTop + 1.2 }, { x: 17, y: jumpTop + 2.2 }, { x: 15, y: jumpTop + 2.2 }, { x: 15, y: jumpTop + 1.2 },
        ], "#d94b3a");
        const zig = [{ x: 15, y: jumpTop + 4 }];
        for (let k = 0; k < 5; k++) {
          zig.push({ x: 15.35 + k * 0.5, y: jumpTop + 5.1 });
          zig.push({ x: 15.6 + k * 0.5, y: jumpTop + 4.25 });
        }
        zig.push({ x: 17.8, y: jumpTop + 5.2 }, { x: 17.8, y: jumpTop + 3.7 }, { x: 15, y: jumpTop + 3.7 }, { x: 15, y: jumpTop + 4 });
        const jumpIrr = commitStroke(zig, "#3e9a48");
        const jumpBodies = [jumpBlock, jumpRect && jumpRect.body, jumpIrr && jumpIrr.body].filter(Boolean);
        const jumpSpeed = (b) => Math.hypot(b.getLinearVelocity().x, b.getLinearVelocity().y);
        const jumpTouch = (b) => {
          for (let c = b.getContactList(); c; c = c.next) if (c.contact.isTouching()) return true;
          return false;
        };
        const jumpClock = { acc: 0 };
        let vHit = 0;
        let tHit = -1;
        let vAfter = 0;
        let frameNo = 0;
        while (jumpIrr && jumpIrr.body && simTime < 4.5) {
          advanceFixed(jumpClock, jumpDts[frameNo++ % jumpDts.length], step);
          if (tHit < 0) {
            vHit = Math.max(vHit, jumpSpeed(jumpIrr.body));
            if (jumpTouch(jumpIrr.body)) tHit = simTime;
          } else if (simTime > tHit + 0.1) {
            for (const b of jumpBodies) vAfter = Math.max(vAfter, jumpSpeed(b));
          }
        }
        const jumpEndY = jumpIrr && jumpIrr.body ? jumpIrr.body.getPosition().y : 999;
        check("no velocity jump after impact (" + jumpName + " frames)", jumpBodies.length === 3 && tHit > 0 && vAfter < vHit * 0.5 && jumpEndY < jumpTop + 3);
        lines.push("INFO impact " + jumpName + " vHit " + vHit.toFixed(2) + " vAfter " + vAfter.toFixed(2) + " endY " + jumpEndY.toFixed(2));
      }
      check("frame rest waits for the next fixed step", advanceFixed({ acc: 0 }, 0.0172, () => {}) === 1 && advanceFixed({ acc: 0 }, 0.0005, () => {}) === 0);
      buildLevel(LEVELS["ein-klotz"]);
      const spiky = [];
      for (let k = 0; k < 16; k++) {
        const ang = k * Math.PI / 8;
        const rr = k % 2 ? 0.55 : 2.1;
        const da = k % 2 ? 0 : 0.015;
        spiky.push({ x: 16 + rr * Math.cos(ang - da), y: 9 + rr * Math.sin(ang - da) });
        if (!(k % 2)) spiky.push({ x: 16 + rr * Math.cos(ang + da), y: 9 + rr * Math.sin(ang + da) });
      }
      spiky.push({ x: spiky[0].x, y: spiky[0].y });
      const spikyDraw = commitStroke(spiky, "#7a4fbf");
      let thinFix = 0;
      let boxFix = 0;
      let polyFix = 0;
      for (let f = spikyDraw && spikyDraw.body ? spikyDraw.body.getFixtureList() : null; f; f = f.getNext()) {
        const sh = f.getShape();
        if (!sh.m_vertices || sh.m_type !== "polygon") continue;
        polyFix++;
        const vs = [];
        for (let k = 0; k < sh.m_count; k++) vs.push(sh.m_vertices[k]);
        if (polyMinWidth(vs) < MIN_FIX_H - 1e-9) thinFix++;
        if (vs.some((v) => Math.hypot(v.x, v.y) > 2.4)) boxFix++;
      }
      check("thin spikes give no sliver fixtures", !!spikyDraw && spikyDraw.kind === "solid" && polyFix > 0 && thinFix === 0 && boxFix === 0);
      const flatBody = world.createDynamicBody({ position: V(5, 9) });
      check("degenerate polygon is rejected, not a 2 m box", !makePolygonFixture(flatBody, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], fixtureOpt()) && !flatBody.getFixtureList());
      world.destroyBody(flatBody);
    }

    buildLevel(LEVELS["die-luecke"]);
    let maxAlone = ball.getPosition().x;
    doNudge(1);
    for (let i = 0; i < 220; i++) {
      step(1 / 60);
      maxAlone = Math.max(maxAlone, ball.getPosition().x);
    }
    check("one nudge does not clear the gap", maxAlone < 18);

    buildLevel(LEVELS["die-luecke"]);
    commitStroke([
      { x: 6.2, y: 5.1 }, { x: 9, y: 5.24 }, { x: 13, y: 5.02 },
      { x: 17, y: 5.2 }, { x: 21, y: 5.05 }, { x: 24.4, y: 5.14 },
    ], "#8d5a34");
    const bridge = drawings.find((d) => d.kind === "wire");
    check("wobbly bridge straightens", !!bridge && bridge.meta.outline.local.length === 2);
    for (let i = 0; i < 30; i++) step(1 / 60);
    const by0 = bridge ? bridge.body.getPosition().y : -1;
    doNudge(1);
    let climbed = false;
    for (let i = 0; i < 240; i++) {
      step(1 / 60);
      const p = ball.getPosition();
      if (p.x > 12 && p.y > 4.6) climbed = true;
    }
    check("bridge stays up", !!bridge && bridge.body.getPosition().y > 3);
    check("one nudge climbs the bridge", climbed);
    lines.push("INFO bridge y0 " + by0.toFixed(2) + " y " + (bridge ? bridge.body.getPosition().y.toFixed(2) : "none") + " ball " + ball.getPosition().x.toFixed(2) + "," + ball.getPosition().y.toFixed(2) + " nudges " + stats.nudges);

    buildLevel(LEVELS["der-nagel"]);
    const before = ball.getPosition().x;
    commitStroke([
      { x: 0.7, y: 14.0 }, { x: 16.8, y: 14.0 }, { x: 16.8, y: 15.4 }, { x: 0.7, y: 15.4 }, { x: 0.7, y: 14.0 },
    ], "#3c7fd6");
    check("hammer pinned", drawings.some((d) => d.kind === "solid"));
    for (let i = 0; i < 220; i++) step(1 / 60);
    check("hammer shoves ball", ball.getPosition().x > before + 1.2 || stars.every((s) => s.got));

    buildLevel(LEVELS["zwei-naegel"]);
    commitStroke([
      { x: 11.3, y: 4.72 }, { x: 20.7, y: 4.72 }, { x: 20.7, y: 5.38 }, { x: 11.3, y: 5.38 }, { x: 11.3, y: 4.72 },
    ], "#c9854a");
    const board = drawings.find((d) => d.kind === "solid" && !d.preset);
    const y0 = board ? board.body.getPosition().y : 0;
    for (let i = 0; i < 150; i++) step(1 / 60);
    check("two pins hold the board", !!board && board.body.getPosition().y > y0 - 0.8);

    buildLevel(LEVELS["das-seil"]);
    const pa = pins[0];
    const pb = pins[1];
    const aw = pinWorld(pa);
    const bw = pinWorld(pb);
    const sagMx = (aw.x + bw.x) / 2;
    const sagCurve = [
      aw,
      { x: aw.x + (bw.x - aw.x) * 0.25, y: Math.min(aw.y, bw.y) - 0.9 },
      { x: sagMx, y: Math.min(aw.y, bw.y) - 1.3 },
      { x: aw.x + (bw.x - aw.x) * 0.75, y: Math.min(aw.y, bw.y) - 0.9 },
      bw,
    ];
    commitStroke(sagCurve, "#2b2b2b");
    const rope = drawings.find((d) => d.kind === "rope");
    check("rope created", !!rope);
    for (let i = 0; i < 120; i++) step(1 / 60);
    if (rope) {
      const mid = rope.bodies[Math.floor(rope.bodies.length / 2)].getPosition();
      check("rope sags", mid.y < Math.min(aw.y, bw.y) - 0.45);
    } else lines.push("FAIL rope sags");

    buildLevel(LEVELS["das-seil"]);
    const hangPa = pins[0];
    const hangPb = pins[1];
    const hangAw = pinWorld(hangPa);
    const hangBw = pinWorld(hangPb);
    const hangMx = (hangAw.x + hangBw.x) / 2;
    const hangSmooth = [
      hangAw,
      { x: hangAw.x + (hangBw.x - hangAw.x) * 0.5, y: hangAw.y - 2.2 },
      hangBw,
    ];
    const hangZig = [
      hangAw,
      { x: hangAw.x + (hangBw.x - hangAw.x) * 0.2, y: hangAw.y - 1.4 },
      { x: hangAw.x + (hangBw.x - hangAw.x) * 0.4, y: hangAw.y - 0.2 },
      { x: hangAw.x + (hangBw.x - hangAw.x) * 0.6, y: hangAw.y - 1.4 },
      { x: hangAw.x + (hangBw.x - hangAw.x) * 0.8, y: hangAw.y - 0.2 },
      hangBw,
    ];
    const smoothLen = pathLength(hangSmooth);
    const zigLen = pathLength(hangZig);
    commitStroke(hangSmooth, "#2b2b2b");
    const hangSmoothRope = drawings.find((d) => d.kind === "rope");
    check("smooth hanging rope keeps the stroke length", !!hangSmoothRope && Math.abs(hangSmoothRope.restLength - smoothLen) < 0.08);
    const hangBallY0 = hangAw.y - 1.2;
    ball.setTransform(V(hangMx, hangBallY0), 0);
    ball.setLinearVelocity(V(0, 0));
    ball.setAngularVelocity(0);
    for (let i = 0; i < 240; i++) step(1 / 60);
    const hangLive = hangSmoothRope ? ropeChainLength(hangSmoothRope) : 99;
    const hangBall = ball.getPosition();
    const hangFinite = Number.isFinite(hangLive) && Number.isFinite(hangBall.x) && Number.isFinite(hangBall.y);
    check("rope under a ball stays within 102 percent of its drawn length", !!hangSmoothRope && hangFinite && hangLive <= hangSmoothRope.restLength * 1.02);
    check("rope under a ball does not drop it to the ground", hangFinite && hangBall.y > 8.4);
    lines.push("INFO rope-load live=" + hangLive.toFixed(3) + " rest=" + (hangSmoothRope ? hangSmoothRope.restLength.toFixed(3) : "none") + " ball=" + hangBall.x.toFixed(2) + "," + hangBall.y.toFixed(2));
    buildLevel(LEVELS["das-seil"]);
    commitStroke(hangZig, "#2b2b2b");
    const hangZigRope = drawings.find((d) => d.kind === "rope");
    lines.push("INFO rope-wiggle rest=" + (hangZigRope ? hangZigRope.restLength.toFixed(3) : "none") + " zig=" + zigLen.toFixed(3) + " smooth=" + smoothLen.toFixed(3));
    check("a wiggly stroke makes a longer rope than a smooth curve", !!hangZigRope && hangZigRope.restLength > zigLen - 0.08 && hangZigRope.restLength > smoothLen + 0.25);

    function cutWedgePts(tipX, tipY, tipAng, pointA, len) {
      const half = tipAng / 2;
      const w = Math.tan(half) * len;
      const ca = Math.cos(pointA);
      const sa = Math.sin(pointA);
      const local = [{ x: 0, y: 0 }, { x: -len, y: w }, { x: -len, y: -w }];
      return local.map((p) => ({
        x: tipX + p.x * ca - p.y * sa,
        y: tipY + p.x * sa + p.y * ca,
      }));
    }
    function ropePieces() {
      return drawings.filter((d) => d.kind === "rope");
    }
    function prepCutRope() {
      buildLevel(LEVELS["ein-klotz"]);
      addStaticSolid([[6, 5.4], [8.4, 5.4], [8.4, 7.2], [6, 7.2]], "#3f8f55");
      addStaticSolid([[15.6, 5.4], [18, 5.4], [18, 7.2], [15.6, 7.2]], "#3f8f55");
      const cutPa = rememberPin(7.2, 7.2, hostAt(7.2, 7.2) || ground, false);
      const cutPb = rememberPin(16.8, 7.2, hostAt(16.8, 7.2) || ground, false);
      const cutAw = pinWorld(cutPa);
      const cutBw = pinWorld(cutPb);
      return spawnRope(cutPa, cutPb, [cutAw, cutBw]);
    }

    const sharpRope = prepCutRope();
    const sharpWedge = spawnSolid(cutWedgePts(12, 9.6, 12 * Math.PI / 180, -Math.PI / 2, 1.6), { density: 6 });
    if (sharpWedge) {
      sharpWedge.body.setLinearVelocity(V(0, -6));
      sharpWedge.body.setAngularVelocity(0);
    }
    for (let i = 0; i < 180; i++) step(1 / 60);
    check("a sharp wedge falling onto a rope cuts it", !!sharpRope && ropePieces().length >= 2);

    const bluntRope = prepCutRope();
    const bluntWedge = spawnSolid(cutWedgePts(12, 9.6, 60 * Math.PI / 180, -Math.PI / 2, 1.6), { density: 6 });
    if (bluntWedge) {
      bluntWedge.body.setLinearVelocity(V(0, -6));
      bluntWedge.body.setAngularVelocity(0);
    }
    for (let i = 0; i < 180; i++) step(1 / 60);
    check("a blunt wedge does not cut the rope", !!bluntRope && ropePieces().length === 1);

    const sideRope = prepCutRope();
    const sideWedge = spawnSolid(cutWedgePts(9.4, 7.2, 12 * Math.PI / 180, 0, 1.6), { density: 6 });
    if (sideWedge) {
      sideWedge.body.setLinearVelocity(V(14, 0));
      sideWedge.body.setAngularVelocity(0);
    }
    for (let i = 0; i < 90; i++) step(1 / 60);
    check("a sideways tip does not cut the rope", !!sideRope && ropePieces().length === 1);

    const ballRope = prepCutRope();
    ball.setTransform(V(12, 9.4), 0);
    ball.setLinearVelocity(V(0, -6));
    ball.setAngularVelocity(0);
    for (let i = 0; i < 180; i++) step(1 / 60);
    check("a ball does not cut the rope", !!ballRope && ropePieces().length === 1);

    buildLevel(LEVELS["zuendung"]);
    for (let i = 0; i < 30; i++) step(1 / 60);
    const rx = rockets[0].body.getPosition().x;
    commitStroke([
      { x: 5.4, y: 3.1 }, { x: 7.0, y: 3.1 }, { x: 7.0, y: 4.6 }, { x: 5.4, y: 4.6 }, { x: 5.4, y: 3.1 },
    ], "#8d5a34");
    for (let i = 0; i < 150; i++) step(1 / 60);
    const rocket = rockets.find((r) => r.mode === "fly" || r.mode === "gone" || (r.body && r.body.getPosition().x > rx + 0.8));
    check("rocket launches", !!rocket);

    buildLevel(LEVELS["ein-strich"]);
    commitStroke([
      { x: 4.0, y: 2.3 }, { x: 6.45, y: 2.3 }, { x: 6.45, y: 5.4 }, { x: 4.0, y: 5.4 }, { x: 4.0, y: 2.3 },
    ], "#3c7fd6");
    for (let i = 0; i < 220; i++) step(1 / 60);
    lines.push("INFO elegant ball " + ball.getPosition().x.toFixed(2) + " won " + won + " shapes " + stats.shapes + " nudges " + stats.nudges + " stars " + stars.filter((s) => s.got).length);
    check("elegant flag", won && medals.elegant);

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 8, y: 4 }, { x: 10, y: 4 }, { x: 10, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 4 },
    ], "#3c7fd6");
    const n = drawings.length;
    eraseAt(9, 5);
    check("erase removes drawing", drawings.length === n - 1);

    buildLevel(LEVELS["ein-klotz"]);
    const fall = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      fall.push({ x: 16 + Math.cos(a) * 0.2, y: 10 + Math.sin(a) * 0.2 });
    }
    commitStroke(fall, "#7a4fbf");
    const blob = drawings.find((d) => d.kind === "blob");
    check("free circle is a body", !!blob);
    for (let i = 0; i < 60; i++) step(1 / 60);
    check("free circle falls", blob && blob.body.getPosition().y < 8.5);

    buildLevel(LEVELS.sandbox);
    check("sandbox loads", !!ball && stars.length === 1);
    buildLevel(LEVELS.werkstatt);
    check("workshop has two stars and a rocket", stars.length === 2 && rockets.length === 1);
    buildLevel(LEVELS.flaschenzug);
    check("pulley level has basket and crate pins", pins.length >= 2);

    function interiors(draw) {
      return interiorAngles(draw.meta.outline.local).map((a) => a * 180 / Math.PI);
    }
    function near90(angs) {
      return angs.every((a) => Math.abs(a - 90) < 2);
    }
    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 8, y: 4 }, { x: 10, y: 3.82 }, { x: 12, y: 4.08 },
      { x: 12.15, y: 5.5 }, { x: 11.9, y: 7 },
      { x: 10, y: 7.16 }, { x: 8.1, y: 6.9 },
      { x: 7.85, y: 5.4 }, { x: 8, y: 4 },
    ], "#3c7fd6");
    const quad = drawings.find((d) => d.kind === "solid" && !d.preset);
    const quadAng = quad ? interiors(quad) : [];
    check("wobbly quad becomes a right rectangle", !!quad && quad.meta.outline.local.length === 4 && near90(quadAng));
    lines.push("INFO quad corners " + (quad ? quad.meta.outline.local.length : 0) + " angles " + quadAng.map((a) => a.toFixed(1)).join(","));

    buildLevel(LEVELS["ein-klotz"]);
    const tilt = 25 * Math.PI / 180;
    const tc = Math.cos(tilt);
    const ts = Math.sin(tilt);
    const around = (x, y) => ({ x: 18 + x * tc - y * ts, y: 8 + x * ts + y * tc });
    const tilted = [
      around(-1.5, -0.7), around(0, -0.86), around(1.5, -0.66),
      around(1.62, 0), around(1.45, 0.72),
      around(0, 0.84), around(-1.55, 0.68), around(-1.62, 0),
    ];
    tilted.push(tilted[0]);
    commitStroke(tilted, "#ef8b2c");
    const tquad = drawings.find((d) => d.kind === "solid" && !d.preset);
    const tAng = tquad ? interiors(tquad) : [];
    let edgeAng = 0;
    if (tquad) {
      const p = tquad.meta.outline.local;
      let best = -1;
      for (let i = 0; i < p.length; i++) {
        const q = p[(i + 1) % p.length];
        const len = Math.hypot(q.x - p[i].x, q.y - p[i].y);
        if (len > best) {
          best = len;
          edgeAng = Math.atan2(q.y - p[i].y, q.x - p[i].x) * 180 / Math.PI;
        }
      }
    }
    let lineAng = Math.abs(edgeAng) % 180;
    if (lineAng > 90) lineAng = 180 - lineAng;
    const tiltOk = Math.min(Math.abs(lineAng - 25), Math.abs(lineAng - 65)) < 8;
    check("tilted quad stays tilted and square", !!tquad && tquad.meta.outline.local.length === 4 && near90(tAng) && tiltOk);
    lines.push("INFO tilt edge " + edgeAng.toFixed(1) + " angles " + tAng.map((a) => a.toFixed(1)).join(","));

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 14, y: 6 }, { x: 15.2, y: 6.32 }, { x: 16.4, y: 6.1 },
      { x: 15.55, y: 7.15 }, { x: 15.1, y: 8.2 }, { x: 14.35, y: 7.05 }, { x: 14, y: 6 },
    ], "#3e9a48");
    const tri = drawings.find((d) => d.kind === "solid" && !d.preset);
    const triAng = tri ? interiors(tri) : [];
    check("wobbly triangle straightens to three corners", !!tri && tri.meta.outline.local.length === 3);
    check("non-right triangle stays non-right", triAng.length === 3 && triAng.every((a) => Math.abs(a - 90) > 15));
    lines.push("INFO tri angles " + triAng.map((a) => a.toFixed(1)).join(","));

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 20, y: 6 }, { x: 21.5, y: 6.4 }, { x: 23.1, y: 6.22 },
      { x: 21.55, y: 7.05 }, { x: 20.3, y: 8.15 }, { x: 20.18, y: 7.05 }, { x: 20, y: 6 },
    ], "#7a4fbf");
    const right = drawings.find((d) => d.kind === "solid" && !d.preset);
    const rightAng = right ? interiors(right) : [];
    check("near-right triangle snaps one corner to 90", !!right && right.meta.outline.local.length === 3 && rightAng.some((a) => Math.abs(a - 90) < 2));
    lines.push("INFO right angles " + rightAng.map((a) => a.toFixed(1)).join(","));

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 6, y: 9 }, { x: 9, y: 9.15 }, { x: 10.5, y: 11.1 }, { x: 8.1, y: 13 }, { x: 5.3, y: 11.2 }, { x: 6, y: 9 },
    ], "#d94b3a");
    const pent = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("pentagon does not snap to a rectangle", !!pent && pent.meta.outline.local.length >= 5);

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 4, y: 10 }, { x: 7, y: 11.6 }, { x: 10, y: 10.2 }, { x: 13, y: 12.1 }, { x: 16, y: 9.4 },
    ], "#8d5a34");
    const curve = drawings.find((d) => d.kind === "wire");
    check("curved line stays curved", !!curve && curve.meta.outline.local.length >= 4);

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 15, y: 3.2 }, { x: 18, y: 3.2 }, { x: 18, y: 4.8 }, { x: 15, y: 4.8 }, { x: 15, y: 3.2 },
    ], "#3c7fd6");
    for (let i = 0; i < 100; i++) step(1 / 60);
    commitStroke([
      { x: 15.3, y: 7 }, { x: 17.7, y: 7 }, { x: 17.7, y: 8.5 }, { x: 15.3, y: 8.5 }, { x: 15.3, y: 7 },
    ], "#ef8b2c");
    const stack = drawings.filter((d) => d.kind === "solid" && !d.preset);
    const top = stack[stack.length - 1];
    let flew = false;
    for (let i = 0; i < 160; i++) {
      step(1 / 60);
      if (top && top.body.getPosition().y > 11) flew = true;
    }
    const vend = top ? top.body.getLinearVelocity() : { x: 0, y: 9 };
    check("stacked boxes settle", !!top && !flew && Math.abs(vend.y) < 0.6 && top.body.getPosition().y < 7);
    lines.push("INFO stack y " + (top ? top.body.getPosition().y.toFixed(2) : "none") + " vy " + vend.y.toFixed(2));

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 4.1, y: 4.2 }, { x: 6.3, y: 4.2 }, { x: 6.3, y: 5.7 }, { x: 4.1, y: 5.7 }, { x: 4.1, y: 4.2 },
    ], "#8d5a34");
    let ballFlew = false;
    for (let i = 0; i < 140; i++) {
      step(1 / 60);
      if (ball.getPosition().y > 6) ballFlew = true;
    }
    const bv = ball.getLinearVelocity();
    check("box on the ball does not launch it", !ballFlew && Math.abs(bv.y) < 1.5);
    lines.push("INFO ball drop y " + ball.getPosition().y.toFixed(2) + " vy " + bv.y.toFixed(2));

    const edited = levelFromDoc({
      name: "Snap",
      ball: [6, 2],
      stars: [[24, 2]],
      strokes: [
        {
          kind: "terrain",
          color: "#3f8f55",
          points: [[8, 4], [10, 3.8], [12, 4.1], [12.2, 6.9], [10, 7.2], [7.9, 6.8], [8, 4]],
        },
        {
          kind: "terrain",
          color: "#8d5a34",
          points: [[2, 3], [6, 3.15], [10, 2.9], [14, 3.1]],
        },
      ],
    });
    const editorAng = edited.solids.length ? interiorAngles(edited.solids[0].pts).map((a) => a * 180 / Math.PI) : [];
    check("editor quad snaps", edited.solids.length === 1 && edited.solids[0].pts.length === 4 && near90(editorAng));
    check("editor line snaps", edited.wires.length === 1 && edited.wires[0].pts.length === 2);

    buildLevel(LEVELS["ein-klotz"]);
    for (const star of stars) star.got = true;
    step(1 / 60);
    const starPos = stars[0].body.getPosition();
    check("confetti has twenty pieces", confetti.length === 20);
    check("confetti rectangles have two colors", confetti.length === 20 && confetti.every((c) => c.front !== c.back));
    check("confetti rotates", confetti.every((c) => c.spinV !== 0 && c.flipV !== 0));
    check("confetti starts at the star", confetti.every((c) => Math.hypot(c.ox - starPos.x, c.oy - starPos.y) < 0.02));
    let turned = false;
    const spin0 = confetti[0] ? confetti[0].spin : 0;
    const flip0 = confetti[0] ? confetti[0].flip : 0;
    for (let i = 0; i < 30; i++) step(1 / 60);
    if (confetti[0] && (Math.abs(confetti[0].spin - spin0) > 0.2 || Math.abs(confetti[0].flip - flip0) > 0.2)) turned = true;
    check("confetti keeps turning", turned);

    buildLevel(LEVELS.werkstatt);
    for (const star of stars) star.got = true;
    step(1 / 60);
    const used = new Set(confetti.map((c) => c.ox.toFixed(2) + "," + c.oy.toFixed(2)));
    check("confetti comes from every star", stars.length === 2 && used.size === 2 && confetti.length === 20);
    check("click on the left half pushes left", nudgeDirFromClick(5, 4.7) === -1);
    check("click on the right half pushes right", nudgeDirFromClick(5, 5.2) === 1);

    buildLevel(LEVELS["ein-klotz"]);
    for (let i = 0; i < 10; i++) step(1 / 60);
    const half = ball.getPosition().x;
    doNudge(nudgeDirFromClick(half, half - 0.05));
    step(1 / 60);
    check("left half click accelerates left", ball.getLinearVelocity().x < -2);
    buildLevel(LEVELS["ein-klotz"]);
    for (let i = 0; i < 10; i++) step(1 / 60);
    const halfR = ball.getPosition().x;
    doNudge(nudgeDirFromClick(halfR, halfR + 0.05));
    step(1 / 60);
    check("right half click accelerates right", ball.getLinearVelocity().x > 2);

    function ring(cx, cy, r) {
      const pts = [];
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const wob = 1 + 0.045 * Math.sin(a * 3);
        pts.push({ x: cx + Math.cos(a) * r * wob, y: cy + Math.sin(a) * r * wob });
      }
      return pts;
    }
    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(ring(12, 6, 0.72), "#3c7fd6");
    const one = drawings.find((d) => d.kind === "roller");
    const shape = one && one.body.getFixtureList().getShape();
    check("wobbly circle becomes a roller", !!one && Math.abs(one.r - 0.72) < 0.08 && shape && shape.m_type === "circle");

    buildLevel(LEVELS["ein-klotz"]);
    const cradleR = 0.4;
    const cradleY = 1.3 + cradleR + 0.04;
    const xs = [8, 8.84, 9.68];
    for (const x of xs) commitStroke(ring(x, cradleY, cradleR), "#ef8b2c");
    const row = drawings.filter((d) => d.kind === "roller").sort((a, b) => a.body.getPosition().x - b.body.getPosition().x);
    check("cradle has three rollers", row.length === 3);
    for (let i = 0; i < 40; i++) step(1 / 60);
    row[0].body.setLinearVelocity(V(5.5, 0));
    row[0].body.setAwake(true);
    for (let i = 0; i < 100; i++) step(1 / 60);
    const v0 = row[0].body.getLinearVelocity().x;
    const v2 = row[2].body.getLinearVelocity().x;
    check("cradle passes the shove to the far ball", v2 > 2.2 && v2 > v0 + 1);
    lines.push("INFO cradle v " + v0.toFixed(2) + " " + row[1].body.getLinearVelocity().x.toFixed(2) + " " + v2.toFixed(2));

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(ring(3.5, 1.66, 0.34), "#7a4fbf");
    const hitter = drawings.find((d) => d.kind === "roller");
    for (let i = 0; i < 30; i++) step(1 / 60);
    const ballX0 = ball.getPosition().x;
    hitter.body.setLinearVelocity(V(6, 0));
    hitter.body.setAwake(true);
    for (let i = 0; i < 80; i++) step(1 / 60);
    check("roller gives its shove to the red ball", ball.getPosition().x > ballX0 + 1.2);

    function cornerDepth(host, x, y) {
      const meta = bodyMeta.get(host);
      if (!meta || !meta.outline || !meta.outline.closed) return 0;
      const worldPts = meta.outline.local.map((p) => {
        const w = host.getWorldPoint(V(p.x, p.y));
        return { x: w.x, y: w.y };
      });
      if (!pointInPoly(x, y, worldPts)) return 0;
      let best = Infinity;
      for (let i = 0; i < worldPts.length; i++) {
        const a = worldPts[i];
        const b = worldPts[(i + 1) % worldPts.length];
        best = Math.min(best, distPointSeg(x, y, a.x, a.y, b.x, b.y));
      }
      return best;
    }
    function pairOverlap(a, b) {
      const ca = bodyCorners(a);
      const cb = bodyCorners(b);
      let worst = 0;
      for (const p of ca) worst = Math.max(worst, cornerDepth(b, p.x, p.y));
      for (const p of cb) worst = Math.max(worst, cornerDepth(a, p.x, p.y));
      return worst;
    }
    function bodyCorners(body) {
      const meta = bodyMeta.get(body);
      return meta.outline.local.map((p) => {
        const w = body.getWorldPoint(V(p.x, p.y));
        return { x: w.x, y: w.y };
      });
    }
    function floorSink(body) {
      let worst = 0;
      for (const p of bodyCorners(body)) {
        if (p.y < 1.3) worst = Math.max(worst, 1.3 - p.y);
      }
      return worst;
    }

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(ring(8, 1.5, 0.16), "#2b2b2b");
    const nail = pins.find((p) => p.userMade);
    check("small circle on the floor is a ground nail", !!nail && nail.body === ground);
    check("ground nail is not a loose ball", !drawings.some((d) => d.kind === "blob" || d.kind === "roller" || d.kind === "ellipse"));
    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(ring(8, 5, 0.16), "#7a4fbf");
    check("small circle in the air stays loose", drawings.some((d) => d.kind === "blob") && !pins.some((p) => p.userMade));

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(ring(8, 1.5, 0.16), "#2b2b2b");
    const floorNail = pins.find((p) => p.userMade);
    const hung = makeBox({ x: 9.3, y: 3.4, hw: 0.45, hh: 0.45, color: "#8d5a34" });
    const boxPin = rememberPin(9.3, 3.4, hung, true);
    const anchorRope = spawnRope(floorNail, boxPin, [{ x: 8, y: 1.5 }, { x: 9.3, y: 3.4 }], "#3c7fd6");
    check("rope anchors to a floor nail", !!anchorRope && anchorRope.kind === "rope");
    for (let i = 0; i < 20; i++) step(1 / 60);
    const nailAt = pinWorld(floorNail);
    world.setGravity(V(0, 0));
    hung.setTransform(V(nailAt.x + 3, nailAt.y + 2.4), 0);
    hung.setLinearVelocity(V(0, 0));
    hung.setAngularVelocity(0);
    hung.setAwake(true);
    for (let i = 0; i < 180; i++) step(1 / 60);
    const pulledIn = Math.hypot(hung.getPosition().x - nailAt.x, hung.getPosition().y - nailAt.y);
    world.setGravity(V(0, -24));
    check("floor nail pulls the box back", pulledIn < 2.4);
    lines.push("INFO anchor dist " + pulledIn.toFixed(2));

    buildLevel(LEVELS["ein-klotz"]);
    const wide = makeBox({ x: 8, y: 5, hw: 1.6, hh: 0.9, color: "#3c7fd6" });
    for (let i = 0; i < 8; i++) step(1 / 60);
    const boxMid = wide.getPosition();
    const boxEdge = { x: boxMid.x + 1.5, y: boxMid.y };
    check("the middle of a roomy box is a stroke", pressKind(boxMid.x, boxMid.y) === "draw");
    check("the edge of a roomy box is a drag", pressKind(boxEdge.x, boxEdge.y) === "drag");
    check("empty paper is a stroke", pressKind(boxMid.x + 4, boxMid.y + 3) === "draw");
    check("press on the ball is a nudge", pressKind(ball.getPosition().x, ball.getPosition().y) === "nudge");
    const inkBefore = stats.shapes;
    check("press on the edge grabs at once", beginDrag(boxEdge.x, boxEdge.y));
    moveDrag(boxEdge.x + 1.4, boxEdge.y);
    for (let i = 0; i < 20; i++) step(1 / 60);
    endDrag();
    check("a grab does not leave a stroke", stats.shapes === inkBefore && !playDrag);
    const slimBoard = makeBox({ x: 18, y: 8, hw: 1.4, hh: 0.22, color: "#ef8b2c" });
    check("a thin board grabs everywhere", pressKind(slimBoard.getPosition().x, slimBoard.getPosition().y) === "drag");
    const adoptTrail = [
      { x: boxMid.x, y: boxMid.y },
      { x: boxMid.x + 0.45, y: boxMid.y },
      { x: boxMid.x + 0.95, y: boxMid.y },
    ];
    pointer = { id: 80, pts: adoptTrail.slice(), trail: adoptTrail.slice(), moved: true, grab: null, dragging: false };
    const midAdopt = tryAdoptCenterGrab(pointer.trail);
    check("a long stroke from the middle becomes a grab", midAdopt && playDrag && playDrag.body === wide);
    endDrag();
    pointer = null;
    const loopTrail = ring(boxMid.x, boxMid.y, 0.16);
    pointer = { id: 81, pts: loopTrail.slice(), trail: loopTrail.slice(), moved: true, grab: null, dragging: false };
    const loopAdopt = tryAdoptCenterGrab(pointer.trail);
    check("a small loop in the middle does not become a grab", !loopAdopt && !playDrag);
    pointer = null;
    const pinsBeforeHost = pins.filter((pin) => pin.userMade).length;
    commitStroke(ring(boxMid.x, boxMid.y, 0.16), "#2b2b2b");
    const hostNail = pins.find((pin) => pin.userMade && pin.body === wide);
    check("a small loop in the middle of a box is a nail in that box", !!hostNail && hostNail.body === wide && pins.filter((pin) => pin.userMade).length === pinsBeforeHost + 1);
    const lid = commitStroke([
      { x: boxMid.x - 0.9, y: boxMid.y - 0.45 },
      { x: boxMid.x + 0.9, y: boxMid.y - 0.45 },
      { x: boxMid.x + 0.9, y: boxMid.y + 0.45 },
      { x: boxMid.x - 0.9, y: boxMid.y + 0.45 },
      { x: boxMid.x - 0.9, y: boxMid.y - 0.45 },
    ], "#8d5a34");
    check("a body drawn over a nail hangs on it", !!lid && lid.body && hostNail.joints.some(Boolean));
    const quick = makeBox({ x: 22, y: 8, hw: 0.4, hh: 0.4, color: "#ef8b2c" });
    check("fast grab starts", beginDrag(22, 8));
    moveDrag(28, 11);
    step(1 / 60);
    const qp = quick.getPosition();
    lines.push("INFO fast drag " + qp.x.toFixed(2) + "," + qp.y.toFixed(2));
    check("a dragged box keeps up with a fast cursor", Math.hypot(qp.x - 28, qp.y - 11) < 0.35);
    endDrag();

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    const geoA = snapDrawPoint({ x: 8.21, y: 4.19 });
    const geoB = snapDrawPoint({ x: 10.18, y: 4.22 });
    const geoDiag = snapDrawPoint({ x: 8.74, y: 4.74 });
    check("geodreieck snaps a stroke onto the half-meter grid", geoA.x === 8 && geoA.y === 4 && geoB.x === 10 && geoB.y === 4);
    check("a diagonal lands on a grid point", geoDiag.x === 8.5 && geoDiag.y === 4.5);
    const walk = [];
    for (let x = 8; x <= 10; x += 0.5) walk.push({ x, y: 4 });
    for (let y = 4.5; y <= 6; y += 0.5) walk.push({ x: 10, y });
    for (let x = 9.5; x >= 8; x -= 0.5) walk.push({ x, y: 6 });
    for (let y = 5.5; y >= 4; y -= 0.5) walk.push({ x: 8, y });
    commitStroke(walk, "#3c7fd6");
    const gridBox = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("a grid square becomes a body", !!gridBox && gridBox.meta.outline.local.length === 4);
    const geoHold = makeBox({ x: 22.2, y: 12.2, hw: 0.4, hh: 0.4, color: "#ef8b2c" });
    check("grab uses the raw cursor while the geodreieck is on", pressKind(geoHold.getPosition().x, geoHold.getPosition().y) === "drag");
    check("empty paper still draws while the geodreieck is on", pressKind(26.2, 14.2) === "draw");
    geoSnap = false;
    const freePt = snapDrawPoint({ x: 8.21, y: 4.19 });
    check("without the geodreieck the point stays put", freePt.x === 8.21 && freePt.y === 4.19);

    buildLevel(LEVELS["ein-klotz"]);
    const lower = makeBox({ x: 14, y: 2.1, hw: 0.75, hh: 0.75, color: "#3c7fd6" });
    const upper = makeBox({ x: 14, y: 6.4, hw: 0.75, hh: 0.75, color: "#ef8b2c" });
    for (let i = 0; i < 20; i++) step(1 / 60);
    const shapesBefore = stats.shapes;
    const nudgesBefore = stats.nudges;
    check("drag can grab the upper box", beginDrag(upper.getPosition().x, upper.getPosition().y));
    let worstHit = 0;
    for (let i = 0; i < 120; i++) {
      moveDrag(14, 2.1);
      step(1 / 60);
      worstHit = Math.max(worstHit, pairOverlap(upper, lower), floorSink(upper), floorSink(lower));
    }
    check("drag does not push boxes through each other or the floor", worstHit < 0.08);
    lines.push("INFO drag overlap " + worstHit.toFixed(3));
    endDrag();
    check("drag counts as neither shape nor nudge", stats.shapes === shapesBefore && stats.nudges === nudgesBefore);

    buildLevel(LEVELS["ein-klotz"]);
    const base = makeBox({ x: 20, y: 2.1, hw: 0.7, hh: 0.7, color: "#3e9a48" });
    const pile = makeBox({ x: 24, y: 6, hw: 0.7, hh: 0.7, color: "#e6b423" });
    for (let i = 0; i < 20; i++) step(1 / 60);
    beginDrag(pile.getPosition().x, pile.getPosition().y);
    for (let i = 0; i < 140; i++) {
      moveDrag(base.getPosition().x, base.getPosition().y + 1.7);
      step(1 / 60);
    }
    endDrag();
    for (let i = 0; i < 160; i++) step(1 / 60);
    const stackedGap = pile.getPosition().y - base.getPosition().y;
    const stackedOverlap = pairOverlap(pile, base);
    check("released box stacks on the other", stackedGap > 1.2 && stackedGap < 2.2 && stackedOverlap < 0.08 && Math.abs(pile.getPosition().x - base.getPosition().x) < 0.45);
    lines.push("INFO stack gap " + stackedGap.toFixed(2) + " overlap " + stackedOverlap.toFixed(3));

    buildLevel(LEVELS["ein-klotz"]);
    const slab = makeBox({ x: 10, y: 6, hw: 1.2, hh: 0.35, color: "#3c7fd6" });
    for (let i = 0; i < 5; i++) step(1 / 60);
    const grip = slab.getWorldPoint(V(1.0, 0.22));
    check("corner grab starts", beginDrag(grip.x, grip.y));
    for (let i = 0; i < 300; i++) {
      moveDrag(grip.x, grip.y);
      step(1 / 60);
    }
    const held = slab.getWorldPoint(V(1.0, 0.22));
    const com = slab.getPosition();
    const hangX = com.x - held.x;
    const hangY = com.y - held.y;
    check("grab point stays under the cursor", Math.hypot(held.x - grip.x, held.y - grip.y) < 0.25);
    check("weight hangs below the grab", hangY < -0.85 && Math.abs(hangX) < 0.16);
    lines.push("INFO hang " + hangX.toFixed(2) + "," + hangY.toFixed(2));
    endDrag();

    function measureDragSweep(label, localX, localY, speed) {
      buildLevel(LEVELS["ein-klotz"]);
      const plank = makeBox({ x: 12, y: 8, hw: 1.2, hh: 0.35, color: "#3c7fd6" });
      for (let i = 0; i < 8; i++) step(1 / 60);
      const g0 = plank.getWorldPoint(V(localX, localY));
      beginDrag(g0.x, g0.y);
      for (let i = 0; i < 300; i++) {
        moveDrag(g0.x, g0.y);
        step(1 / 60);
      }
      const settleW = plank.getAngularVelocity();
      const hangA = plank.getAngle();
      const mass = plank.getMass();
      const inertia = plank.getInertia();
      const off = plank.getWorldPoint(V(localX, localY));
      const c0 = plank.getPosition();
      const rx = c0.x - off.x;
      const ry = c0.y - off.y;
      const pivotI = inertia + mass * (rx * rx + ry * ry);
      const refW = Math.abs(mass * (ry * speed) / pivotI);
      let maxW = 0;
      let maxTilt = 0;
      let maxErr = 0;
      const sweepDt = 1 / 60;
      const nSweep = 48;
      for (let i = 1; i <= nSweep; i++) {
        moveDrag(g0.x + speed * sweepDt * i, g0.y);
        step(sweepDt);
        const w = Math.abs(plank.getAngularVelocity());
        if (w > maxW) maxW = w;
        const tilt = Math.abs(plank.getAngle() - hangA);
        if (tilt > maxTilt) maxTilt = tilt;
        const g = plank.getWorldPoint(V(localX, localY));
        const err = Math.hypot(g.x - (g0.x + speed * sweepDt * i), g.y - g0.y);
        if (err > maxErr) maxErr = err;
      }
      const wAtEnd = Math.abs(plank.getAngularVelocity());
      const tiltEnd = Math.abs(plank.getAngle() - hangA);
      for (let i = 0; i < 180; i++) {
        moveDrag(g0.x + speed * sweepDt * nSweep, g0.y);
        step(sweepDt);
        const w = Math.abs(plank.getAngularVelocity());
        if (w > maxW) maxW = w;
      }
      const wAfter = Math.abs(plank.getAngularVelocity());
      const held = plank.getWorldPoint(V(localX, localY));
      const comAfter = plank.getPosition();
      const hangAfterY = comAfter.y - held.y;
      endDrag();
      lines.push("INFO drag-spin " + label + " settleW " + settleW.toFixed(3) + " maxW " + maxW.toFixed(2) + " refW " + refW.toFixed(2) + " wSweep " + wAtEnd.toFixed(2) + " wAfter " + wAfter.toFixed(2) + " maxTilt " + (maxTilt * 180 / Math.PI).toFixed(1) + " tiltEnd " + (tiltEnd * 180 / Math.PI).toFixed(1) + " hangY " + hangAfterY.toFixed(2) + " err " + maxErr.toFixed(3));
      return { maxW, maxTilt, maxErr, wAfter, refW, hangAfterY };
    }
    const dragCorner = measureDragSweep("corner-8", 1.05, 0.28, 8);
    const dragCenter = measureDragSweep("center-8", 0.05, 0.02, 8);
    const dragCornerFast = measureDragSweep("corner-14", 1.05, 0.28, 14);
    check("corner drag at 8 m/s stays a pendulum", dragCorner.maxW < dragCorner.refW * 1.4 + 1 && dragCorner.maxTilt < 100 * Math.PI / 180 && dragCorner.maxErr < 0.25);
    check("near-center drag stays near the reference spin", dragCenter.maxW < dragCenter.refW * 1.4 + 0.5 && dragCenter.maxTilt < 25 * Math.PI / 180);
    check("dragged plank hangs again after a sweep", dragCorner.hangAfterY < -0.7);
    check("a 14 m/s corner drag does not spin away", dragCornerFast.maxW < dragCornerFast.refW * 1.5 + 2 && dragCornerFast.maxErr < 0.25);

    // Starre Gruppe: der Impuls am Griff nutzt die Trägheit der ganzen Gruppe.
    {
      function gvWeld(baseBody, child) {
        const wp = child.body.getPosition();
        const from = baseBody.getPosition();
        const locals = anchorLinkLocals(baseBody, child.body, { x: from.x, y: from.y }, { x: wp.x, y: wp.y });
        anchors.push({
          body: child.body,
          base: baseBody,
          draw: child,
          a: { x: from.x, y: from.y },
          b: { x: wp.x, y: wp.y },
          localA: locals.localA,
          localB: locals.localB,
          color: child.color,
          savedColor: child.color,
          weld: true,
          freeze: false,
          joint: makeAnchorWeld(baseBody, child.body),
        });
      }
      function gvFarLocal(draw, other) {
        const locals = draw.meta.outline.local;
        const op = other.getPosition();
        let best = null;
        let bestD = -1;
        for (const p of locals) {
          const w = draw.body.getWorldPoint(V(p.x, p.y));
          const d = Math.hypot(w.x - op.x, w.y - op.y);
          if (d > bestD) {
            bestD = d;
            best = p;
          }
        }
        return best;
      }
      function gvRefs(body, lx, ly, speed) {
        const g = body.getWorldPoint(V(lx, ly));
        const group = weldComponent(body);
        let mass = 0;
        let cx = 0;
        let cy = 0;
        let aloneM = body.getMass();
        let aloneI = body.getInertia();
        const ap = body.getPosition();
        const aox = ap.x - g.x;
        const aoy = ap.y - g.y;
        aloneI += aloneM * (aox * aox + aoy * aoy);
        for (const b of group) {
          const m = b.getMass();
          const p = b.getPosition();
          mass += m;
          cx += m * p.x;
          cy += m * p.y;
        }
        cx /= mass;
        cy /= mass;
        let inertia = 0;
        for (const b of group) {
          const m = b.getMass();
          const p = b.getPosition();
          const rx = p.x - g.x;
          const ry = p.y - g.y;
          inertia += b.getInertia() + m * (rx * rx + ry * ry);
        }
        const offx = cx - g.x;
        const offy = cy - g.y;
        return {
          group: Math.abs(mass * offx * speed / inertia),
          alone: Math.abs(aloneM * aox * speed / aloneI),
        };
      }
      function gvSweep(body, lx, ly, speed) {
        const g0 = body.getWorldPoint(V(lx, ly));
        const refs = gvRefs(body, lx, ly, speed);
        beginDrag(g0.x, g0.y);
        for (let i = 0; i < 20; i++) {
          moveDrag(g0.x, g0.y);
          step(1 / 60);
        }
        let maxW = 0;
        let maxErr = 0;
        const n = 36;
        for (let i = 1; i <= n; i++) {
          const gy = g0.y + speed * (1 / 60) * i;
          moveDrag(g0.x, gy);
          step(1 / 60);
          const w = Math.abs(body.getAngularVelocity());
          if (w > maxW) maxW = w;
          const g = body.getWorldPoint(V(lx, ly));
          const err = Math.hypot(g.x - g0.x, g.y - gy);
          if (err > maxErr) maxErr = err;
        }
        endDrag();
        return { maxW, maxErr, group: refs.group, alone: refs.alone };
      }

      function gvScene() {
        buildLevel(LEVELS["ein-klotz"]);
        ball.setTransform(V(2, 1.66), 0);
        ball.setLinearVelocity(V(0, 0));
        world.setGravity(V(0, 0));
        const rect = makeBox({ x: 8, y: 6, hw: 0.6, hh: 2.5, density: 4 });
        const tri = spawnSolid([
          { x: 14, y: 5.2 },
          { x: 14, y: 6.8 },
          { x: 17.2, y: 6 },
        ], { density: 1.2 });
        gvWeld(rect, tri);
        return { rect, tri };
      }
      const gvTipScene = gvScene();
      const gvTip = gvFarLocal(gvTipScene.tri, gvTipScene.rect);
      const gvTipSweep = gvSweep(gvTipScene.tri.body, gvTip.x, gvTip.y, 8);
      lines.push("INFO weld-tip w " + gvTipSweep.maxW.toFixed(2)
        + " group " + gvTipSweep.group.toFixed(2) + " alone " + gvTipSweep.alone.toFixed(2)
        + " err " + gvTipSweep.maxErr.toFixed(3));
      check("grabbing a welded tip uses the whole group's inertia",
        gvTipSweep.alone > gvTipSweep.group * 1.8
        && gvTipSweep.maxW < gvTipSweep.group * 1.55 + 0.45
        && gvTipSweep.maxW < gvTipSweep.alone * 0.72
        && gvTipSweep.maxErr < 0.3);
      const gvEdgeScene = gvScene();
      const gvEdgeSweep = gvSweep(gvEdgeScene.rect, 0.35, 2.2, 8);
      lines.push("INFO weld-rect w " + gvEdgeSweep.maxW.toFixed(2)
        + " group " + gvEdgeSweep.group.toFixed(2) + " alone " + gvEdgeSweep.alone.toFixed(2)
        + " err " + gvEdgeSweep.maxErr.toFixed(3));
      check("grabbing the heavy welded body does not outspin the group pendulum",
        gvEdgeSweep.alone > gvEdgeSweep.group * 1.15
        && gvEdgeSweep.maxW < gvEdgeSweep.group * 1.25 + 0.15
        && gvEdgeSweep.maxW < gvEdgeSweep.alone * 0.9
        && gvEdgeSweep.maxErr < 0.3);
    }

    buildLevel(LEVELS["ein-klotz"]);
    const pusher = makeBox({ x: 3.1, y: 2.3, hw: 0.4, hh: 0.4, color: "#d94b3a" });
    for (let i = 0; i < 40; i++) step(1 / 60);
    const shoveX0 = ball.getPosition().x;
    beginDrag(pusher.getPosition().x, pusher.getPosition().y);
    let shoveGhost = false;
    for (let i = 0; i < 120; i++) {
      const bp = ball.getPosition();
      moveDrag(bp.x, bp.y);
      step(1 / 60);
      if (playDrag && playDrag.ghost) shoveGhost = true;
    }
    lines.push("INFO shove ball " + ball.getPosition().x.toFixed(2) + " box " + pusher.getPosition().x.toFixed(2) + " trick " + stats.dragTrick);
    // Geist-Regel: Am Griff stößt ein Körper mit nichts zusammen, auch nicht mit der Kugel.
    check("a dragged body passes through the ball", Math.abs(ball.getPosition().x - shoveX0) < 0.1 && shoveGhost);
    check("passing through the ball while held is no trick", !stats.dragTrick);
    endDrag();
    check("a ghost released on the ball jumps back off it", !overlapAtPose(pusher, poseOfBody(pusher), null));
    // Fallen lassen direkt nach dem Loslassen bleibt Tricksen.
    buildLevel(LEVELS["ein-klotz"]);
    const dropper = makeBox({ x: 5, y: 4.6, hw: 0.4, hh: 0.4, color: "#d94b3a" });
    beginDrag(5, 4.6);
    for (let i = 0; i < 5; i++) {
      moveDrag(5, 4.6);
      step(1 / 60);
    }
    endDrag();
    for (let i = 0; i < 60; i++) step(1 / 60);
    check("dropping a just-released body on the ball is a trick", stats.dragTrick && dropper.getPosition().y > ball.getPosition().y);
    for (const star of stars) star.got = true;
    step(1 / 60);
    check("a trick still solves the level", won);
    check("a trick skips confetti", confetti.length === 0);

    buildLevel(LEVELS["ein-klotz"]);
    const rested = makeBox({ x: 18, y: 3.2, hw: 0.4, hh: 0.4, color: "#3e9a48" });
    for (let i = 0; i < 15; i++) step(1 / 60);
    beginDrag(rested.getPosition().x, rested.getPosition().y);
    for (let i = 0; i < 30; i++) {
      moveDrag(18, 3.4);
      step(1 / 60);
    }
    endDrag();
    for (let i = 0; i < 90; i++) step(1 / 60);
    check("a settled drag is not yet a trick", !stats.dragTrick);
    for (const star of stars) star.got = true;
    step(1 / 60);
    check("a settled drag still gets confetti", won && confetti.length === 20);

    ensureCradle();
    for (let i = 0; i < 40; i++) stepCradle(1 / 60);
    const outer = cradleBalls[0];
    const far = cradleBalls[cradleBalls.length - 1];
    const mid = cradleBalls[2];
    check("cradle drag grabs an outer ball", beginCradleDrag(outer));
    const pulled = cradlePose(outer, -0.95);
    let cradleOverlap = 0;
    for (let i = 0; i < 50; i++) {
      cradleDrag.goal = pulled;
      stepCradle(1 / 60);
      for (let a = 0; a < cradleBalls.length; a++) {
        for (let b = a + 1; b < cradleBalls.length; b++) {
          const pa = cradleBalls[a].body.getPosition();
          const pb = cradleBalls[b].body.getPosition();
          const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y) - cradleBalls[a].r - cradleBalls[b].r;
          if (gap < -cradleOverlap) cradleOverlap = -gap;
        }
      }
    }
    const raised = outer.body.getPosition().x < outer.anchorX - 0.35;
    endCradleDrag();
    const released = Math.hypot(outer.body.getLinearVelocity().x, outer.body.getLinearVelocity().y);
    let farSwing = 0;
    let midSwing = 0;
    const halfSwing = Math.PI * Math.sqrt(far.len / 24);
    const swingWins = [];
    for (let i = 0; i < Math.ceil(10 * halfSwing * 60); i++) {
      stepCradle(1 / 60);
      farSwing = Math.max(farSwing, Math.abs(far.body.getPosition().x - far.anchorX));
      midSwing = Math.max(midSwing, Math.abs(mid.body.getPosition().x - mid.anchorX));
      const w = Math.floor((i + 1) / 60 / halfSwing);
      if (!swingWins[w]) swingWins[w] = { mid: 0, out: 0 };
      for (let b = 0; b < cradleBalls.length; b++) {
        const d = Math.abs(cradleBalls[b].body.getPosition().x - cradleBalls[b].anchorX);
        if (b === 0 || b === cradleBalls.length - 1) swingWins[w].out = Math.max(swingWins[w].out, d);
        else swingWins[w].mid = Math.max(swingWins[w].mid, d);
      }
      for (let a = 0; a < cradleBalls.length; a++) {
        for (let b = a + 1; b < cradleBalls.length; b++) {
          const pa = cradleBalls[a].body.getPosition();
          const pb = cradleBalls[b].body.getPosition();
          const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y) - 0.4;
          if (gap < -cradleOverlap) cradleOverlap = -gap;
        }
      }
    }
    check("outer cradle ball can be pulled aside", raised);
    check("released cradle ball starts from rest", released < 0.35);
    check("map cradle sends the swing to the far ball", farSwing > 0.42 && midSwing < farSwing * 0.55);
    check("cradle balls do not overlap", cradleOverlap < 0.06);
    const swingWorst = swingWins.slice(0, 10).reduce((m, w) => Math.max(m, w.mid / Math.max(w.out, 1e-6)), 0);
    check("cradle middle balls stay calm for 10 half swings", swingWins.length >= 10 && swingWorst < 0.1);
    lines.push("INFO cradle mid/outer worst " + swingWorst.toFixed(3) + " over " + Math.min(10, swingWins.length) + " half swings");
    lines.push("INFO cradle swing far " + farSwing.toFixed(2) + " mid " + midSwing.toFixed(2) + " overlap " + cradleOverlap.toFixed(3));

    resetTrebuchet();
    treb.noSlip = true;
    for (let i = 0; i < 18; i++) stepTrebuchet(1 / 60);
    releaseTrebuchet();
    let trebPeak = 0;
    for (let i = 0; i < 180; i++) {
      stepTrebuchet(1 / 60);
      if (treb && treb.ball) {
        const peakV = treb.ball.getLinearVelocity();
        trebPeak = Math.max(trebPeak, Math.hypot(peakV.x, peakV.y));
      }
    }
    resetTrebuchet();
    const trebStart = { x: treb.ball.getPosition().x, y: treb.ball.getPosition().y };
    const trebStartX = trebStart.x;
    for (let i = 0; i < 18; i++) stepTrebuchet(1 / 60);
    check("trebuchet hold pin stays until release", !!treb && !treb.released && !!treb.holdJoint);
    check("trebuchet ball rests in the pouch", !!treb && trebBallInPouch(0.16));
    releaseTrebuchet();
    let trebMaxY = trebStart.y;
    let trebFinalAng = 0;
    let trebLeftPouch = false;
    let trebDidSlip = false;
    let trebLandX = null;
    for (let i = 0; i < 360; i++) {
      stepTrebuchet(1 / 60);
      if (treb && treb.ball) trebMaxY = Math.max(trebMaxY, treb.ball.getPosition().y);
      if (treb && treb.arm) trebFinalAng = treb.arm.getAngle();
      if (treb && treb.hooked && !trebBallInPouch(0.22)) trebLeftPouch = true;
      if (treb && !treb.hooked && !trebDidSlip) trebDidSlip = true;
      if (trebDidSlip && trebLandX == null && treb.ball && treb.ball.getPosition().y <= TREB_BALL_R + 0.05 && treb.ball.getLinearVelocity().y <= 0) {
        trebLandX = treb.ball.getPosition().x;
      }
    }
    const trebFly = treb ? trebStartX - treb.minBallX : 0;
    const trebLive = treb ? treb.maxLive : 99;
    const trebOk = treb && !treb.exploded && trebFinite(treb.ball) && trebFinite(treb.arm);
    const trebEnd = treb && treb.ball ? treb.ball.getPosition() : { x: 0, y: 0 };
    const sl = treb && treb.slip ? treb.slip : { x: 0, y: 0, vx: 0, vy: 0 };
    const trebRel = treb && treb.slipRel != null ? treb.slipRel : 0;
    const trebSlipV = Math.hypot(sl.vx, sl.vy);
    const trebLand = trebLandX != null ? trebStartX - trebLandX : trebFly;
    lines.push("INFO trebuchet fly " + trebFly.toFixed(2) + " land " + trebLand.toFixed(2) + " live " + trebLive.toFixed(3) + " maxY " + trebMaxY.toFixed(2) + " end " + trebEnd.x.toFixed(2) + "," + trebEnd.y.toFixed(2) + " vSlip " + sl.vx.toFixed(2) + "," + sl.vy.toFixed(2) + " slipRel " + trebRel.toFixed(2) + " peak " + trebPeak.toFixed(2) + " slipV " + trebSlipV.toFixed(2) + " didSlip " + trebDidSlip + " leftPouch " + trebLeftPouch);
    check("trebuchet ball stays in the pouch until release", !trebLeftPouch && trebDidSlip);
    check("trebuchet sling swings past the arm tip before release", trebDidSlip && trebRel >= -0.2 && trebRel <= 0.55);
    check("trebuchet release speed is near the measured maximum", trebSlipV >= trebPeak * 0.9 && trebPeak > 20);
    check("trebuchet ball flies far after release", trebFly > 15);
    check("trebuchet throws to the left", trebFly > 15 && sl.vx < 0);
    check("trebuchet sling stays within 102 percent of its length", trebLive <= 1.02);
    check("trebuchet does not explode", trebOk);

    setMapDemo("onager");
    for (let onaI = 0; onaI < 20; onaI++) stepOnager(1 / 60);
    check("onager stays cocked with the ball in the cup", !!onager && !onager.released && onager.inCup && Math.abs(onager.arm.getAngle() - ONAGER_COCKED) < 0.08);
    releaseOnager();
    for (let onaI = 0; onaI < 180; onaI++) stepOnager(1 / 60);
    const onaKick = onager && onager.kick ? onager.kick : { vx: 0, vy: 0, ang: 0 };
    const onaFly = onager ? onager.startX - onager.minX : 0;
    lines.push("INFO onager fly " + onaFly.toFixed(2)
      + " kick " + onaKick.vx.toFixed(2) + "," + onaKick.vy.toFixed(2)
      + " ang " + onaKick.ang.toFixed(2) + " w " + (onaKick.w || 0).toFixed(2)
      + " left " + !!(onager && onager.left)
      + " arm " + (onager ? onager.arm.getAngle().toFixed(2) : "0"));
    check("onager arm hits the crossbeam", !!onager && onager.arm.getAngle() > ONAGER_STOP - 0.08);
    check("onager ball leaves the cup at the kick", !!onager && onager.left);
    check("onager throws left and up", onaKick.vx < -8 && onaKick.vy > 2);
    check("onager ball travels", onaFly > 12);
    check("onager does not explode", !!onager && !onager.exploded && onagerFinite(onager.ball));
    onOnagerClick();
    check("onager click recocks", !!onager && !onager.released && onager.inCup && Math.abs(onager.arm.getAngle() - ONAGER_COCKED) < 0.12);

    setMapDemo("wave");
    const wvS = Math.sin(WAVE_AMP / 2);
    const wvK = wvS * wvS;
    const wvFactor = 1 + wvK / 4 + (9 / 64) * wvK * wvK;
    const wvSteps = Math.round(WAVE_CYCLE * wvFactor * 60);
    const wvHalf = Math.round(wvSteps / 2);
    let wvSpread = 0;
    let wvBest = 1e9;
    for (let wvI = 0; wvI < wvSteps + 18; wvI++) {
      stepWave(1 / 60);
      if (!pendWave) break;
      let wvMin = 1e9;
      let wvMax = -1e9;
      let wvErr = 0;
      for (let wvB = 0; wvB < pendWave.bobs.length; wvB++) {
        const wvAng = pendWave.bobs[wvB].body.getAngle();
        if (wvAng < wvMin) wvMin = wvAng;
        if (wvAng > wvMax) wvMax = wvAng;
        wvErr = Math.max(wvErr, Math.abs(wvAng - WAVE_AMP));
      }
      if (wvI === wvHalf) wvSpread = wvMax - wvMin;
      if (wvI >= wvSteps - 12) wvBest = Math.min(wvBest, wvErr);
    }
    lines.push("INFO wave spread " + wvSpread.toFixed(3) + " revive " + wvBest.toFixed(3)
      + " steps " + wvSteps
      + " L " + (pendWave ? pendWave.bobs[0].len.toFixed(3) + ".." + pendWave.shortest.toFixed(3) : "?"));
    check("pendulum wave opens into a wave", wvSpread > 0.45);
    check("pendulum wave returns together", wvBest < 0.22);
    check("pendulum wave does not explode", !!pendWave && !pendWave.exploded);
    for (let wvI = 0; wvI < 45; wvI++) stepWave(1 / 60);
    const wvMid = pendWave.bobs[0].body.getAngle();
    onWaveClick();
    check("pendulum wave click resets", !!pendWave
      && Math.abs(pendWave.bobs[0].body.getAngle() - WAVE_AMP) < 0.02
      && Math.abs(wvMid - WAVE_AMP) > 0.08);

    setMapDemo("double");
    const dpTip0 = doubleBobPoint("lower");
    const dpE0 = doubleEnergy();
    let dpMoved = 0;
    let dpMaxA = 0;
    for (let dpI = 0; dpI < 180; dpI++) {
      stepDouble(1 / 60);
      const dpTip = doubleBobPoint("lower");
      dpMoved = Math.max(dpMoved, Math.hypot(dpTip.x - dpTip0.x, dpTip.y - dpTip0.y));
      dpMaxA = Math.max(dpMaxA, Math.abs(doublePend.lower.getAngle()));
    }
    const dpE1 = doubleEnergy();
    const dpVend = doublePend.lower.getLinearVelocity();
    const dpSpeed = Math.hypot(dpVend.x, dpVend.y);
    lines.push("INFO double move " + dpMoved.toFixed(2) + " E " + dpE0.toFixed(2) + " -> " + dpE1.toFixed(2)
      + " v " + dpSpeed.toFixed(2) + " maxA " + dpMaxA.toFixed(2)
      + " trail " + (doublePend ? doublePend.trail.length : 0));
    check("double pendulum swings", dpMoved > 0.6 && dpMaxA > 2.2);
    check("double pendulum keeps moving", dpSpeed > 0.8);
    // Hänge-Ruhe liegt bei etwa -40 J. Der Löser verliert an dieser Kette einige Joule.
    check("double pendulum energy stays bounded", dpE1 < dpE0 + 6 && dpE1 > dpE0 - 22);
    check("double pendulum does not explode", doubleFinite() && !!doublePend && !doublePend.exploded);
    check("double pendulum draws a trail", !!doublePend && doublePend.trail.length > 20);
    resetDouble();
    for (let dpI = 0; dpI < 300; dpI++) stepDouble(1 / 60);
    const dpBase = doubleBobPoint("lower");
    resetDouble();
    poseDouble(DP_A1 + 0.012, DP_A2);
    for (let dpI = 0; dpI < 300; dpI++) stepDouble(1 / 60);
    const dpNear = doubleBobPoint("lower");
    const dpSplit = Math.hypot(dpNear.x - dpBase.x, dpNear.y - dpBase.y);
    resetDouble();
    for (let dpI = 0; dpI < 300; dpI++) stepDouble(1 / 60);
    const dpAgain = doubleBobPoint("lower");
    const dpSame = Math.hypot(dpAgain.x - dpBase.x, dpAgain.y - dpBase.y);
    lines.push("INFO double split " + dpSplit.toFixed(3) + " same " + dpSame.toFixed(5));
    check("double pendulum is chaotic", dpSplit > 0.2);
    check("double pendulum repeats from the same start", dpSame < 0.02);
    resetDouble();
    check("double drag grabs the lower ball", beginDoubleDrag("lower"));
    const dpFrom = doubleBobPoint("lower");
    for (let dpI = 0; dpI < 40; dpI++) {
      doubleDrag.goal = { x: dpFrom.x + 0.6, y: dpFrom.y + 0.2 };
      stepDouble(1 / 60);
    }
    const dpPulled = doubleBobPoint("lower");
    endDoubleDrag();
    lines.push("INFO double drag " + Math.hypot(dpPulled.x - dpFrom.x, dpPulled.y - dpFrom.y).toFixed(3));
    check("double drag moves the lower ball", Math.hypot(dpPulled.x - dpFrom.x, dpPulled.y - dpFrom.y) > 0.15);
    check("double drag stays finite", doubleFinite());
    setMapDemo("cradle");

    {
      // Verankern: kurzer gerader Zug von unten nach oben, Boden oder Auflage.
      buildLevel(LEVELS["ein-klotz"]);
      const ancRect = (x0, y0, w, h, color) => commitStroke([
        { x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }, { x: x0, y: y0 },
      ], color);
      const ancA = ancRect(19, 1.4, 1.5, 1, "#3c7fd6");
      const ancE = ancRect(25, 1.4, 1.5, 1, "#3e9a48");
      const ancC = ancRect(29, 1.4, 1.2, 0.8, "#7a4fbf");
      for (let i = 0; i < 90; i++) step(1 / 60);
      const ancTopA = ancA.body.getPosition().y + 0.5;
      const ancDrawCount = drawings.length;
      const ancShapes = stats.shapes;
      const ancRes1 = finishPlayStroke([{ x: 18.6, y: 1.2 }, { x: 19, y: 1.45 }, { x: 19.4, y: 1.7 }]);
      for (let i = 0; i < 60; i++) step(1 / 60);
      check("anchor ground->rectangle makes it static", ancRes1 === "anchor" && ancA.body.isStatic() && anchors.length === 1 && anchors[0].base === ground);
      check("anchor gesture draws no stroke", drawings.length === ancDrawCount && stats.shapes === ancShapes);
      check("anchor link has the body color", anchors.length === 1 && anchors[0].color === MAT.wood);

      const ancB = ancRect(19.2, ancTopA + 0.05, 1, 0.8, "#d94b3a");
      for (let i = 0; i < 90; i++) step(1 / 60);
      const ancResB = finishPlayStroke([{ x: 19.9, y: ancTopA - 0.15 }, { x: 19.85, y: ancTopA + 0.1 }, { x: 19.8, y: ancTopA + 0.35 }]);
      check("anchor to an anchored body works", ancResB === "anchor" && ancB.body.isStatic() && anchorOf(ancB.body) && anchorOf(ancB.body).base === ancA.body);

      const ancD = ancRect(29.1, ancC.body.getPosition().y + 0.45, 0.9, 0.6, "#ef8b2c");
      for (let i = 0; i < 90; i++) step(1 / 60);
      const ancTopC = ancC.body.getPosition().y + 0.4;
      ancC.color = "#2244aa";
      if (ancC.meta && ancC.meta.outline) ancC.meta.outline.color = "#2244aa";
      const ancFreeGesture = tryAnchorGesture([{ x: 29.6, y: ancTopC - 0.15 }, { x: 29.6, y: ancTopC + 0.25 }]);
      const ancJoin = anchorOf(ancD.body);
      check("short stroke between two touching bodies welds them", ancFreeGesture === "anchor" && !!ancJoin && ancJoin.weld && !!ancJoin.joint && ancJoin.base === ancC.body && ancD.body.isDynamic() && ancC.body.isDynamic() && ancD.color === "#2244aa");
      releaseAnchor(ancD.body);
      check("releasing the weld restores both bodies", !isAnchored(ancD.body) && ancD.color === MAT.wood && ancD.body.isDynamic() && ancC.body.isDynamic());

      const ancLong = finishPlayStroke([{ x: 22.5, y: 1.2 }, { x: 24, y: 1.45 }, { x: 25.4, y: 1.7 }]);
      check("long drag into a body still draws", ancLong && ancLong !== "anchor" && ancE.body.isDynamic());
      const ancCurved = finishPlayStroke([{ x: 24.6, y: 1.25 }, { x: 24.62, y: 1.75 }, { x: 24.9, y: 1.95 }, { x: 25.25, y: 1.8 }]);
      check("curved short drag into a body still draws", ancCurved && ancCurved !== "anchor" && ancE.body.isDynamic());
      const ancEmpty = finishPlayStroke([{ x: 12.5, y: 1.25 }, { x: 12.9, y: 1.55 }, { x: 13.3, y: 1.9 }]);
      check("short stroke from the ground into empty space draws", ancEmpty && ancEmpty !== "anchor" && drawings.includes(ancEmpty));

      const ancMid = { x: (anchors[0].a.x + anchors[0].b.x) / 2, y: (anchors[0].a.y + anchors[0].b.y) / 2 };
      const ancMidScr = worldToScreen(ancMid.x, ancMid.y);
      onPointerDown({ button: 2, clientX: ancMidScr.x, clientY: ancMidScr.y, pointerId: 7 });
      const ancRight = anchors.length === 0 && drawings.includes(ancA) && drawings.includes(ancB);
      for (let i = 0; i < 30; i++) step(1 / 60);
      check("right click on the link releases body and dependents", ancRight && ancA.body.isDynamic() && ancB.body.isDynamic() && anchors.length === 0);

      buildLevel(LEVELS["ein-klotz"]);
      const ancBlob = spawnBlob(21.5, 1.62, 0.3, "#e6b423");
      const ancRoll = spawnRoller(23.5, 1.85, 0.5, "#8d5a34");
      const ancWire = spawnWire([{ x: 27, y: 1.5 }, { x: 28.5, y: 1.5 }], { color: "#2b2b2b" });
      for (let i = 0; i < 60; i++) step(1 / 60);
      finishPlayStroke([{ x: 21.1, y: 1.2 }, { x: 21.5, y: 1.6 }]);
      finishPlayStroke([{ x: 23.0, y: 1.2 }, { x: 23.4, y: 1.7 }]);
      const ancWy = ancWire.body.getPosition().y;
      finishPlayStroke([{ x: 27.4, y: 1.2 }, { x: 27.7, y: ancWy }]);
      check("balls and wires are not anchored", ancBlob.body.isDynamic() && ancRoll.body.isDynamic() && ancWire.body.isDynamic() && anchors.length === 0);

      const ancG = ancRect(16, 1.4, 1.5, 1, "#3c7fd6");
      for (let i = 0; i < 90; i++) step(1 / 60);
      const ancGc = ancG.body.getPosition();
      finishPlayStroke([{ x: 15.6, y: 1.2 }, { x: 16.4, y: 1.6 }]);
      const ancGrabKind = pressKind(ancGc.x, ancGc.y);
      const ancGrab = beginDrag(ancGc.x, ancGc.y);
      check("anchored body cannot be grabbed", ancG.body.isStatic() && ancGrabKind !== "drag" && !ancGrab && !playDrag);
      const ancAgain = finishPlayStroke([{ x: 15.6, y: 1.2 }, { x: 16.4, y: 1.6 }]);
      check("same anchor gesture again releases it", ancAgain === "anchor" && ancG.body.isDynamic() && anchors.length === 0);

      for (let i = 0; i < 60; i++) step(1 / 60);
      const ancHc = ancG.body.getPosition();
      const ancDragOk = beginDrag(ancHc.x, ancHc.y);
      moveDrag(ancHc.x + 0.1, 1.1);
      for (let i = 0; i < 20; i++) step(1 / 60);
      const ancHeld = playDrag ? playDrag.body.getWorldPoint(V(playDrag.local.x, playDrag.local.y)) : ancHc;
      endDrag();
      const ancRev = tryAnchorDragEnd(ancG.body, { x: ancHeld.x, y: ancHeld.y }, [{ x: ancHc.x, y: ancHc.y }, { x: ancHc.x + 0.1, y: 1.1 }]);
      check("reverse drag body->ground anchors it", ancDragOk && ancRev && ancG.body.isStatic());
      const ancPose = ancG.body.getPosition().y;
      for (let i = 0; i < 120; i++) step(1 / 60);
      check("anchored body stays put", Math.abs(ancG.body.getPosition().y - ancPose) < 1e-6);

      buildLevel(LEVELS["ein-klotz"]);
      const ancMiss = ancRect(14, 1.65, 1.5, 1, "#3c7fd6");
      const ancMissN = drawings.length;
      const ancMissRes = finishPlayStroke([{ x: 14.4, y: 1.2 }, { x: 14.7, y: 1.85 }, { x: 15.0, y: 2.2 }]);
      const ancMissPt = ancMiss.body.getPosition();
      const ancMissCan = beginDrag(ancMissPt.x, ancMissPt.y);
      check("rejected anchor stroke draws nothing", ancMissRes === "miss" && drawings.length === ancMissN && ancMiss.body.isDynamic() && anchors.length === 0);
      check("rejected anchor stroke leaves the body grabbable", !!ancMissCan && playDrag && playDrag.body === ancMiss.body);
      endDrag();

      const ancLift = ancRect(17.5, 1.65, 1.5, 1, "#d94b3a");
      const ancLiftN = drawings.length;
      const ancLiftTrail = [{ x: 17.9, y: 1.2 }, { x: 18.2, y: 1.85 }, { x: 18.5, y: 2.2 }];
      pointer = { id: 41, pts: ancLiftTrail.slice(), trail: ancLiftTrail.slice(), moved: true, grab: null, dragging: false };
      const ancLiftAdopt = tryAdoptAnchorGrab(pointer.trail);
      const ancLiftGot = !!(playDrag && playDrag.body === ancLift.body);
      const ancLiftX0 = ancLift.body.getPosition().x;
      if (playDrag) moveDrag(ancLiftX0 + 0.9, ancLift.body.getPosition().y);
      for (let i = 0; i < 20; i++) step(1 / 60);
      const ancLiftX1 = ancLift.body.getPosition().x;
      endDrag();
      pointer = null;
      check("rejected anchor gesture becomes a grab", ancLiftAdopt && ancLiftGot);
      check("rejected anchor grab moves the body and draws no stroke", drawings.length === ancLiftN && ancLiftX1 > ancLiftX0 + 0.2 && ancLift.body.isDynamic() && anchors.length === 0);

      buildLevel(LEVELS["ein-klotz"]);
      const ancKeep = ancRect(19, 1.4, 1.5, 1, "#3c7fd6");
      for (let i = 0; i < 90; i++) step(1 / 60);
      finishPlayStroke([{ x: 18.6, y: 1.2 }, { x: 19, y: 1.45 }, { x: 19.4, y: 1.7 }]);
      const ancKeepC = ancKeep.body.getPosition();
      const ancKeepScr = worldToScreen(ancKeepC.x, ancKeepC.y);
      const ancKeepN = drawings.length;
      onPointerDown({ button: 2, clientX: ancKeepScr.x, clientY: ancKeepScr.y, pointerId: 42 });
      check("right click on anchored body does not delete it", drawings.length === ancKeepN && drawings.includes(ancKeep) && isAnchored(ancKeep.body) && ancKeep.body.isStatic());

      const ancKeepTop = ancKeepC.y + 0.5;
      const ancDep = ancRect(19.2, ancKeepTop + 0.05, 1, 0.8, "#d94b3a");
      for (let i = 0; i < 90; i++) step(1 / 60);
      finishPlayStroke([{ x: 19.9, y: ancKeepTop - 0.15 }, { x: 19.85, y: ancKeepTop + 0.1 }, { x: 19.8, y: ancKeepTop + 0.35 }]);
      const ancDepC = ancDep.body.getPosition();
      // Links liegt der Klick weit weg vom Verbindungsstrich (der rechts endet).
      const ancDepHit = { x: ancDepC.x - 0.3, y: ancDepC.y };
      const ancDepScr = worldToScreen(ancDepHit.x, ancDepHit.y);
      const ancDepN = drawings.length;
      onPointerDown({ button: 2, clientX: ancDepScr.x, clientY: ancDepScr.y, pointerId: 43 });
      check("right click on a body anchored to another does not delete it", drawings.length === ancDepN && drawings.includes(ancDep) && isAnchored(ancDep.body) && isAnchored(ancKeep.body));

      const ancDepLink = anchorOf(ancDep.body);
      const ancDepReleased = !!ancDepLink && drawings.includes(ancDep);
      if (ancDepLink) {
        const ancDepMid = { x: (ancDepLink.a.x + ancDepLink.b.x) / 2, y: (ancDepLink.a.y + ancDepLink.b.y) / 2 };
        const ancDepMidScr = worldToScreen(ancDepMid.x, ancDepMid.y);
        onPointerDown({ button: 2, clientX: ancDepMidScr.x, clientY: ancDepMidScr.y, pointerId: 44 });
      }
      check("right click on the dependent link releases only that body", ancDepReleased && !isAnchored(ancDep.body) && isAnchored(ancKeep.body) && drawings.includes(ancDep));
      const ancDepFree = ancDep.body.getPosition();
      const ancDepFreeScr = worldToScreen(ancDepFree.x - 0.3, ancDepFree.y);
      onPointerDown({ button: 2, clientX: ancDepFreeScr.x, clientY: ancDepFreeScr.y, pointerId: 45 });
      check("right click deletes the body after the link is gone", !drawings.includes(ancDep) && drawings.includes(ancKeep) && isAnchored(ancKeep.body));

      // Zwei freie Körper: starr verbunden, als Ganzes gezogen, am Boden eingefroren, im Zettel erhalten.
      buildLevel(LEVELS["ein-klotz"]);
      const joinA = ancRect(8, 6, 1.4, 0.9, "#3c7fd6");
      const joinB = ancRect(8.1, 6.92, 1.1, 0.7, "#d94b3a");
      joinA.color = "#2244aa";
      if (joinA.meta && joinA.meta.outline) joinA.meta.outline.color = "#2244aa";
      const joinStroke = tryAnchorGesture([
        { x: 8.5, y: 6.4 },
        { x: 8.55, y: 6.85 },
        { x: 8.6, y: 7.25 },
      ]);
      const joinLoc = joinA.body.getLocalPoint(joinB.body.getPosition());
      const joinRel = joinB.body.getAngle() - joinA.body.getAngle();
      joinA.body.setLinearVelocity(V(2.2, 0.6));
      joinA.body.setAngularVelocity(0.7);
      joinA.body.setAwake(true);
      for (let i = 0; i < 36; i++) step(i % 3 === 0 ? 1 / 50 : i % 3 === 1 ? 1 / 70 : 1 / 60);
      const joinLoc2 = joinA.body.getLocalPoint(joinB.body.getPosition());
      const joinRel2 = joinB.body.getAngle() - joinA.body.getAngle();
      const joinErr = Math.hypot(joinLoc2.x - joinLoc.x, joinLoc2.y - joinLoc.y);
      lines.push("INFO weld drift " + joinErr.toFixed(4) + " ang " + Math.abs(joinRel2 - joinRel).toFixed(4));
      check("welded bodies stay one object under uneven steps", joinStroke === "anchor" && anchorOf(joinB.body) && anchorOf(joinB.body).weld && joinB.color === "#2244aa" && joinErr < 0.03 && Math.abs(joinRel2 - joinRel) < 0.05 && joinA.body.isDynamic() && joinB.body.isDynamic());

      joinA.body.setLinearVelocity(V(0, 0));
      joinA.body.setAngularVelocity(0);
      joinB.body.setLinearVelocity(V(0, 0));
      joinB.body.setAngularVelocity(0);
      const joinX0 = joinA.body.getPosition().x;
      const joinBx0 = joinB.body.getPosition().x;
      const joinLink = anchorOf(joinB.body);
      const joinEnds0 = anchorLinkEnds(joinLink);
      const joinMid0 = { x: (joinEnds0.a.x + joinEnds0.b.x) / 2, y: (joinEnds0.a.y + joinEnds0.b.y) / 2 };
      const joinGrab = beginDrag(joinX0, joinA.body.getPosition().y);
      moveDrag(joinX0 + 1.6, joinA.body.getPosition().y + 0.3);
      for (let i = 0; i < 24; i++) step(i % 2 ? 1 / 50 : 1 / 60);
      const joinMoved = joinA.body.getPosition().x - joinX0;
      const joinBMoved = joinB.body.getPosition().x - joinBx0;
      const joinLoc3 = joinA.body.getLocalPoint(joinB.body.getPosition());
      const joinDragErr = Math.hypot(joinLoc3.x - joinLoc.x, joinLoc3.y - joinLoc.y);
      endDrag();
      check("dragging one welded body drags the other", !!joinGrab && !!freeNailGroup(joinA.body) && joinMoved > 0.8 && joinBMoved > 0.6 && joinDragErr < 0.05);
      const joinEnds1 = anchorLinkEnds(joinLink);
      const joinMid1 = { x: (joinEnds1.a.x + joinEnds1.b.x) / 2, y: (joinEnds1.a.y + joinEnds1.b.y) / 2 };
      const joinExpectA = joinA.body.getWorldPoint(V(joinLink.localA.x, joinLink.localA.y));
      const joinExpectB = joinB.body.getWorldPoint(V(joinLink.localB.x, joinLink.localB.y));
      const joinFollow = Math.hypot(joinEnds1.a.x - joinExpectA.x, joinEnds1.a.y - joinExpectA.y) + Math.hypot(joinEnds1.b.x - joinExpectB.x, joinEnds1.b.y - joinExpectB.y);
      const joinLeft = Math.hypot(joinEnds1.a.x - joinEnds0.a.x, joinEnds1.a.y - joinEnds0.a.y);
      check("the join stroke moves with the welded bodies", !!joinLink.localA && !!joinLink.localB && joinFollow < 0.001 && joinLeft > 0.6 && !anchorLinkAt(joinMid0.x, joinMid0.y) && anchorLinkAt(joinMid1.x, joinMid1.y) === joinLink);

      const joinN = drawings.length;
      const joinFar = joinA.body.getWorldPoint(V(0.55, -0.32));
      const joinFarScr = worldToScreen(joinFar.x, joinFar.y);
      onPointerDown({ button: 2, clientX: joinFarScr.x, clientY: joinFarScr.y, pointerId: 61 });
      check("right click on a welded body does not delete it", drawings.length === joinN && drawings.includes(joinA) && inAnchorLink(joinA.body) && inAnchorLink(joinB.body));
      const joinHitScr = worldToScreen(joinMid1.x, joinMid1.y);
      onPointerDown({ button: 2, clientX: joinHitScr.x, clientY: joinHitScr.y, pointerId: 62 });
      check("right click on the moved join stroke releases it", !inAnchorLink(joinA.body) && !inAnchorLink(joinB.body) && drawings.includes(joinA) && drawings.includes(joinB));

      const joinC = ancRect(16, 6, 1.2, 0.8, "#3c7fd6");
      const joinD = ancRect(17.55, 6, 1.0, 0.7, "#d94b3a");
      const joinMiss = tryAnchorGesture([{ x: 16.4, y: 6.35 }, { x: 16.9, y: 6.4 }, { x: 17.7, y: 6.32 }]);
      check("short stroke between separated bodies does not join them", joinMiss === "miss" && !anchorOf(joinD.body) && joinC.body.isDynamic() && joinD.body.isDynamic());

      const joinE = ancRect(22, 1.45, 1.3, 0.8, "#3c7fd6");
      const joinF = ancRect(22.15, 2.28, 1.0, 0.7, "#d94b3a");
      joinE.color = "#2244aa";
      if (joinE.meta && joinE.meta.outline) joinE.meta.outline.color = "#2244aa";
      const joinUp = tryAnchorGesture([
        { x: 22.5, y: 1.8 },
        { x: 22.55, y: 2.2 },
        { x: 22.6, y: 2.55 },
      ]);
      for (let i = 0; i < 50; i++) step(1 / 60);
      const joinFp = joinF.body.getPosition();
      const joinGround = tryAnchorGesture([{ x: joinFp.x, y: 1.2 }, { x: joinFp.x, y: joinFp.y }]);
      check("anchoring one piece of a joined object freezes the whole object", joinUp === "anchor" && joinGround === "anchor" && joinE.body.isStatic() && joinF.body.isStatic() && anchorOf(joinE.body) && anchorOf(joinE.body).freeze && anchorOf(joinE.body).base === ground && anchorOf(joinF.body).weld && !anchorOf(joinF.body).joint && joinE.color === "#3f8f55" && joinF.color === "#3f8f55");
      releaseAnchor(joinE.body);
      const joinStill = anchorOf(joinF.body);
      check("releasing the ground link keeps the joined object in one piece", joinE.body.isDynamic() && joinF.body.isDynamic() && !!joinStill && joinStill.weld && !!joinStill.joint && joinE.color === "#2244aa" && joinF.color === "#2244aa");

      const joinBefore = anchors.filter((a) => a.weld).length;
      const joinText = encodeSceneTextSync(captureScene());
      const joinLoad = loadSceneFromTextSync(joinText);
      let joinJoints = 0;
      for (let j = world.getJointList(); j; j = j.getNext()) {
        if (String(jointTypeName(j)).indexOf("weld") >= 0) joinJoints++;
      }
      const joinBack = anchors.filter((a) => a.weld && a.joint && jointAlive(world, a.joint) && a.body.isDynamic() && a.base.isDynamic());
      const joinStrokeFollows = joinBack.length > 0 && joinBack.every((link) => {
        const ends = anchorLinkEnds(link);
        const hostA = drawings.find((d) => d.body === link.base);
        const hostB = drawings.find((d) => d.body === link.body);
        return !!link.localA && !!link.localB && !!hostA && !!hostB && insideDraw(hostA, ends.a.x, ends.a.y, 0.12) && insideDraw(hostB, ends.b.x, ends.b.y, 0.12);
      });
      check("welded bodies survive scene export and import", !!(joinLoad && joinLoad.ok) && joinBack.length === joinBefore && joinJoints === joinBefore);
      check("imported join strokes sit on their bodies", joinStrokeFollows);

      // Auflage: nur von unten nach oben verbinden. Der tragende Körper bleibt liegen.
      buildLevel(LEVELS["ein-klotz"]);
      const restLo = ancRect(26, 6, 2.4, 1.6, "#3c7fd6");
      const restHi = ancRect(26.4, 7.62, 1.2, 0.8, "#d94b3a");
      const restApp = bodyApproach(restLo.body, restHi.body);
      lines.push("INFO rest ny " + restApp.ny.toFixed(3) + " gap " + restApp.distance.toFixed(3));
      const loPos = restLo.body.getPosition();
      const hiPos = restHi.body.getPosition();
      const restEdge = { x: loPos.x - 1.05, y: loPos.y };
      check("a loaded body is not grabbed", pressKind(loPos.x, loPos.y) === "draw" && pressKind(restEdge.x, restEdge.y) === "draw");
      check("the body on top can be grabbed", pressKind(hiPos.x, hiPos.y) === "drag");
      const downStroke = tryAnchorGesture([
        { x: hiPos.x, y: hiPos.y },
        { x: hiPos.x, y: (hiPos.y + loPos.y) / 2 },
        { x: loPos.x, y: loPos.y },
      ]);
      check("a stroke from the load down does not join", downStroke !== "anchor" && !anchorOf(restHi.body) && !anchorOf(restLo.body));
      const restExit = [
        { x: loPos.x, y: loPos.y },
        { x: loPos.x + 0.5, y: loPos.y },
        { x: loPos.x + 1.3, y: loPos.y },
      ];
      pointer = { id: 82, pts: restExit.slice(), trail: restExit.slice(), moved: true, grab: null, dragging: false };
      check("leaving a loaded body does not drag it", !tryAdoptCenterGrab(pointer.trail) && !playDrag && Math.abs(restLo.body.getPosition().x - loPos.x) < 0.01);
      pointer = null;
      const restUp = [
        { x: loPos.x, y: loPos.y },
        { x: loPos.x, y: (loPos.y + hiPos.y) / 2 },
        { x: hiPos.x, y: hiPos.y },
      ];
      pointer = { id: 83, pts: restUp.slice(), trail: restUp.slice(), moved: true, grab: null, dragging: false };
      check("an upward rest stroke is not stolen as a grab", !tryAdoptAnchorGrab(pointer.trail) && !playDrag);
      pointer = null;
      const restJoin = tryAnchorGesture(restUp);
      check("a stroke from the support up into the load joins them", restJoin === "anchor" && anchorOf(restHi.body) && anchorOf(restHi.body).base === restLo.body && anchorOf(restHi.body).weld);
      check("a joined pair can be grabbed", pressKind(restEdge.x, restEdge.y) === "drag");
      const sideA = ancRect(12, 10, 1.2, 0.8, "#3c7fd6");
      const sideB = ancRect(13.22, 10, 1.0, 0.8, "#d94b3a");
      const sideApp = bodyApproach(sideA.body, sideB.body);
      lines.push("INFO side ny " + sideApp.ny.toFixed(3) + " gap " + sideApp.distance.toFixed(3));
      check("bodies side by side can both be moved", pressKind(12.3, 10.4) === "drag" && pressKind(13.5, 10.4) === "drag");
      const sideStroke = tryAnchorGesture([{ x: 12.4, y: 10.4 }, { x: 13.0, y: 10.4 }, { x: 13.6, y: 10.4 }]);
      check("a sideways stroke does not join bodies", sideStroke !== "anchor" && !anchorOf(sideA.body) && !anchorOf(sideB.body));
    }

    function circRing(cx, cy, rx, ry, n, wob1, wob2) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wob = 1 + wob1 * Math.sin(a * 3) + wob2 * Math.sin(a * 5 + 0.4);
        pts.push({ x: cx + Math.cos(a) * rx * wob, y: cy + Math.sin(a) * ry * wob });
      }
      return pts;
    }

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(circRing(12, 6, 1.05, 0.95, 28, 0.07, 0.03), "#3c7fd6");
    const circHand = drawings.find((d) => d.kind === "roller");
    const circHandShape = circHand && circHand.body.getFixtureList().getShape();
    check("shaky slightly oval freehand stroke is a circle", !!circHand && circHandShape && circHandShape.m_type === "circle" && Math.abs(circHand.r - 1) < 0.15);

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(circRing(14, 7, 1.1, 1.0, 30, 0.08, 0.03), "#7a4fbf");
    const circHand2 = drawings.find((d) => d.kind === "roller");
    check("another shaky freehand loop is a circle", !!circHand2 && circHand2.kind === "roller");

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 10, y: 5 }, { x: 11.2, y: 4.6 }, { x: 12.5, y: 5.1 }, { x: 12.8, y: 6.3 },
      { x: 11.9, y: 7.4 }, { x: 10.4, y: 7.1 }, { x: 9.6, y: 6.0 }, { x: 10, y: 5 },
    ], "#8d5a34");
    const circRockA = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("irregular rock stays a polygon", !!circRockA && circRockA.kind === "solid" && circRockA.meta.outline.local.length >= 5 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 8, y: 3 }, { x: 10.5, y: 3.2 }, { x: 11.8, y: 3.8 }, { x: 12.0, y: 4.6 },
      { x: 10.8, y: 5.3 }, { x: 9.2, y: 5.5 }, { x: 7.6, y: 4.9 }, { x: 7.4, y: 3.8 }, { x: 8, y: 3 },
    ], "#d94b3a");
    const circRockB = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("elongated rock stays a polygon", !!circRockB && circRockB.kind === "solid" && circRockB.meta.outline.local.length >= 5 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke([
      { x: 9, y: 4 }, { x: 10, y: 4 }, { x: 11, y: 5 }, { x: 11, y: 6 },
      { x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 6 }, { x: 8, y: 5 }, { x: 9, y: 4 },
    ], "#3e9a48");
    const circGeoRound = drawings.find((d) => d.kind === "roller");
    check("geodreieck shape without a right angle becomes a circle", !!circGeoRound && circGeoRound.kind === "roller");

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke([
      { x: 8, y: 4 }, { x: 12, y: 4 }, { x: 10, y: 7 }, { x: 8, y: 4 },
    ], "#ef8b2c");
    const circGeoTri = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("geodreieck triangle without a right angle stays a polygon", !!circGeoTri && circGeoTri.kind === "solid" && circGeoTri.meta.outline.local.length === 3 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke([
      { x: 8, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 4 },
    ], "#3c7fd6");
    const circGeoRect = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("geodreieck rectangle with right angles stays a polygon", !!circGeoRect && circGeoRect.kind === "solid" && circGeoRect.meta.outline.local.length === 4 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke([
      { x: 8, y: 4 }, { x: 12, y: 4 }, { x: 8, y: 7 }, { x: 8, y: 4 },
    ], "#7a4fbf");
    const circGeoRight = drawings.find((d) => d.kind === "solid" && !d.preset);
    const circGeoRightAng = circGeoRight ? interiorAngles(circGeoRight.meta.outline.local).map((a) => a * 180 / Math.PI) : [];
    check("geodreieck right triangle stays a polygon", !!circGeoRight && circGeoRight.kind === "solid" && circGeoRight.meta.outline.local.length === 3 && circGeoRightAng.some((a) => Math.abs(a - 90) < 2) && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));
    geoSnap = false;

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(circRing(16, 7, 1.1, 0.98, 24, 0.12, 0.05), "#3c7fd6");
    const circNoisy = drawings.find((d) => d.kind === "roller");
    check("noisy freehand circle with uneven radius is a circle", !!circNoisy && circNoisy.kind === "roller");

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(circRing(15, 6.5, 1.28, 1.0, 22, 0.08, 0.04), "#7a4fbf");
    const circOval = drawings.find((d) => d.kind === "roller");
    check("slightly more oval scratchy loop is a circle", !!circOval && circOval.kind === "roller");

    buildLevel(LEVELS["ein-klotz"]);
    const circOpenPts = circRing(13, 6, 1.05, 0.95, 24, 0.10, 0.04);
    circOpenPts.splice(-2, 2);
    commitStroke(circOpenPts, "#ef8b2c");
    const circOpen = drawings.find((d) => d.kind === "roller");
    check("almost closed noisy loop is a circle", !!circOpen && circOpen.kind === "roller");

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(circRing(14, 7, 1.05, 0.98, 12, 0.05, 0.02), "#3e9a48");
    const circFew = drawings.find((d) => d.kind === "roller");
    check("coarse twelve-point loop is a circle", !!circFew && circFew.kind === "roller");

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 8, y: 4 }, { x: 10.2, y: 3.7 }, { x: 11.6, y: 5.0 },
      { x: 11.0, y: 6.8 }, { x: 9.1, y: 7.2 }, { x: 7.6, y: 5.6 }, { x: 8, y: 4 },
    ], "#8d5a34");
    const circSixRock = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("six-corner rock stays a polygon", !!circSixRock && circSixRock.kind === "solid" && circSixRock.meta.outline.local.length >= 5 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 8, y: 4 }, { x: 12, y: 4 }, { x: 10, y: 7 }, { x: 8, y: 4 },
    ], "#d94b3a");
    const circFreeTri = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("freehand triangle stays a polygon", !!circFreeTri && circFreeTri.kind === "solid" && circFreeTri.meta.outline.local.length === 3 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    const circDense = [];
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI / 2 + Math.PI * i / 40;
      circDense.push({ x: 16 + Math.cos(a) * 1.15, y: 7 + Math.sin(a) * 1.15 });
    }
    for (let i = 1; i < 8; i++) {
      const a = Math.PI / 2 + Math.PI * i / 8;
      circDense.push({ x: 16 + Math.cos(a) * 1.15, y: 7 + Math.sin(a) * 1.15 });
    }
    circDense.push({ x: 16 + Math.cos(-Math.PI / 2) * 1.15, y: 7 + Math.sin(-Math.PI / 2) * 1.15 });
    commitStroke(circDense, "#3c7fd6");
    const circUneven = drawings.find((d) => d.kind === "roller");
    check("unevenly sampled circle is a circle", !!circUneven && circUneven.kind === "roller");

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke([
      { x: 8, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 4 },
    ], "#3c7fd6");
    const circSquare = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("square stays a polygon", !!circSquare && circSquare.kind === "solid" && circSquare.meta.outline.local.length === 4 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    {
      // Knapp über der Kringel-Grenze (0,62 m). Dieselbe relative Krakeligkeit
      // wie bei einem großen Kreis, plus ein paar Zentimeter Handzittern.
      geoSnap = false;
      buildLevel(LEVELS["ein-klotz"]);
      const scPts = circRing(15, 8, 0.42, 0.40, 36, 0.06, 0.03);
      for (let sci = 0; sci < scPts.length; sci++) {
        scPts[sci].x += 0.015 * Math.sin(sci * 2.3);
        scPts[sci].y += 0.012 * Math.cos(sci * 1.7);
      }
      commitStroke(scPts, "#3c7fd6");
      const scBall = drawings.find((d) => !d.preset && (d.kind === "roller" || d.kind === "blob"));
      check("a small shaky circle becomes a ball", !!scBall);
      buildLevel(LEVELS["ein-klotz"]);
      commitStroke([
        { x: 10, y: 6 }, { x: 10.72, y: 6.04 }, { x: 10.7, y: 6.74 }, { x: 10.02, y: 6.7 }, { x: 10, y: 6 },
      ], "#8d5a34");
      const scSq = drawings.find((d) => d.kind === "solid" && !d.preset);
      check("a small square stays a polygon", !!scSq && scSq.meta.outline.local.length === 4 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse" || d.kind === "blob"));
      buildLevel(LEVELS["ein-klotz"]);
      // Dieselbe Form wie „irregular rock“, auf knapp unter einen Meter verkleinert.
      const scRockSrc = [
        { x: 10, y: 5 }, { x: 11.2, y: 4.6 }, { x: 12.5, y: 5.1 }, { x: 12.8, y: 6.3 },
        { x: 11.9, y: 7.4 }, { x: 10.4, y: 7.1 }, { x: 9.6, y: 6.0 }, { x: 10, y: 5 },
      ];
      const scRock = scRockSrc.map((p) => ({ x: 16 + (p.x - 11.2) * 0.28, y: 8 + (p.y - 6) * 0.28 }));
      commitStroke(scRock, "#8d5a34");
      const scStone = drawings.find((d) => d.kind === "solid" && !d.preset);
      check("a small rock stays a polygon", !!scStone && scStone.meta.outline.local.length >= 5 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse" || d.kind === "blob"));
    }

    buildLevel(LEVELS["ein-klotz"]);
    const circHexPts = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      circHexPts.push({ x: 14 + Math.cos(a) * 1.5, y: 7 + Math.sin(a) * 1.5 });
    }
    commitStroke(circHexPts, "#8d5a34");
    const circHex = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("regular hexagon stays a polygon", !!circHex && circHex.kind === "solid" && circHex.meta.outline.local.length === 6 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    const circPentPts = [];
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      circPentPts.push({ x: 14 + Math.cos(a) * 1.5, y: 7 + Math.sin(a) * 1.5 });
    }
    commitStroke(circPentPts, "#ef8b2c");
    const circPent = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("regular pentagon stays a polygon", !!circPent && circPent.kind === "solid" && circPent.meta.outline.local.length === 5 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    const circLongPts = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      circLongPts.push({ x: 16 + Math.cos(a) * 2.0, y: 7 + Math.sin(a) * 1.0 });
    }
    commitStroke(circLongPts, "#7a4fbf");
    const circLong = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("two-to-one ellipse stays a polygon", !!circLong && circLong.kind === "solid" && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    {
      // Rechtsherum wird ein krakeliger Kringel eher eine Kugel, linksherum
      // eher ein Felsen. Sauber innerhalb oder klar außerhalb der alten
      // Grenzen entscheidet die Form in beiden Richtungen gleich.
      const cdMirror = (pts) => {
        let mx = 0;
        for (const p of pts) mx += p.x;
        mx /= pts.length;
        return pts.map((p) => ({ x: mx * 2 - p.x, y: p.y }));
      };
      const cdRing = (dir, wob) => {
        const pts = [];
        const n = 36;
        for (let i = 0; i <= n; i++) {
          const a = dir * (i / n) * Math.PI * 2;
          const wobble = 1 + wob * Math.sin(Math.abs(a) * 3) + wob * 0.4 * Math.sin(Math.abs(a) * 5 + 0.4);
          pts.push({ x: 14 + Math.cos(a) * 1.2 * wobble, y: 7 + Math.sin(a) * 1.15 * wobble });
        }
        return pts;
      };
      const cdKind = (pts) => {
        buildLevel(LEVELS["ein-klotz"]);
        commitStroke(pts, "#3c7fd6");
        const draw = drawings.find((d) => !d.preset && (d.kind === "roller" || d.kind === "solid" || d.kind === "ellipse"));
        return draw ? draw.kind : "none";
      };
      const cdRock = [
        { x: 10, y: 5 }, { x: 11.2, y: 4.6 }, { x: 12.5, y: 5.1 }, { x: 12.8, y: 6.3 },
        { x: 11.9, y: 7.4 }, { x: 10.4, y: 7.1 }, { x: 9.6, y: 6.0 }, { x: 10, y: 5 },
      ];
      const cdElong = [
        { x: 8, y: 3 }, { x: 10.5, y: 3.2 }, { x: 11.8, y: 3.8 }, { x: 12.0, y: 4.6 },
        { x: 10.8, y: 5.3 }, { x: 9.2, y: 5.5 }, { x: 7.6, y: 4.9 }, { x: 7.4, y: 3.8 }, { x: 8, y: 3 },
      ];
      const cdHex = [];
      for (let i = 0; i <= 6; i++) {
        const a = -(i / 6) * Math.PI * 2;
        cdHex.push({ x: 14 + Math.cos(a) * 1.5, y: 7 + Math.sin(a) * 1.5 });
      }
      check("a clockwise wobble becomes a ball", cdKind(cdRing(-1, 0.18)) === "roller");
      check("the same wobble counter-clockwise stays a rock", cdKind(cdRing(1, 0.18)) === "solid");
      check("a milder wobble is a ball either direction", cdKind(cdRing(1, 0.16)) === "roller" && cdKind(cdRing(-1, 0.16)) === "roller");
      check("a clean clockwise circle stays a ball", cdKind(cdRing(-1, 0)) === "roller");
      check("a roundish rock drawn clockwise becomes a ball", cdKind(cdMirror(cdRock)) === "roller");
      check("a clearly jagged rock stays a rock clockwise", cdKind(cdMirror(cdElong)) === "solid");
      check("a clockwise hexagon stays a polygon", cdKind(cdHex) === "solid");
      const cdOval = [];
      for (let i = 0; i <= 32; i++) {
        const a = -(i / 32) * Math.PI * 2;
        cdOval.push({ x: 16 + Math.cos(a) * 2, y: 7 + Math.sin(a) * 1 });
      }
      check("a clockwise flat oval stays a polygon", cdKind(cdOval) === "solid");
    }

    function ellipseStroke(cx, cy, ra, rb, rot, n) {
      const pts = [];
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      const count = n || 32;
      for (let i = 0; i <= count; i++) {
        const t = (i / count) * Math.PI * 2;
        const u = ra * Math.cos(t);
        const v = rb * Math.sin(t);
        pts.push({ x: cx + u * ca - v * sa, y: cy + u * sa + v * ca });
      }
      return pts;
    }
    function ellipseAxisDiff(got, want) {
      let d = Math.abs(got - want) % Math.PI;
      if (d > Math.PI / 2) d = Math.PI - d;
      return d;
    }

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(ellipseStroke(16, 7, 2.0, 1.0, 0, 32), "#7a4fbf");
    geoSnap = false;
    const geoEll12 = drawings.find((d) => d.kind === "ellipse");
    check("geodreieck two-to-one oval becomes an ellipse", !!geoEll12 && Math.abs(geoEll12.a - 2) < 0.15 && Math.abs(geoEll12.b - 1) < 0.12 && ellipseAxisDiff(geoEll12.angle, 0) < 8 * Math.PI / 180);

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(ellipseStroke(16, 7, 2.1, 0.7, 0, 32), "#7a4fbf");
    geoSnap = false;
    const geoEll13 = drawings.find((d) => d.kind === "ellipse");
    check("geodreieck three-to-one oval becomes an ellipse", !!geoEll13 && Math.abs(geoEll13.a / geoEll13.b - 3) < 0.35 && ellipseAxisDiff(geoEll13.angle, 0) < 8 * Math.PI / 180);

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(ellipseStroke(16, 7, 2.0, 1.0, 30 * Math.PI / 180, 32), "#7a4fbf");
    geoSnap = false;
    const geoEllRot = drawings.find((d) => d.kind === "ellipse");
    check("geodreieck rotated oval keeps its axes", !!geoEllRot && Math.abs(geoEllRot.a - 2) < 0.15 && Math.abs(geoEllRot.b - 1) < 0.12 && ellipseAxisDiff(geoEllRot.angle, 30 * Math.PI / 180) < 8 * Math.PI / 180);

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(ellipseStroke(16, 1.3 + 0.7 + 0.06, 2.0, 0.7, 0, 32), "#7a4fbf");
    geoSnap = false;
    const geoEllLie = drawings.find((d) => d.kind === "ellipse");
    if (geoEllLie) {
      for (let i = 0; i < 240; i++) step(1 / 60);
    }
    const liePos = geoEllLie ? geoEllLie.body.getPosition() : { x: 0, y: 0 };
    const lieAng = geoEllLie ? geoEllLie.body.getAngle() + geoEllLie.angle : 99;
    const lieW = geoEllLie ? Math.abs(geoEllLie.body.getAngularVelocity()) : 99;
    const lieVy = geoEllLie ? Math.abs(geoEllLie.body.getLinearVelocity().y) : 99;
    check("lying ellipse settles on its long side", !!geoEllLie && liePos.y < 1.3 + (geoEllLie.a + geoEllLie.b) * 0.5 && liePos.y > 1.3 + geoEllLie.b * 0.55 && ellipseAxisDiff(lieAng, 0) < 25 * Math.PI / 180 && lieW < 0.45 && lieVy < 0.45);

    function handEllipse(cx, cy, ra, rb, rot, n, wob, seed, gap) {
      const pts = [];
      const ca = Math.cos(rot);
      const sa = Math.sin(rot);
      let s = ((seed || 1) * 1103515245 + 12345) >>> 0;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000 - 0.5;
      };
      const count = n || 48;
      const last = gap ? count - 1 : count;
      for (let i = 0; i <= last; i++) {
        const t = ((i + rnd() * 0.35) / count) * Math.PI * 2;
        const u = ra * Math.cos(t) * (1 + rnd() * 2 * (wob || 0));
        const v = rb * Math.sin(t) * (1 + rnd() * 2 * (wob || 0));
        pts.push({
          x: cx + u * ca - v * sa + rnd() * (wob || 0) * ra * 0.4,
          y: cy + u * sa + v * ca + rnd() * (wob || 0) * ra * 0.4,
        });
      }
      return pts;
    }
    function playDrawWorld(worldPts, pointerId) {
      const s0 = worldToScreen(worldPts[0].x, worldPts[0].y);
      onPointerDown({ button: 0, clientX: s0.x, clientY: s0.y, pointerId });
      for (let i = 1; i < worldPts.length; i++) {
        const sc = worldToScreen(worldPts[i].x, worldPts[i].y);
        onPointerMove({ clientX: sc.x, clientY: sc.y, pointerId });
      }
      const last = worldPts[worldPts.length - 1];
      const sN = worldToScreen(last.x, last.y);
      onPointerUp({ button: 0, clientX: sN.x, clientY: sN.y, pointerId });
    }

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    const previewStart = worldToScreen(8.21, 4.19);
    onPointerDown({ button: 0, clientX: previewStart.x, clientY: previewStart.y, pointerId: 701 });
    check("geodreieck first ink stays off the grid", !!pointer && pointer.pts && pointer.pts.length === 1 && Math.abs(pointer.pts[0].x - 8.21) < 0.03 && Math.abs(pointer.pts[0].y - 4.19) < 0.03);
    const previewNext = worldToScreen(8.74, 4.74);
    onPointerMove({ clientX: previewNext.x, clientY: previewNext.y, pointerId: 701 });
    check("geodreieck preview stays unsnapped while drawing", !!pointer && pointer.pts.some((p) => Math.abs(p.x - 8.74) < 0.05 && Math.abs(p.y - 4.74) < 0.05));
    onPointerUp({ button: 0, clientX: previewNext.x, clientY: previewNext.y, pointerId: 701 });
    geoSnap = false;

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    const hand12 = handEllipse(16, 7, 2.0, 1.0, 30 * Math.PI / 180, 48, 0.05, 7, false);
    const snapped12 = snapStrokePoints(hand12);
    finishPlayStroke(hand12, hand12);
    geoSnap = false;
    const geoHand12 = drawings.find((d) => d.kind === "ellipse");
    check("grid-snapped hand oval would have right angles", hasRightAngle(closedRing(snapped12) || snapped12));
    check("hand-drawn 1:2 oval with geodreieck is an ellipse", !!geoHand12 && Math.abs(geoHand12.a - 2) < 0.35 && Math.abs(geoHand12.b - 1) < 0.3 && ellipseAxisDiff(geoHand12.angle, 30 * Math.PI / 180) < 18 * Math.PI / 180);

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    // 1:1,5 bei a=2,1 / b=1,4: a-b=0,7 liegt unter 0,15*a + 1 Rasterweite (0,815), daher Kreis.
    playDrawWorld(handEllipse(16, 7, 2.1, 1.4, 0, 56, 0.06, 11, false), 702);
    geoSnap = false;
    check("pointer-drawn mid-size 1:1.5 oval with geodreieck is a circle", !!drawings.find((d) => d.kind === "roller") && !drawings.some((d) => d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    finishPlayStroke(handEllipse(16, 7, 2.1, 0.7, 20 * Math.PI / 180, 36, 0.06, 19, true), handEllipse(16, 7, 2.1, 0.7, 20 * Math.PI / 180, 36, 0.06, 19, true));
    geoSnap = false;
    check("hand-drawn 1:3 oval with a gap is an ellipse", !!drawings.find((d) => d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    finishPlayStroke(handEllipse(16, 7, 1.6, 0.8, 55 * Math.PI / 180, 20, 0.07, 23, false), handEllipse(16, 7, 1.6, 0.8, 55 * Math.PI / 180, 20, 0.07, 23, false));
    geoSnap = false;
    check("sparse jittered oval with geodreieck is an ellipse", !!drawings.find((d) => d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(ellipseStroke(16, 7, 3.0, 2.2, 0, 32), "#7a4fbf");
    geoSnap = false;
    const nearRoundGap = drawings.find((d) => d.kind === "roller");
    check("near-round 3-by-2.2 oval becomes a circle", !!nearRoundGap && !drawings.some((d) => d.kind === "ellipse") && Math.abs(nearRoundGap.r - 2.6) < 0.15);

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(ellipseStroke(16, 7, 3.0, 1.8, 0, 32), "#7a4fbf");
    geoSnap = false;
    const clearGapEll = drawings.find((d) => d.kind === "ellipse");
    check("3-by-1.8 oval stays an ellipse", !!clearGapEll && Math.abs(clearGapEll.a - 3) < 0.15 && Math.abs(clearGapEll.b - 1.8) < 0.12);

    let geoHits = 0;
    let geoTotal = 0;
    let geoEllHits = 0;
    let geoCircHits = 0;
    const geoCases = [
      // Die vier nahezu runden Fälle (a-b unter 0,15*a + Rasterweite) sollen Kreise werden,
      // zählen in der Quote aber weiter als erkannt (Ellipse oder Kreis, nicht Vieleck).
      [1.8, 1.2, 0, 64, 0.04, 1, false],
      [2.0, 1.0, 15, 48, 0.05, 2, false],
      [2.1, 0.7, 0, 40, 0.05, 3, false],
      [1.6, 0.8, 40, 28, 0.07, 4, false],
      [2.4, 1.2, 70, 80, 0.04, 5, false],
      [1.5, 1.0, 10, 22, 0.06, 6, false],
      [2.0, 1.0, 30, 16, 0.05, 7, false],
      [2.2, 0.9, 55, 36, 0.08, 8, true],
      [1.7, 1.1, 25, 52, 0.06, 9, false],
      [2.0, 0.7, 5, 44, 0.05, 10, true],
      [1.4, 0.9, 65, 30, 0.07, 11, false],
      [2.5, 1.0, 45, 60, 0.05, 12, false],
    ];
    for (const [ra, rb, deg, n, wob, seed, gap] of geoCases) {
      geoTotal += 1;
      buildLevel(LEVELS["ein-klotz"]);
      geoSnap = true;
      const raw = handEllipse(16, 7, ra, rb, deg * Math.PI / 180, n, wob, seed, gap);
      finishPlayStroke(raw, raw);
      geoSnap = false;
      if (drawings.some((d) => d.kind === "ellipse")) geoEllHits += 1;
      if (drawings.some((d) => d.kind === "roller")) geoCircHits += 1;
      if (drawings.some((d) => d.kind === "ellipse" || d.kind === "roller")) geoHits += 1;
    }
    lines.push("INFO geo hand-ellipse " + geoHits + "/" + geoTotal + " (ellipses " + geoEllHits + ", circles " + geoCircHits + ")");
    check("most hand-drawn ovals with geodreieck become ellipses or circles", geoHits >= 10);

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    finishPlayStroke([
      { x: 8.15, y: 4.12 }, { x: 9.3, y: 4.08 }, { x: 10.7, y: 3.95 }, { x: 11.9, y: 4.18 },
      { x: 12.08, y: 5.1 }, { x: 11.95, y: 6.2 }, { x: 12.1, y: 6.92 },
      { x: 10.8, y: 7.08 }, { x: 9.2, y: 6.9 }, { x: 8.08, y: 7.05 },
      { x: 7.92, y: 5.8 }, { x: 8.1, y: 4.9 }, { x: 8.15, y: 4.12 },
    ], [
      { x: 8.15, y: 4.12 }, { x: 9.3, y: 4.08 }, { x: 10.7, y: 3.95 }, { x: 11.9, y: 4.18 },
      { x: 12.08, y: 5.1 }, { x: 11.95, y: 6.2 }, { x: 12.1, y: 6.92 },
      { x: 10.8, y: 7.08 }, { x: 9.2, y: 6.9 }, { x: 8.08, y: 7.05 },
      { x: 7.92, y: 5.8 }, { x: 8.1, y: 4.9 }, { x: 8.15, y: 4.12 },
    ]);
    geoSnap = false;
    const geoWobRect = drawings.find((d) => d.kind === "solid" && !d.preset);
    const geoWobAng = geoWobRect ? interiorAngles(geoWobRect.meta.outline.local).map((a) => a * 180 / Math.PI) : [];
    check("geodreieck wobbly rectangle stays a polygon", !!geoWobRect && geoWobRect.kind === "solid" && geoWobRect.meta.outline.local.length === 4 && geoWobAng.every((a) => Math.abs(a - 90) < 2) && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    finishPlayStroke([
      { x: 8.12, y: 4.08 }, { x: 10.9, y: 4.15 }, { x: 13.88, y: 4.18 },
      { x: 12.1, y: 6.3 }, { x: 10.25, y: 8.62 },
      { x: 9.1, y: 6.2 }, { x: 8.12, y: 4.08 },
    ], [
      { x: 8.12, y: 4.08 }, { x: 10.9, y: 4.15 }, { x: 13.88, y: 4.18 },
      { x: 12.1, y: 6.3 }, { x: 10.25, y: 8.62 },
      { x: 9.1, y: 6.2 }, { x: 8.12, y: 4.08 },
    ]);
    geoSnap = false;
    const geoWobTri = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("geodreieck non-right triangle stays a polygon", !!geoWobTri && geoWobTri.kind === "solid" && geoWobTri.meta.outline.local.length === 3 && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    function diaRng(seed) {
      let s = (seed >>> 0) || 1;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }
    function rotPt(x, y, ca, sa, cx, cy) {
      return { x: cx + x * ca - y * sa, y: cy + x * sa + y * ca };
    }
    function squareStroke(cx, cy, hw, hh, rotDeg, kind, seed) {
      const a = rotDeg * Math.PI / 180;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const corners = [
        rotPt(-hw, -hh, ca, sa, cx, cy),
        rotPt(hw, -hh, ca, sa, cx, cy),
        rotPt(hw, hh, ca, sa, cx, cy),
        rotPt(-hw, hh, ca, sa, cx, cy),
      ];
      const rand = diaRng(seed);
      let pts = [];
      const startEdge = kind === "mid" ? 0 : 0;
      const startT = kind === "mid" ? 0.48 : 0;
      for (let e = 0; e < 4; e++) {
        const i = (startEdge + e) % 4;
        const a0 = corners[i];
        const a1 = corners[(i + 1) % 4];
        const len = Math.hypot(a1.x - a0.x, a1.y - a0.y) || 1;
        const nx = -(a1.y - a0.y) / len;
        const ny = (a1.x - a0.x) / len;
        const nSamp = kind === "clean" ? 3 : 7;
        for (let k = 0; k < nSamp; k++) {
          let t = k / nSamp;
          if (e === 0) t = startT + (1 - startT) * t;
          if (t >= 0.999) continue;
          let wob = 0;
          if (kind === "hand" || kind === "gap" || kind === "mid") {
            wob = (rand() - 0.5) * 0.14 + 0.05 * Math.sin((t + e) * 6 + seed * 0.1);
          }
          pts.push({ x: a0.x + (a1.x - a0.x) * t + nx * wob, y: a0.y + (a1.y - a0.y) * t + ny * wob });
        }
      }
      if (kind === "gap") {
        if (pts.length > 6) pts = pts.slice(0, Math.max(5, pts.length - 2));
        return pts;
      }
      if (kind === "mid") {
        pts.push({ x: pts[0].x + (rand() - 0.5) * 0.08, y: pts[0].y + (rand() - 0.5) * 0.08 });
        return pts;
      }
      pts.push({ x: pts[0].x, y: pts[0].y });
      return pts;
    }
    function rautenOk(draw, rotDeg) {
      if (!draw || draw.kind !== "solid" || !draw.meta || !draw.meta.outline) return false;
      const loc = draw.meta.outline.local;
      if (!loc || loc.length !== 4) return false;
      const angs = interiorAngles(loc).map((a) => a * 180 / Math.PI);
      if (!angs.every((a) => Math.abs(a - 90) < 6)) return false;
      let best = -1;
      let edgeAng = 0;
      for (let i = 0; i < loc.length; i++) {
        const q = loc[(i + 1) % loc.length];
        const len = Math.hypot(q.x - loc[i].x, q.y - loc[i].y);
        if (len > best) {
          best = len;
          edgeAng = Math.atan2(q.y - loc[i].y, q.x - loc[i].x) * 180 / Math.PI;
        }
      }
      let line = Math.abs(edgeAng) % 90;
      if (line > 45) line = 90 - line;
      const want = ((Math.abs(rotDeg) % 90) > 45) ? 90 - (Math.abs(rotDeg) % 90) : (Math.abs(rotDeg) % 90);
      return Math.abs(line - want) < 10;
    }
    function rautenKind(draw) {
      if (!draw) return "none";
      if (draw.kind === "roller") return "circle";
      if (draw.kind === "ellipse") return "ellipse";
      if (draw.kind === "solid" && draw.meta && draw.meta.outline) return "n" + draw.meta.outline.local.length;
      return draw.kind;
    }

    const rautenAngles = [0, 25, 30, 45, 60];
    const rautenModes = ["free", "geo"];
    const rautenKinds = ["clean", "hand", "gap", "mid"];
    for (const modeName of rautenModes) {
      for (const ang of rautenAngles) {
        let ok = 0;
        let total = 0;
        const useGeo = modeName === "geo";
        for (const kind of rautenKinds) {
          const n = kind === "clean" ? 2 : 4;
          for (let i = 0; i < n; i++) {
            buildLevel(LEVELS["ein-klotz"]);
            geoSnap = useGeo;
            const stroke = squareStroke(16, 8, 1.6, 1.6, ang, kind, 100 + ang * 17 + i * 31 + (useGeo ? 7 : 0) + kind.length * 13);
            commitStroke(stroke);
            geoSnap = false;
            const draw = drawings.find((d) => (d.kind === "solid" && !d.preset) || d.kind === "roller" || d.kind === "ellipse");
            total += 1;
            if (rautenOk(draw, ang)) ok += 1;
          }
        }
        lines.push("INFO rauten " + modeName + "-" + ang + " " + ok + "/" + total);
        check("rauten " + modeName + " " + ang + " deg stay rotated rectangles", ok >= Math.ceil(total * 0.8));
      }
    }

    buildLevel(LEVELS["ein-klotz"]);
    const skew = squareStroke(16, 8, 1.7, 1.7, 45, "hand", 77);
    // pull one corner inward so one angle is about 85 degrees
    const skc = [
      { x: 14.4, y: 8.0 }, { x: 16.0, y: 6.3 }, { x: 17.6, y: 8.0 }, { x: 16.0, y: 9.55 }, { x: 14.4, y: 8.0 },
    ];
    geoSnap = false;
    commitStroke(skc);
    const skewDraw = drawings.find((d) => d.kind === "solid" && !d.preset);
    const skewAng = skewDraw ? interiorAngles(skewDraw.meta.outline.local).map((a) => a * 180 / Math.PI) : [];
    check("80-to-100 degree corners become right angles without geodreieck", !!skewDraw && skewDraw.meta.outline.local.length === 4 && skewAng.every((a) => Math.abs(a - 90) < 2));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(skc);
    geoSnap = false;
    const skewGeo = drawings.find((d) => d.kind === "solid" && !d.preset);
    const skewGeoAng = skewGeo ? interiorAngles(skewGeo.meta.outline.local).map((a) => a * 180 / Math.PI) : [];
    check("80-to-100 degree corners become right angles with geodreieck", !!skewGeo && skewGeo.meta.outline.local.length === 4 && skewGeoAng.every((a) => Math.abs(a - 90) < 2) && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke([
      { x: 16, y: 6.2 }, { x: 18.4, y: 8.0 }, { x: 16, y: 9.8 }, { x: 13.6, y: 8.0 }, { x: 16, y: 6.2 },
    ]);
    geoSnap = false;
    const rhomb = drawings.find((d) => d.kind === "solid" && !d.preset);
    const rhombAng = rhomb ? interiorAngles(rhomb.meta.outline.local).map((a) => a * 180 / Math.PI) : [];
    const rhombIsRect = rhombAng.length === 4 && rhombAng.every((a) => Math.abs(a - 90) < 8);
    check("acute rhombus is not forced into a rectangle", !!rhomb && rhomb.kind === "solid" && rhomb.meta.outline.local.length === 4 && !rhombIsRect && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));
    lines.push("INFO rhomb angles " + rhombAng.map((a) => a.toFixed(1)).join(","));

    function rotCorners(local, cx, cy, rotDeg) {
      const a = rotDeg * Math.PI / 180;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      return local.map((p) => ({ x: cx + p.x * ca - p.y * sa, y: cy + p.x * sa + p.y * ca }));
    }
    function wobbleCorners(corners, kind, seed) {
      const rand = diaRng(seed);
      let pts = [];
      const nSamp = kind === "clean" ? 3 : 7;
      for (let e = 0; e < 4; e++) {
        const a0 = corners[e];
        const a1 = corners[(e + 1) % 4];
        const len = Math.hypot(a1.x - a0.x, a1.y - a0.y) || 1;
        const nx = -(a1.y - a0.y) / len;
        const ny = (a1.x - a0.x) / len;
        for (let k = 0; k < nSamp; k++) {
          const t = k / nSamp;
          let wob = 0;
          if (kind !== "clean") wob = (rand() - 0.5) * 0.14 + 0.04 * Math.sin((t + e) * 6 + seed * 0.1);
          pts.push({ x: a0.x + (a1.x - a0.x) * t + nx * wob, y: a0.y + (a1.y - a0.y) * t + ny * wob });
        }
      }
      pts.push({ x: pts[0].x, y: pts[0].y });
      return pts;
    }
    function sideParallelDeg(loc, i, j) {
      const a = loc[i];
      const b = loc[(i + 1) % 4];
      const c = loc[j];
      const d = loc[(j + 1) % 4];
      const ax = b.x - a.x, ay = b.y - a.y;
      const bx = d.x - c.x, by = d.y - d.y + (d.y - c.y);
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      const cos = Math.abs((ax * bx + ay * by) / (la * lb));
      return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    }
    function quadGeometryOk(draw, expect) {
      if (!draw || draw.kind !== "solid" || !draw.meta || !draw.meta.outline) return false;
      const loc = draw.meta.outline.local;
      if (!loc || loc.length !== 4) return false;
      const angs = interiorAngles(loc).map((a) => a * 180 / Math.PI);
      const par02 = sideParallelDeg(loc, 0, 2) < 2.5;
      const par13 = sideParallelDeg(loc, 1, 3) < 2.5;
      const right = angs.map((a) => Math.abs(a - 90) < 2);
      const nRight = right.filter(Boolean).length;
      const kindOk = !draw.meta.quadKind || draw.meta.quadKind === expect;
      if (expect === "rect") return kindOk && right.every(Boolean) && par02 && par13;
      if (expect === "ramp") {
        if (!kindOk || nRight !== 2 || !(par02 || par13)) return false;
        const idx = [];
        for (let i = 0; i < 4; i++) if (right[i]) idx.push(i);
        const gap = Math.abs(idx[0] - idx[1]);
        return gap === 1 || gap === 3;
      }
      if (expect === "para") return kindOk && par02 && par13 && nRight < 3;
      if (expect === "trap") {
        if (!kindOk || par02 === par13) return false;
        const pair = par02 ? 0 : 1;
        const l1 = Math.hypot(loc[(pair + 1) % 4].x - loc[(pair + 2) % 4].x, loc[(pair + 1) % 4].y - loc[(pair + 2) % 4].y);
        const l2 = Math.hypot(loc[(pair + 3) % 4].x - loc[pair].x, loc[(pair + 3) % 4].y - loc[pair].y);
        const legs = Math.abs(l1 - l2) / Math.max(l1, l2) < 0.04;
        const baseA = Math.abs(angs[pair] - angs[(pair + 1) % 4]) < 2.5;
        return legs && baseA;
      }
      if (expect === "free") return (!draw.meta.quadKind || draw.meta.quadKind === "free") && nRight < 3;
      return false;
    }
    const formShapes = {
      rect: [{ x: -1.6, y: -0.9 }, { x: 1.6, y: -0.9 }, { x: 1.6, y: 0.9 }, { x: -1.6, y: 0.9 }],
      ramp: [{ x: -1.55, y: -0.75 }, { x: 1.55, y: -0.75 }, { x: 0.35, y: 0.75 }, { x: -1.55, y: 0.75 }],
      para: [{ x: -1.55, y: -0.7 }, { x: 1.15, y: -0.7 }, { x: 1.65, y: 0.7 }, { x: -1.05, y: 0.7 }],
      trap: [{ x: -1.7, y: -0.7 }, { x: 1.7, y: -0.7 }, { x: 1.05, y: 0.7 }, { x: -1.05, y: 0.7 }],
    };
    const formAngles = [0, 30, 45];
    const formModes = ["free", "geo"];
    const formKinds = ["clean", "hand", "hand"];
    const formRates = {};
    for (const formName of ["rect", "ramp", "para", "trap"]) {
      for (const modeName of formModes) {
        let ok = 0;
        let total = 0;
        formKinds.forEach((kind, ki) => {
          for (const ang of formAngles) {
            buildLevel(LEVELS["ein-klotz"]);
            geoSnap = modeName === "geo";
            const seed = 400 + formName.length * 17 + ang * 11 + ki * 29 + (geoSnap ? 5 : 0);
            const corners = rotCorners(formShapes[formName], 16, 8, ang);
            commitStroke(wobbleCorners(corners, kind, seed));
            geoSnap = false;
            const draw = drawings.find((d) => (d.kind === "solid" && !d.preset) || d.kind === "roller" || d.kind === "ellipse");
            total += 1;
            if (quadGeometryOk(draw, formName)) ok += 1;
          }
        });
        formRates[formName + "-" + modeName] = ok + "/" + total;
        lines.push("INFO quad-form " + formName + "-" + modeName + " " + ok + "/" + total);
        check("hand-drawn " + formName + " with " + modeName + " regularizes", ok >= Math.ceil(total * 0.8));
      }
    }

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = false;
    const rocky = rotCorners([{ x: -1.7, y: -0.85 }, { x: 1.85, y: -0.4 }, { x: 1.05, y: 1.2 }, { x: -1.15, y: 0.35 }], 16, 8, 12);
    commitStroke(wobbleCorners(rocky, "hand", 909));
    const rockFree = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("irregular free quad stays irregular without geodreieck", quadGeometryOk(rockFree, "free"));
    lines.push("INFO rock-free kind " + (rockFree && rockFree.meta ? (rockFree.meta.quadKind || "none") : "missing") + " n " + (rockFree && rockFree.meta && rockFree.meta.outline ? rockFree.meta.outline.local.length : 0));

    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(wobbleCorners(rocky, "hand", 909));
    geoSnap = false;
    const rockGeo = drawings.find((d) => d.kind === "solid" && !d.preset);
    const rockGeoKind = rockGeo && rockGeo.meta ? rockGeo.meta.quadKind : null;
    check("irregular quad is regularized with geodreieck", !!rockGeoKind && rockGeoKind !== "free" && quadGeometryOk(rockGeo, rockGeoKind));
    lines.push("INFO rock-geo kind " + (rockGeoKind || "missing"));

    geoSnap = false;


    {
      // Regression: handgezeichnete Quadrate wurden zum Kreis. Dichter Rohzug
      // wie von der Maus (alle 2 cm ein Punkt), wacklig, gerundete Ecken,
      // Start mitten auf einer Kante, Überschuss oder Lücke am Ende.
      const hqRng = (seed) => {
        let s = (seed >>> 0) || 1;
        return () => {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          return s / 4294967296;
        };
      };
      const hqSquare = (cx, cy, side, rotDeg, opt, seed) => {
        const rand = hqRng(seed);
        const h = side / 2;
        const rad = (opt.round || 0) * side;
        const cs = [[h, h], [-h, h], [-h, -h], [h, -h]];
        const outline = [];
        const segN = Math.max(8, Math.round(side / 0.01));
        for (let e = 0; e < 4; e++) {
          const c0 = cs[e];
          const c1 = cs[(e + 1) % 4];
          const c2 = cs[(e + 2) % 4];
          const dx = (c1[0] - c0[0]) / side;
          const dy = (c1[1] - c0[1]) / side;
          for (let k = 0; k < segN; k++) {
            const t = rad + (side - 2 * rad) * k / segN;
            outline.push([c0[0] + dx * t, c0[1] + dy * t]);
          }
          if (rad > 0) {
            const nx = (c2[0] - c1[0]) / side;
            const ny = (c2[1] - c1[1]) / side;
            const cc = [c1[0] - dx * rad + nx * rad, c1[1] - dy * rad + ny * rad];
            const aA = Math.atan2(c1[1] - dy * rad - cc[1], c1[0] - dx * rad - cc[0]);
            let dA = Math.atan2(c1[1] + ny * rad - cc[1], c1[0] + nx * rad - cc[0]) - aA;
            while (dA > Math.PI) dA -= Math.PI * 2;
            while (dA < -Math.PI) dA += Math.PI * 2;
            for (let k = 0; k < 12; k++) {
              const a = aA + dA * k / 12;
              outline.push([cc[0] + rad * Math.cos(a), cc[1] + rad * Math.sin(a)]);
            }
          }
        }
        const off = Math.floor((opt.start || 0) * outline.length);
        let path = outline.slice(off).concat(outline.slice(0, off));
        const extra = Math.round((opt.close || 0) * outline.length);
        if (extra > 0) path = path.concat(outline.slice(off, off + extra));
        else if (extra < 0) path = path.slice(0, path.length + extra);
        else path.push(path[0]);
        const wob = opt.wob || 0;
        const ph1 = rand() * 6.28;
        const ph2 = rand() * 6.28;
        const ca = Math.cos(rotDeg * Math.PI / 180);
        const sa = Math.sin(rotDeg * Math.PI / 180);
        const out = [];
        path.forEach((p, i) => {
          const s = i / path.length;
          const n = wob * side * (0.5 * Math.sin(s * Math.PI * 6 + ph1) + 0.3 * Math.sin(s * Math.PI * 14 + ph2)) + (rand() - 0.5) * wob * 0.3;
          const L = Math.hypot(p[0], p[1]) || 1;
          const x = p[0] + p[0] / L * n;
          const y = p[1] + p[1] / L * n;
          const q = { x: cx + x * ca - y * sa, y: cy + x * sa + y * ca };
          if (!out.length || dist(out[out.length - 1], q) > 0.02) out.push(q);
        });
        return out;
      };
      const hqOval = (cx, cy, R, seed, wob, ax, rotDeg) => {
        const rand = hqRng(seed);
        const n = Math.max(60, Math.round(Math.PI * 2 * R / 0.02));
        const ph = rand() * 6.28;
        const st = rand() * 6.28;
        const ca = Math.cos((rotDeg || 0) * Math.PI / 180);
        const sa = Math.sin((rotDeg || 0) * Math.PI / 180);
        const out = [];
        for (let i = 0; i <= n * 1.03; i++) {
          const t = st + Math.PI * 2 * i / n;
          const rr = R * (1 + wob * Math.sin(3 * t + ph) + wob * 0.5 * Math.sin(5 * t)) + (rand() - 0.5) * 0.01;
          const x = rr * Math.cos(t) * (ax || 1);
          const y = rr * Math.sin(t);
          out.push({ x: cx + x * ca - y * sa, y: cy + x * sa + y * ca });
        }
        return out;
      };
      const hqThin = (trail) => {
        const o = [trail[0]];
        for (const p of trail) if (dist(o[o.length - 1], p) > 0.04) o.push(p);
        return o;
      };
      const hqDraw = (trail, geo) => {
        buildLevel(LEVELS["ein-klotz"]);
        geoSnap = !!geo;
        finishPlayStroke(trail, hqThin(trail));
        geoSnap = false;
        const d = drawings.filter((x) => !x.preset).slice(-1)[0];
        if (!d) return "none";
        if (d.kind === "solid") return "solid" + (d.meta && d.meta.outline ? d.meta.outline.local.length : 0) + (d.meta && d.meta.quadKind ? ":" + d.meta.quadKind : "");
        return d.kind;
      };
      const hqVariants = [
        { wob: 0.01, round: 0 },
        { wob: 0.025, round: 0.05 },
        { wob: 0.02, round: 0.12, start: 0.37, close: 0.04 },
        { wob: 0.035, round: 0.08, start: 0.6, close: -0.03 },
        { wob: 0.015, round: 0.2, start: 0.1, close: 0.06 },
        { wob: 0.02, round: 0.3, start: 0.2, close: 0.03 },
        { wob: 0.05, round: 0.1, start: 0.8, close: 0.05 },
      ];
      for (const hqGeo of [false, true]) {
        const tag = hqGeo ? "geo" : "free";
        let ok = 0;
        let total = 0;
        let asCircle = 0;
        [0.8, 1.2, 2, 3, 4].forEach((side, si) => [0, 30, 45].forEach((rot, ri) => hqVariants.forEach((v, vi) => {
          const got = hqDraw(hqSquare(16, 8, side, rot, v, 1000 + si * 97 + ri * 13 + vi * 7), hqGeo);
          total += 1;
          if (got === "solid4:rect") ok += 1;
          if (got === "roller" || got === "ellipse") asCircle += 1;
        })));
        lines.push("INFO hand-square " + tag + " rect " + ok + "/" + total + " circle " + asCircle);
        check("hand-drawn squares become rectangles (" + tag + ")", ok >= Math.ceil(total * 0.95) && asCircle === 0);
        let cOk = 0;
        let cTotal = 0;
        [0.4, 0.8, 1.5, 2.5, 3.5].forEach((R, i) => [0, 0.03, 0.06].forEach((w, j) => {
          const got = hqDraw(hqOval(16, 8, R, 300 + i * 11 + j, w), hqGeo);
          cTotal += 1;
          if (got === "roller") cOk += 1;
        }));
        lines.push("INFO hand-circle " + tag + " " + cOk + "/" + cTotal);
        check("hand-drawn circles with overshoot stay circles (" + tag + ")", cOk >= Math.ceil(cTotal * 0.9));
      }
      let eOk = 0;
      let eTotal = 0;
      [2, 2.6].forEach((ax, i) => [0, 30, 45].forEach((rot, j) => [0.8, 1.6].forEach((R, k) => {
        const got = hqDraw(hqOval(16, 8, R, 700 + i * 31 + j * 7 + k, 0.02, ax, rot), true);
        eTotal += 1;
        if (got === "ellipse") eOk += 1;
      })));
      lines.push("INFO hand-ellipse geo " + eOk + "/" + eTotal);
      check("hand-drawn ellipses stay ellipses with geodreieck", eOk === eTotal);
      // Fels mit deutlich abgeschnittener Ecke und U-Form: kein Rechteck.
      const hqPenta = [{ x: 14.5, y: 7 }, { x: 17.5, y: 7 }, { x: 17.5, y: 8.1 }, { x: 16.6, y: 9 }, { x: 14.5, y: 9 }];
      const hqRing = (corners) => {
        const out = [];
        for (let e = 0; e < corners.length; e++) {
          const a = corners[e];
          const b = corners[(e + 1) % corners.length];
          const n = Math.max(2, Math.round(dist(a, b) / 0.02));
          for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
        }
        out.push({ x: corners[0].x, y: corners[0].y });
        return out;
      };
      const pentaGot = hqDraw(hqRing(hqPenta), false);
      lines.push("INFO hand-penta free " + pentaGot);
      check("rock with a cut corner is no rectangle", pentaGot !== "solid4:rect" && pentaGot !== "roller");
      const hqU = [{ x: 14.5, y: 7 }, { x: 17.5, y: 7 }, { x: 17.5, y: 9.5 }, { x: 16.8, y: 9.5 }, { x: 16.8, y: 7.8 }, { x: 15.2, y: 7.8 }, { x: 15.2, y: 9.5 }, { x: 14.5, y: 9.5 }];
      const uGot = hqDraw(hqRing(hqU), true);
      lines.push("INFO hand-u geo " + uGot);
      check("u-shape is no rectangle", uGot !== "solid4:rect" && uGot !== "roller" && uGot !== "ellipse");
      // closeLoop schneidet den Überschuss ab, ohne den Ring zu verlieren.
      const hqOver = hqSquare(16, 8, 2, 0, { wob: 0, round: 0, start: 0.4, close: 0.08 }, 5);
      const hqCut = closeLoop(hqOver);
      check("closeLoop trims overshoot", hqCut !== hqOver && !selfIntersects(closedRing(hqCut), true) && Math.abs(Math.abs(signedArea(closedRing(hqCut))) - 4) < 0.1);
    }
    geoSnap = false;


    check("tune panel is absent during tests", !document.getElementById("tune-panel"));
    const tunePrevOn = tuneOn;
    const tunePrevVals = Object.assign({}, tuneVals);
    let tuneStored = null;
    try { tuneStored = localStorage.getItem(TUNE_STORE); } catch (err) { tuneStored = null; }
    try { localStorage.setItem(TUNE_STORE, JSON.stringify({ maxCv: 0.03 })); } catch (err) { /* optional */ }
    tuneVals = { maxCv: 0.03 };
    tuneOn = false;
    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(circRing(12, 6, 1.05, 0.95, 28, 0.07, 0.03), "#3c7fd6");
    check("stored tune values do not apply without tune mode", !!drawings.find((d) => d.kind === "roller"));
    buildLevel(LEVELS["ein-klotz"]);
    tuneOn = true;
    commitStroke(circRing(12, 6, 1.05, 0.95, 28, 0.07, 0.03), "#3c7fd6");
    const tuneTight = drawings.find((d) => d.kind === "solid" && !d.preset);
    check("tighter CV rejects a shaky oval", !!tuneTight && tuneTight.kind === "solid" && !drawings.some((d) => d.kind === "roller" || d.kind === "ellipse"));
    buildLevel(LEVELS["ein-klotz"]);
    tuneVals = { maxCv: CIRCLE_MAX_CV };
    commitStroke(circRing(12, 6, 1.05, 0.95, 28, 0.07, 0.03), "#3c7fd6");
    check("default CV still accepts the shaky oval", !!drawings.find((d) => d.kind === "roller"));
    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    tuneVals = { ellCircleRatio: 0.40 };
    commitStroke(ellipseStroke(16, 7, 2.0, 1.0, 0, 32), "#7a4fbf");
    geoSnap = false;
    check("lower b/a threshold turns a 1:2 oval into a circle", !!drawings.find((d) => d.kind === "roller") && !drawings.some((d) => d.kind === "ellipse"));
    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    tuneVals = { ellExtraGap: 0 };
    commitStroke(ellipseStroke(16, 7, 3.0, 2.2, 0, 32), "#7a4fbf");
    geoSnap = false;
    check("zero extra radius gap keeps a 3-by-2.2 oval an ellipse", !!drawings.find((d) => d.kind === "ellipse") && !drawings.some((d) => d.kind === "roller"));
    tuneOn = tunePrevOn;
    tuneVals = tunePrevVals;
    try {
      if (tuneStored == null) localStorage.removeItem(TUNE_STORE);
      else localStorage.setItem(TUNE_STORE, tuneStored);
    } catch (err) { /* optional */ }
    check("tune panel still absent after parameter tests", !document.getElementById("tune-panel"));

    function ancBox(x, y, w, h, color) {
      return commitStroke([
        { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y },
      ], color);
    }
    function tinyNail(x, y) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        pts.push({ x: x + Math.cos(a) * 0.16, y: y + Math.sin(a) * 0.16 });
      }
      return commitStroke(pts, "#2b2b2b");
    }

    buildLevel(LEVELS["ein-klotz"]);
    const tintA = ancBox(19, 1.4, 1.5, 1, "#3c7fd6");
    for (let i = 0; i < 90; i++) step(1 / 60);
    finishPlayStroke([{ x: 18.6, y: 1.2 }, { x: 19, y: 1.45 }, { x: 19.4, y: 1.7 }]);
    check("anchored body takes the ground color", !!tintA && isAnchored(tintA.body) && tintA.color === "#3f8f55" && anchors[0].color === MAT.wood);
    const tintTop = tintA.body.getPosition().y + 0.5;
    const tintB = ancBox(19.2, tintTop + 0.05, 1, 0.8, "#d94b3a");
    for (let i = 0; i < 90; i++) step(1 / 60);
    finishPlayStroke([{ x: 19.9, y: tintTop - 0.15 }, { x: 19.85, y: tintTop + 0.1 }, { x: 19.8, y: tintTop + 0.35 }]);
    check("chained body takes the same ground color", !!tintB && isAnchored(tintB.body) && tintB.color === "#3f8f55" && tintA.color === "#3f8f55" && anchorOf(tintB.body).color === MAT.wood);
    const tintBLink = anchorOf(tintB.body);
    const tintBMid = { x: (tintBLink.a.x + tintBLink.b.x) / 2, y: (tintBLink.a.y + tintBLink.b.y) / 2 };
    const tintBMidScr = worldToScreen(tintBMid.x, tintBMid.y);
    onPointerDown({ button: 2, clientX: tintBMidScr.x, clientY: tintBMidScr.y, pointerId: 51 });
    check("released body gets its own color back", !isAnchored(tintB.body) && tintB.color === MAT.wood && isAnchored(tintA.body) && tintA.color === "#3f8f55");
    const tintAMid = { x: (anchors[0].a.x + anchors[0].b.x) / 2, y: (anchors[0].a.y + anchors[0].b.y) / 2 };
    const tintAMidScr = worldToScreen(tintAMid.x, tintAMid.y);
    onPointerDown({ button: 2, clientX: tintAMidScr.x, clientY: tintAMidScr.y, pointerId: 52 });
    check("released root also restores its color", !isAnchored(tintA.body) && tintA.color === MAT.wood);

    buildLevel(LEVELS["bergauf"]);
    const tintLeft = ancBox(3, 2.45, 1.4, 0.9, "#3c7fd6");
    for (let i = 0; i < 90; i++) step(1 / 60);
    finishPlayStroke([{ x: 2.6, y: 2.25 }, { x: 3.1, y: 2.5 }, { x: 3.5, y: 2.7 }]);
    const tintRight = ancBox(21, 9.05, 1.4, 0.9, "#d94b3a");
    for (let i = 0; i < 90; i++) step(1 / 60);
    finishPlayStroke([{ x: 20.6, y: 8.85 }, { x: 21.1, y: 9.1 }, { x: 21.5, y: 9.3 }]);
    check("anchor tint follows the local ground color", !!tintLeft && !!tintRight && isAnchored(tintLeft.body) && isAnchored(tintRight.body) && tintLeft.color === "#3f8f55" && tintRight.color === "#c9854a");

    buildLevel(LEVELS["ein-klotz"]);
    commitStroke(circRing(16, 7, 1.05, 0.95, 28, 0.07, 0.03), "#d94b3a");
    const matCirc = drawings.find((d) => d.kind === "roller");
    check("drawn circle is steel even if a color is passed", !!matCirc && matCirc.color === MAT.steel);
    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    commitStroke(ellipseStroke(16, 7, 2.0, 1.0, 0, 32), "#3c7fd6");
    geoSnap = false;
    const matEll = drawings.find((d) => d.kind === "ellipse");
    check("drawn ellipse is steel", !!matEll && matEll.color === MAT.steel);
    buildLevel(LEVELS["ein-klotz"]);
    const matBox = ancBox(18, 1.4, 1.6, 1, "#3c7fd6");
    check("drawn solid is wood even if a color is passed", !!matBox && matBox.kind === "solid" && matBox.color === MAT.wood && matBox.meta.outline.color === MAT.wood);
    const matCrate = makeBox({ x: 8, y: 3, hw: 0.5, hh: 0.5, color: "#3c7fd6" });
    const matCrateDraw = drawings.find((d) => d.body === matCrate);
    check("crates are wood", !!matCrateDraw && matCrateDraw.color === MAT.wood);
    buildLevel(LEVELS["ein-klotz"]);
    const matWire = commitStroke([{ x: 8, y: 4 }, { x: 14, y: 6 }, { x: 18, y: 5.2 }], "#00ff00");
    check("drawn wire is dark wood even if a color is passed", !!matWire && matWire.kind === "wire" && matWire.color === MAT.wire);

    function strokeOpenWire(x0, y0, x1, y1, evExtra, pointerId) {
      const a = worldToScreen(x0, y0);
      const b = worldToScreen(x1, y1);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const base = { button: 0, pointerId };
      const ev = evExtra || {};
      onPointerDown(Object.assign({ clientX: a.x, clientY: a.y }, base, ev));
      onPointerMove(Object.assign({ clientX: midX, clientY: midY }, base, ev));
      onPointerMove(Object.assign({ clientX: b.x, clientY: b.y }, base, ev));
      const previewLive = !!(pointer && pointer.pts && pointer.pts.some((pt) => pt.thick));
      onPointerUp(Object.assign({ clientX: b.x, clientY: b.y }, base, ev));
      pointer = null;
      endDrag();
      const draw = drawings[drawings.length - 1];
      return { draw, previewLive };
    }
    buildLevel(LEVELS["ein-klotz"]);
    const lightPen = strokeOpenWire(20, 8, 24, 8, { pointerType: "pen", pressure: 0.2 }, 900);
    const heavyPen = strokeOpenWire(20, 10, 24, 10, { pointerType: "pen", pressure: 0.9 }, 901);
    const mouseWire = strokeOpenWire(20, 12, 24, 12, { pointerType: "mouse", pressure: 0.9 }, 902);
    const touchWire = strokeOpenWire(20, 6, 24, 6, { pointerType: "touch", pressure: 0.9 }, 903);
    const lightThick = lightPen.draw && lightPen.draw.meta ? lightPen.draw.meta.thick : 0;
    const heavyThick = heavyPen.draw && heavyPen.draw.meta ? heavyPen.draw.meta.thick : 0;
    const mouseThick = mouseWire.draw && mouseWire.draw.meta ? mouseWire.draw.meta.thick : 0;
    const touchThick = touchWire.draw && touchWire.draw.meta ? touchWire.draw.meta.thick : 0;
    const lightMass = lightPen.draw && lightPen.draw.body ? lightPen.draw.body.getMass() : 0;
    const heavyMass = heavyPen.draw && heavyPen.draw.body ? heavyPen.draw.body.getMass() : 0;
    lines.push("INFO pen-thick light " + lightThick.toFixed(3) + " heavy " + heavyThick.toFixed(3) + " mouse " + mouseThick.toFixed(3) + " masses " + lightMass.toFixed(3) + "," + heavyMass.toFixed(3));
    check("a light pen stroke makes a thinner wire", !!lightPen.draw && lightPen.draw.kind === "wire" && lightThick < THICK - 0.005);
    check("a heavy pen stroke makes a thicker wire", !!heavyPen.draw && heavyPen.draw.kind === "wire" && heavyThick > THICK + 0.05);
    check("a heavier pen wire is heavier", heavyMass > lightMass * 1.4);
    check("a mouse stroke keeps the default thickness", !!mouseWire.draw && mouseWire.draw.kind === "wire" && Math.abs(mouseThick - THICK) < 0.001);
    check("touch pressure does not change wire thickness", !!touchWire.draw && touchWire.draw.kind === "wire" && Math.abs(touchThick - THICK) < 0.001);
    check("pen preview shows pressure while drawing", lightPen.previewLive && heavyPen.previewLive && !mouseWire.previewLive);
    buildLevel(LEVELS["ein-klotz"]);
    tinyNail(10, 1.42);
    tinyNail(16, 1.42);
    const matPins = pins.filter((p) => p.userMade);
    const matRope = matPins.length >= 2 ? spawnRope(matPins[0], matPins[1], [{ x: 10, y: 1.42 }, { x: 13, y: 0.4 }, { x: 16, y: 1.42 }], "#3c7fd6") : null;
    check("drawn rope is hemp even if a color is passed", !!matRope && matRope.kind === "rope" && matRope.color === MAT.hemp);

    buildLevel(LEVELS["ein-klotz"]);
    tinyNail(16, 1.42);
    const nailHang = ancBox(14, 1.4, 4, 0.8, "#8d5a34");
    for (let i = 0; i < 60; i++) step(1 / 60);
    const nailPin = pins.find((p) => p.userMade);
    const nailJoints = nailPin ? nailPin.joints.filter(Boolean).length : 0;
    const nailGrabX = 17.6;
    const nailGrabY = nailHang.body.getPosition().y;
    const nailP0 = pinWorld(nailPin);
    const nailLocal = nailHang.body.getLocalPoint(V(nailGrabX, nailGrabY));
    const nailR0 = Math.hypot(nailGrabX - nailP0.x, nailGrabY - nailP0.y);
    const nailAng0 = nailHang.body.getAngle();
    const nailDragOk = beginDrag(nailGrabX, nailGrabY);
    moveDrag(nailGrabX + 2.2, nailGrabY + 2.8);
    for (let i = 0; i < 40; i++) step(1 / 60);
    const nailP1 = pinWorld(nailPin);
    const nailGrabNow = nailHang.body.getWorldPoint(V(nailLocal.x, nailLocal.y));
    const nailR1 = Math.hypot(nailGrabNow.x - nailP1.x, nailGrabNow.y - nailP1.y);
    const nailAng1 = nailHang.body.getAngle();
    endDrag();
    check("nailed body stays on the nail while dragged", !!nailHang && nailJoints >= 1 && nailDragOk && Math.hypot(nailP1.x - nailP0.x, nailP1.y - nailP0.y) < 0.05);
    check("nailed drag keeps the grab distance and rotates", Math.abs(nailR1 - nailR0) < 0.08 && Math.abs(nailAng1 - nailAng0) > 0.25);

    buildLevel(LEVELS["ein-klotz"]);
    tinyNail(14.5, 1.42);
    tinyNail(17.5, 1.42);
    const nailLock = ancBox(13.5, 1.4, 5, 0.85, "#3c7fd6");
    for (let i = 0; i < 80; i++) step(1 / 60);
    const nailLockPins = pins.filter((p) => p.userMade && p.joints.some(Boolean));
    const nailLockPos = nailLock.body.getPosition();
    const nailLockAng = nailLock.body.getAngle();
    const nailLockDrag = beginDrag(nailLockPos.x, nailLockPos.y);
    moveDrag(nailLockPos.x + 2, nailLockPos.y + 3);
    for (let i = 0; i < 40; i++) step(1 / 60);
    const nailLockPos2 = nailLock.body.getPosition();
    const nailLockAng2 = nailLock.body.getAngle();
    endDrag();
    check("a body locked by two nails does not move when dragged", nailLockPins.length >= 2 && nailLockDrag && Math.hypot(nailLockPos2.x - nailLockPos.x, nailLockPos2.y - nailLockPos.y) < 0.08 && Math.abs(nailLockAng2 - nailLockAng) < 0.08);

    buildLevel(LEVELS["ein-klotz"]);
    tinyNail(12, 1.42);
    const nailLone = pins.find((p) => p.userMade);
    const nailLone0 = cycleNailMotor(nailLone);
    const nailLone1 = cycleNailMotor(nailLone);
    const nailLone2 = cycleNailMotor(nailLone);
    check("a lone nail still cycles its motor state", nailLone0 === 1 && nailLone1 === -1 && nailLone2 === 0 && nailLone.motor === 0);

    // Nagel-Motor per Kringel: Drehsinn des Kringels auf dem Bildschirm = Motor.
    function doodleAround(cx, cy, r, clockwise, pointerId) {
      const ev = { button: 0, pointerId };
      const n = 20;
      for (let k = 0; k <= n + 2; k++) {
        const a = (clockwise ? -1 : 1) * (k / n) * Math.PI * 2;
        const sp = worldToScreen(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        const e2 = Object.assign({ clientX: sp.x, clientY: sp.y }, ev);
        if (k === 0) onPointerDown(e2);
        else onPointerMove(e2);
        if (k === n + 2) onPointerUp(e2);
      }
      pointer = null;
      endDrag();
    }
    buildLevel(LEVELS["ein-klotz"]);
    lastTap = 0;
    const nailMot = rememberPin(16, 8, ground, true);
    const nailMotBox = ancBox(14, 7.2, 4, 0.8, "#8d5a34");
    for (let i = 0; i < 60; i++) step(1 / 60);
    const nailMotScr = worldToScreen(pinWorld(nailMot).x, pinWorld(nailMot).y);
    const nailMotPins = pins.length;
    onPointerDown({ button: 0, clientX: nailMotScr.x, clientY: nailMotScr.y, pointerId: 61 });
    onPointerUp({ button: 0, clientX: nailMotScr.x, clientY: nailMotScr.y, pointerId: 61 });
    check("clicking a nail changes nothing (no motor, no new nail)", nailMot.motor === 0 && !playDrag && pins.length === nailMotPins && pins.indexOf(nailMot) >= 0);
    const nailMotShapes = stats.shapes;
    doodleAround(16, 8, 0.25, false, 62);
    check("a counter-clockwise doodle around a nail starts a left turn", nailMot.motor === 1 && nailMot.joints.some(Boolean) && pins.length === nailMotPins && stats.shapes === nailMotShapes);
    for (let i = 0; i < 180; i++) step(1 / 60);
    const nailWccw = nailMotBox.body.getAngularVelocity();
    check("left motor reaches about +90 deg/s", Math.abs(nailWccw - Math.PI / 2) < 0.35 && !stats.dragTrick);
    doodleAround(16, 8, 0.25, false, 63);
    check("the same doodle direction again changes nothing", nailMot.motor === 1);
    doodleAround(16, 8, 0.25, true, 64);
    check("an opposite doodle stops the motor", nailMot.motor === 0 && nailMot.joints.every((j) => !j || !j.isMotorEnabled()));
    // Ohne Motor pendelt der Klotz frei: die Drehzahl bleibt nicht bei ±90°/s stehen.
    let nailWmin = Infinity;
    let nailWmax = -Infinity;
    for (let i = 0; i < 180; i++) {
      step(1 / 60);
      const w = nailMotBox.body.getAngularVelocity();
      nailWmin = Math.min(nailWmin, w);
      nailWmax = Math.max(nailWmax, w);
    }
    lines.push("INFO off nail w " + nailWmin.toFixed(2) + " .. " + nailWmax.toFixed(2));
    check("an off nail joint is not driven", nailWmax - nailWmin > 0.5);
    doodleAround(16, 8, 0.25, true, 65);
    check("a clockwise doodle around a nail starts a right turn", nailMot.motor === -1 && pins.length === nailMotPins);
    for (let i = 0; i < 180; i++) step(1 / 60);
    const nailWcw = nailMotBox.body.getAngularVelocity();
    check("right motor reaches about -90 deg/s", Math.abs(nailWcw + Math.PI / 2) < 0.35);
    nailMot.motor = 0;
    applyNailMotor(nailMot);
    // Motornagel (per Kringel entstanden) per Klick: links -> rechts -> Stillstand -> links.
    function clickNail(pin, pointerId) {
      const sp = worldToScreen(pinWorld(pin).x, pinWorld(pin).y);
      onPointerDown({ button: 0, clientX: sp.x, clientY: sp.y, pointerId });
      onPointerUp({ button: 0, clientX: sp.x, clientY: sp.y, pointerId });
      pointer = null;
    }
    const nailCyc = [];
    for (let k = 0; k < 4; k++) {
      lastTap = 0;
      clickNail(nailMot, 70 + k);
      nailCyc.push(nailMot.motor);
    }
    lines.push("INFO motor nail clicks: " + nailCyc.join(" "));
    check("clicking a motor nail cycles left, right, stop, left", nailMot.isMotor && nailCyc.join(",") === "1,-1,0,1" && pins.indexOf(nailMot) >= 0 && pins.length === nailMotPins && !playDrag);
    check("the click cycle drives the nail joint", nailMot.joints.some((j) => j && j.isMotorEnabled() && j.getMotorSpeed() > 0));
    lastTap = 0;
    clickNail(nailMot, 75);
    clickNail(nailMot, 76);
    check("a quick double tap on a motor nail still pulls it", pins.indexOf(nailMot) < 0);
    lastTap = 0;
    const nailPlain = rememberPin(20, 1.42, ground, true);
    for (let k = 0; k < 3; k++) {
      lastTap = 0;
      clickNail(nailPlain, 77 + k);
    }
    check("clicking a plain nail never makes it a motor", !nailPlain.isMotor && nailPlain.motor === 0 && pins.indexOf(nailPlain) >= 0);
    const spinWas = simTime;
    simTime = 4;
    check("a plain nail mark stands still", pinGlyphAngle(nailPlain) === 0);
    nailPlain.isMotor = true;
    nailPlain.rollAngle = 0.4;
    check("a stopped motor mark follows the rope", Math.abs(pinGlyphAngle(nailPlain) + 0.4) < 1e-9);
    nailPlain.motor = 1;
    check("a running motor mark turns with time", Math.abs(pinGlyphAngle(nailPlain) + simTime * NAIL_MOTOR_SPEED) < 1e-9);
    nailPlain.motor = 0;
    nailPlain.isMotor = false;
    nailPlain.rollAngle = 0;
    simTime = spinWas;

    function strokeFromTo(x0, y0, x1, y1, pointerId) {
      const a = worldToScreen(x0, y0);
      const b = worldToScreen(x1, y1);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const ev = { button: 0, pointerId };
      onPointerDown(Object.assign({ clientX: a.x, clientY: a.y }, ev));
      onPointerMove(Object.assign({ clientX: mx, clientY: my }, ev));
      onPointerMove(Object.assign({ clientX: b.x, clientY: b.y }, ev));
      onPointerUp(Object.assign({ clientX: b.x, clientY: b.y }, ev));
      pointer = null;
      endDrag();
    }

    lastTap = 0;
    buildLevel(LEVELS["ein-klotz"]);
    const hangStart = rememberPin(10, 8, ground, true);
    const hangStart0 = pinWorld(hangStart);
    const ropesBeforeHang = drawings.filter((d) => d.kind === "rope").length;
    strokeFromTo(hangStart0.x, hangStart0.y, 16, 5, 71);
    const hangDrawn = drawings.filter((d) => d.kind === "rope").slice(-1)[0];
    const hangStart1 = pinWorld(hangStart);
    check("a stroke from a nail makes a rope hung on that nail", !!hangDrawn && hangDrawn.kind === "rope" && hangDrawn.pinA === hangStart && !hangDrawn.pinB && drawings.filter((d) => d.kind === "rope").length === ropesBeforeHang + 1);
    check("drawing a rope from a nail does not move the nail", Math.hypot(hangStart1.x - hangStart0.x, hangStart1.y - hangStart0.y) < 0.02 && !playDrag);

    lastTap = 0;
    buildLevel(LEVELS["ein-klotz"]);
    const tapNail = rememberPin(12, 8, ground, true);
    const ropesBeforeTap = drawings.filter((d) => d.kind === "rope").length;
    const drawingsBeforeTap = drawings.length;
    const tapScr = worldToScreen(pinWorld(tapNail).x, pinWorld(tapNail).y);
    onPointerDown({ button: 0, clientX: tapScr.x, clientY: tapScr.y, pointerId: 72 });
    onPointerUp({ button: 0, clientX: tapScr.x, clientY: tapScr.y, pointerId: 72 });
    pointer = null;
    check("a click on a nail does not spawn a rope fragment", drawings.filter((d) => d.kind === "rope").length === ropesBeforeTap && drawings.length === drawingsBeforeTap && tapNail.motor === 0 && pins.indexOf(tapNail) >= 0);

    lastTap = 0;
    buildLevel(LEVELS["ein-klotz"]);
    world.setGravity(V(0, 0));
    const edgeHost = makeBox({ x: 10, y: 8, hw: 1.6, hh: 0.9, color: "#8d5a34" });
    const edgeNail = rememberPin(11.55, 8, edgeHost, true);
    const edgeHost0 = { x: edgeHost.getPosition().x, y: edgeHost.getPosition().y };
    const ropesBeforeEdge = drawings.filter((d) => d.kind === "rope").length;
    strokeFromTo(11.55, 8, 18, 5.5, 73);
    const edgeRope = drawings.filter((d) => d.kind === "rope").slice(-1)[0];
    const edgeHost1 = edgeHost.getPosition();
    const edgeNail1 = pinWorld(edgeNail);
    check("a stroke from a nail on a body does not grab the body", !!edgeRope && edgeRope.pinA === edgeNail && !playDrag && Math.hypot(edgeHost1.x - edgeHost0.x, edgeHost1.y - edgeHost0.y) < 0.04);
    check("the nail on a body stays put while the rope is drawn", Math.hypot(edgeNail1.x - 11.55, edgeNail1.y - 8) < 0.04 && drawings.filter((d) => d.kind === "rope").length === ropesBeforeEdge + 1);
    world.setGravity(V(0, -24));

    lastTap = 0;
    buildLevel(LEVELS["ein-klotz"]);
    world.setGravity(V(0, 0));
    const dropOne = rememberPin(16, 8, ground, true);
    const dropBox = makeBox({ x: 9, y: 8, hw: 1.4, hh: 0.8, color: "#8d5a34" });
    const dropGrabX = 10.3;
    const dropGrabY = 8;
    const dropOk = beginDrag(dropGrabX, dropGrabY);
    moveDrag(16 + (dropGrabX - 9), 8);
    for (let i = 0; i < 40; i++) step(1 / 60);
    endDrag();
    const dropPinned = tryPinDragEnd(dropBox);
    const dropHolds = dropOne.joints.some((j) => j && (j.getBodyA() === dropBox || j.getBodyB() === dropBox));
    const dropAt = pinWorld(dropOne);
    const dropLocal = dropBox.getLocalPoint(V(dropAt.x, dropAt.y));
    check("releasing a body over a nail pins it there", dropOk && dropPinned >= 1 && dropHolds && Math.hypot(dropLocal.x, dropLocal.y) < 1.6);

    lastTap = 0;
    buildLevel(LEVELS["ein-klotz"]);
    world.setGravity(V(0, 0));
    const lockA = rememberPin(14, 8, ground, true);
    const lockB = rememberPin(18, 8, ground, true);
    const lockBox = makeBox({ x: 8, y: 8, hw: 2.6, hh: 0.7, color: "#3c7fd6" });
    const lockGrabX = 10.4;
    const lockGrabY = 8;
    const lockOk = beginDrag(lockGrabX, lockGrabY);
    moveDrag(16 + (lockGrabX - 8), 8);
    for (let i = 0; i < 40; i++) step(1 / 60);
    endDrag();
    const lockPinned = tryPinDragEnd(lockBox);
    const lockHoldsA = lockA.joints.some((j) => j && (j.getBodyA() === lockBox || j.getBodyB() === lockBox));
    const lockHoldsB = lockB.joints.some((j) => j && (j.getBodyA() === lockBox || j.getBodyB() === lockBox));
    const lockPos0 = { x: lockBox.getPosition().x, y: lockBox.getPosition().y };
    const lockAng0 = lockBox.getAngle();
    world.setGravity(V(0, -24));
    for (let i = 0; i < 120; i++) step(1 / 60);
    const lockPos1 = lockBox.getPosition();
    const lockAng1 = lockBox.getAngle();
    check("releasing a body over two nails pins it to both", lockOk && lockPinned >= 2 && lockHoldsA && lockHoldsB);
    check("a body pinned to two nails stays put under gravity", Math.hypot(lockPos1.x - lockPos0.x, lockPos1.y - lockPos0.y) < 0.08 && Math.abs(lockAng1 - lockAng0) < 0.08);

    lastTap = 0;
    buildLevel(LEVELS["ein-klotz"]);
    world.setGravity(V(0, 0));
    const hostBox = makeBox({ x: 14.5, y: 8, hw: 0.7, hh: 0.7, color: "#8d5a34" });
    const hostPin = rememberPin(15.18, 8, hostBox, true);
    const guestBox = makeBox({ x: 20, y: 8, hw: 1.1, hh: 0.7, color: "#3c7fd6" });
    const guestGrabX = 18.95;
    const guestOk = beginDrag(guestGrabX, 8);
    // Nagel sitzt am rechten Rand des Wirts; der Gast kommt von rechts
    // und deckt ihn gerade noch ab, ohne sich durch den Wirt zu schieben.
    const guestGoalX = 15.18 + 1.0 + (guestGrabX - 20);
    moveDrag(guestGoalX, 8);
    for (let i = 0; i < 40; i++) step(1 / 60);
    endDrag();
    const guestPinned = tryPinDragEnd(guestBox);
    const guestHeld = hostPin.joints.some((j) => j && (j.getBodyA() === guestBox || j.getBodyB() === guestBox));
    check("releasing a body onto a nail in another body joins them", guestOk && guestPinned >= 1 && guestHeld && hostPin.body === hostBox);
    world.setGravity(V(0, -24));

    lastTap = 0;
    buildLevel(LEVELS["ein-klotz"]);
    const pullNail = rememberPin(12, 6, ground, true);
    const pullAt = pinWorld(pullNail);
    const pullScr = worldToScreen(pullAt.x, pullAt.y);
    onPointerDown({ button: 2, clientX: pullScr.x, clientY: pullScr.y, pointerId: 74 });
    check("right-click pulls out a user nail", pins.indexOf(pullNail) < 0 && !pins.some((pn) => Math.hypot(pinWorld(pn).x - pullAt.x, pinWorld(pn).y - pullAt.y) < 0.2));

    buildLevel(LEVELS["ein-klotz"]);
    addStaticSolid([
      { x: 20, y: 1.3 }, { x: 21.4, y: 1.3 }, { x: 21.4, y: 10 }, { x: 20, y: 10 },
    ], "#3c7fd6");
    ball.setTransform(V(12, 5), 0);
    ball.setLinearVelocity(V(16, 0));
    ball.setAngularVelocity(0);
    let bounceVin = 0;
    let bounceVout = 0;
    let bounceHit = false;
    for (let i = 0; i < 90; i++) {
      const bounceVx = ball.getLinearVelocity().x;
      if (!bounceHit && bounceVx > 6) bounceVin = bounceVx;
      step(1 / 60);
      const bounceVx2 = ball.getLinearVelocity().x;
      if (!bounceHit && bounceVin > 6 && bounceVx2 < 0) {
        bounceHit = true;
        bounceVout = bounceVx2;
      }
    }
    lines.push("INFO bounce vin=" + bounceVin.toFixed(2) + " vout=" + bounceVout.toFixed(2));
    check("ball bounces off a wall with damped speed", bounceHit && bounceVin > 10 && bounceVout < 0 && Math.abs(bounceVout) > bounceVin * 0.15 && Math.abs(bounceVout) < bounceVin * 0.75);
    for (let i = 0; i < 240; i++) step(1 / 60);
    const bounceRest = ball.getLinearVelocity();
    check("ball comes to rest after the bounce without jitter", Math.hypot(bounceRest.x, bounceRest.y) < 0.4 && ball.getPosition().y < 2.2 && ball.getPosition().x < 20);

    lastTap = 0;
    if (!tuneVals || !Object.keys(tuneVals).length) tuneVals = tuneDefaults();
    tuneVals.maxCv = 0.2;
    buildLevel(LEVELS["ein-klotz"]);
    geoSnap = true;
    cam.cx = 15;
    cam.cy = 8;
    cam.zoom = 1.2;
    makeBox({ x: 10, y: 4.2, hw: 1.1, hh: 0.45, color: "#8d5a34" });
    spawnWire([
      { x: 22, y: 3.2 }, { x: 24.5, y: 5.0 }, { x: 27, y: 3.4 },
    ], { thick: THICK * 1.4 });
    rememberPin(16, 6.5, ground, true);
    rememberPin(20, 6.5, ground, true);
    const scenePinA = pins[pins.length - 2];
    const scenePinB = pins[pins.length - 1];
    spawnRope(scenePinA, scenePinB, [
      { x: 16, y: 6.5 }, { x: 18, y: 5.2 }, { x: 20, y: 6.5 },
    ]);
    spawnRoller(8, 7.5, 0.4);
    spawnEllipse(6, 6.2, 1.1, 0.65, 0.3);
    const sceneAnchorHost = makeBox({ x: 4, y: 1.7, hw: 0.8, hh: 0.4 });
    const sceneAnchorDraw = drawings.find((d) => d.body === sceneAnchorHost);
    if (sceneAnchorDraw) anchorBody(sceneAnchorDraw, ground, { x: 4, y: 1.3 }, { x: 4, y: 1.7 });
    ball.setTransform(V(5, 8.5), 0.2);
    ball.setLinearVelocity(V(3.2, 1.1));
    ball.setAngularVelocity(0.4);
    for (let i = 0; i < 20; i++) step(1 / 60);

    const scenePosOf = (body) => {
      if (!body) return null;
      const p = body.getPosition();
      const v = body.getLinearVelocity();
      return { x: p.x, y: p.y, a: body.getAngle(), vx: v.x, vy: v.y, w: body.getAngularVelocity() };
    };
    const sceneKeyPoses = () => {
      let jointN = 0;
      for (let j = world.getJointList(); j; j = j.getNext()) {
        if (!isMouseJoint(j)) jointN++;
      }
      const ropeDraw = drawings.find((d) => d.kind === "rope");
      const boxDraw = drawings.find((d) => d.kind === "solid" && d.preset && !anchors.some((a) => a.body === d.body));
      const wireDraw = drawings.find((d) => d.kind === "wire");
      const rollDraw = drawings.find((d) => d.kind === "roller");
      const ellDraw = drawings.find((d) => d.kind === "ellipse");
      return {
        drawings: drawings.length,
        pins: pins.length,
        ropes: drawings.filter((d) => d.kind === "rope").length,
        joints: jointN,
        anchors: anchors.length,
        geo: !!geoSnap,
        cam: { cx: cam.cx, cy: cam.cy, zoom: cam.zoom },
        tuneCv: tuneVals && tuneVals.maxCv,
        ball: scenePosOf(ball),
        box: scenePosOf(boxDraw && boxDraw.body),
        wire: scenePosOf(wireDraw && wireDraw.body),
        roll: scenePosOf(rollDraw && rollDraw.body),
        ell: scenePosOf(ellDraw && ellDraw.body),
        rope0: scenePosOf(ropeDraw && ropeDraw.bodies && ropeDraw.bodies[0]),
      };
    };
    const sceneDrift = (a, b) => {
      if (!a || !b) return Infinity;
      return Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.a - b.a) + Math.hypot(a.vx - b.vx, a.vy - b.vy) + Math.abs(a.w - b.w);
    };

    const sceneCaptured = captureScene();
    const sceneSnapA = sceneKeyPoses();
    const sceneText = encodeSceneTextSync(sceneCaptured);
    const sceneDecoded = decodeSceneTextSync(sceneText);
    check("scene zettel encodes and decodes", !!(
      sceneDecoded.ok && sceneDecoded.data
      && sceneDecoded.data.bodies.length === sceneCaptured.bodies.length
      && sceneDecoded.data.pins.length === sceneCaptured.pins.length
      && sceneDecoded.data.ropes.length === sceneCaptured.ropes.length
      && sceneDecoded.data.anchors.length === sceneCaptured.anchors.length
    ));

    for (let i = 0; i < 60; i++) step(1 / 60);
    const sceneSnapOrig = sceneKeyPoses();

    const sceneLoaded = loadSceneFromTextSync(sceneText);
    check("scene zettel loads without error", !!(sceneLoaded && sceneLoaded.ok && world && ball));
    const sceneSnapBack = sceneKeyPoses();
    check("scene roundtrip keeps body, pin and joint counts",
      sceneSnapBack.drawings === sceneSnapA.drawings
      && sceneSnapBack.pins === sceneSnapA.pins
      && sceneSnapBack.ropes === sceneSnapA.ropes
      && sceneSnapBack.joints === sceneSnapA.joints
      && sceneSnapBack.anchors === sceneSnapA.anchors);
    check("scene roundtrip restores positions and velocities",
      sceneDrift(sceneSnapBack.ball, sceneSnapA.ball) < 1e-6
      && sceneDrift(sceneSnapBack.box, sceneSnapA.box) < 1e-6
      && sceneDrift(sceneSnapBack.wire, sceneSnapA.wire) < 1e-6
      && sceneDrift(sceneSnapBack.roll, sceneSnapA.roll) < 1e-6
      && sceneDrift(sceneSnapBack.ell, sceneSnapA.ell) < 1e-6
      && sceneDrift(sceneSnapBack.rope0, sceneSnapA.rope0) < 1e-6);
    check("scene roundtrip restores camera, geodreieck and tune values",
      sceneSnapBack.geo === true
      && Math.abs(sceneSnapBack.cam.cx - 15) < 1e-9
      && Math.abs(sceneSnapBack.cam.zoom - 1.2) < 1e-9
      && sceneSnapBack.tuneCv === 0.2
      && sceneSnapBack.anchors === 1);

    for (let i = 0; i < 60; i++) step(1 / 60);
    const sceneSnapImp = sceneKeyPoses();
    const sceneDriftBall = sceneDrift(sceneSnapImp.ball, sceneSnapOrig.ball);
    const sceneDriftBox = sceneDrift(sceneSnapImp.box, sceneSnapOrig.box);
    const sceneDriftRope = sceneDrift(sceneSnapImp.rope0, sceneSnapOrig.rope0);
    lines.push("INFO scene drift after 60 steps ball=" + sceneDriftBall.toFixed(6) + " box=" + sceneDriftBox.toFixed(6) + " rope=" + sceneDriftRope.toFixed(6));
    // Ohne Warmstart-Impulse der Kontakte weichen Bahnen nach Stößen ab.
    // 0,25 m plus Geschwindigkeit ist für 1 s Simulation nach dem Import noch nah.
    check("scene stays close after 60 fixed steps", sceneDriftBall < 0.25 && sceneDriftBox < 0.25 && sceneDriftRope < 0.35);

    let sceneBadSafe = true;
    let sceneBadRes;
    let sceneEmptyRes;
    let sceneJunkRes;
    try {
      sceneBadRes = loadSceneFromTextSync("dies ist kein zettel");
      sceneEmptyRes = loadSceneFromTextSync("");
      sceneJunkRes = loadSceneFromTextSync("CGJ1:!!!!");
      if ((sceneBadRes && sceneBadRes.ok) || (sceneEmptyRes && sceneEmptyRes.ok) || (sceneJunkRes && sceneJunkRes.ok)) sceneBadSafe = false;
    } catch (sceneBadErr) {
      sceneBadSafe = false;
    }
    check("invalid scene text does not crash", sceneBadSafe && sceneBadRes && sceneBadRes.error && sceneEmptyRes && sceneEmptyRes.error && sceneJunkRes && sceneJunkRes.error);
    check("invalid scene text leaves the current world intact", !!world && !!ball && mode === "play" && pins.length >= 2);

    {
      // Regression Zettel "Würfel kommt nicht zur Ruhe": schwerer Klotz (rund
      // 20 kg) an einem Seil von einer Säule oder einem Bodennagel, angehoben
      // und fallen gelassen. Früher teleportierte die Seilkorrektur den Klotz
      // ohne seine Geschwindigkeit, und die leichten Perlen klemmten unter ihm:
      // Er steckte im Boden und zappelte endlos.
      const wfCorners = (body) => {
        const meta = bodyMeta.get(body);
        return meta.outline.local.map((p) => body.getWorldPoint(V(p.x, p.y)));
      };
      const wfSink = (body) => {
        let worst = 0;
        for (const p of wfCorners(body)) if (p.y < 1.3) worst = Math.max(worst, 1.3 - p.y);
        return worst;
      };
      const wfBuild = (anchorKind, pinLocal) => {
        buildLevel(LEVELS.sandbox);
        world.destroyBody(ball);
        ball = null;
        stars = [];
        let anchorAt;
        if (anchorKind === "pillar") {
          addStaticSolid([[7.1, 1.3], [8.46, 1.3], [8.46, 11.48], [7.1, 11.48]], "#3f8f55");
          anchorAt = { x: 7.78, y: 11.04 };
        } else anchorAt = { x: 12, y: 1.5 };
        const wfBox = makeBox({ x: 17.16, y: 2.99, hw: 2.0, hh: 1.67, density: 1.5 });
        for (let i = 0; i < 30; i++) step(1 / 60);
        const wfPinA = rememberPin(anchorAt.x, anchorAt.y, ground, true);
        const c = wfBox.getWorldPoint(V(pinLocal[0], pinLocal[1]));
        const wfPinB = rememberPin(c.x, c.y, wfBox, true);
        const wfRope = spawnRope(wfPinA, wfPinB, [anchorAt, { x: (anchorAt.x + c.x) / 2, y: (anchorAt.y + c.y) / 2 }, { x: c.x, y: c.y }]);
        for (let i = 0; i < 120; i++) step(1 / 60);
        return { box: wfBox, rope: wfRope, pa: wfPinA, pb: wfPinB };
      };
      const wfDrop = (rig, h) => {
        const p = rig.box.getPosition();
        rig.box.setTransform(V(p.x, p.y + h), rig.box.getAngle());
        rig.box.setLinearVelocity(V(0, 0));
        rig.box.setAngularVelocity(0);
        rig.box.setAwake(true);
        let maxSink = 0;
        let maxChord = 0;
        let speedSum = 0;
        for (let i = 0; i < 300; i++) {
          step(1 / 60);
          maxSink = Math.max(maxSink, wfSink(rig.box));
          // Das Anheben ist ein Teleport über die Seillänge hinaus; der erste
          // Schritt holt ihn zurück und zählt deshalb nicht.
          if (i >= 2) maxChord = Math.max(maxChord, dist(pinWorld(rig.pa), pinWorld(rig.pb)) / rig.rope.restLength);
          if (i >= 240) {
            const v = rig.box.getLinearVelocity();
            speedSum += Math.hypot(v.x, v.y) + Math.abs(rig.box.getAngularVelocity()) * 2;
          }
        }
        return {
          maxSink,
          endSink: wfSink(rig.box),
          meanV: speedSum / 60,
          endChord: dist(pinWorld(rig.pa), pinWorld(rig.pb)) / rig.rope.restLength,
          maxChord,
        };
      };
      let wfWorst = { maxSink: 0, endSink: 0, meanV: 0, endChord: 0, maxChord: 0 };
      let wfRuns = 0;
      for (const wfAnchor of ["pillar", "floor"]) {
        for (const wfPinLocal of [[0, 1.5], [1.85, 1.5], [-1.85, 1.5]]) {
          const rig = wfBuild(wfAnchor, wfPinLocal);
          check("rope to a heavy box gets a chord joint (" + wfAnchor + ")", !!rig.rope && !!rig.rope.chordJoint);
          for (const h of [2, 4, 6]) {
            const res = wfDrop(rig, h);
            wfRuns++;
            for (const k of Object.keys(wfWorst)) wfWorst[k] = Math.max(wfWorst[k], res[k]);
          }
        }
      }
      lines.push("INFO wuerfel drops " + wfRuns + " maxSink " + wfWorst.maxSink.toFixed(3) + " endSink " + wfWorst.endSink.toFixed(3)
        + " meanV " + wfWorst.meanV.toFixed(3) + " chord end " + wfWorst.endChord.toFixed(4) + " max " + wfWorst.maxChord.toFixed(4));
      check("dropped box on a rope does not sink into the floor", wfWorst.maxSink < 0.1 && wfWorst.endSink < 0.02);
      check("dropped box on a rope comes to rest", wfWorst.meanV < 0.1);
      check("rope to a dropped box stays at rest length", wfWorst.endChord < 1.012 && wfWorst.maxChord < 1.016);

      // Nach Zettel-Export und -Import hängt die Sehne wieder dran.
      const wfRig = wfBuild("pillar", [1.85, 1.5]);
      const wfText = encodeSceneTextSync(captureScene());
      const wfLoad = loadSceneFromTextSync(wfText);
      const wfRope = drawings.find((d) => d.kind === "rope");
      const wfBoxBack = wfRope && wfRope.pinB && wfRope.pinB.body;
      check("scene import restores the rope chord joint", !!(wfLoad && wfLoad.ok) && !!wfRope && !!wfRope.chordJoint && !!wfBoxBack && wfBoxBack !== wfRig.box);
      if (wfRope && wfBoxBack) {
        const wfRes = wfDrop({ box: wfBoxBack, rope: wfRope, pa: wfRope.pinA, pb: wfRope.pinB }, 4);
        lines.push("INFO wuerfel after import sink " + wfRes.maxSink.toFixed(3) + " meanV " + wfRes.meanV.toFixed(3) + " chord " + wfRes.endChord.toFixed(4));
        check("imported box on a rope comes to rest above the floor", wfRes.maxSink < 0.1 && wfRes.meanV < 0.1 && wfRes.endChord < 1.012);
      }
    }

    // Seil liegt eine Ebene vor den Nagelwirten und stößt nicht mit ihnen zusammen.
    {
      function rfPair(contact) {
        const ba = contact.getFixtureA().getBody();
        const bb = contact.getFixtureB().getBody();
        const fa = contact.getFixtureA();
        const fb = contact.getFixtureB();
        const ma = bodyMeta.get(ba);
        const mb = bodyMeta.get(bb);
        if (ma && ma.kind === "rope" && !(mb && mb.kind === "rope")) return { bead: ba, other: bb, fix: fb, ropeId: ma.ropeId };
        if (mb && mb.kind === "rope" && !(ma && ma.kind === "rope")) return { bead: bb, other: ba, fix: fa, ropeId: mb.ropeId };
        return null;
      }
      function rfHostHits(ropeDraw, hosts) {
        const ids = new Set();
        for (const h of hosts) if (h && h.solidId) ids.add(h.solidId);
        let touch = 0;
        let on = 0;
        for (let c = world.getContactList(); c; c = c.getNext()) {
          if (!c.isTouching()) continue;
          const p = rfPair(c);
          if (!p || p.ropeId !== ropeDraw.ropeId) continue;
          const onBody = hosts.some((h) => h.body && h.body !== ground && p.other === h.body);
          const onSolid = p.other === ground && ids.has(p.fix && p.fix._solidId);
          if (!onBody && !onSolid) continue;
          touch++;
          if (c.isEnabled()) on++;
        }
        return { touch, on };
      }
      function rfFloorHits(ropeDraw) {
        let on = 0;
        for (let c = world.getContactList(); c; c = c.getNext()) {
          if (!c.isTouching() || !c.isEnabled()) continue;
          const p = rfPair(c);
          if (!p || p.ropeId !== ropeDraw.ropeId || p.other !== ground) continue;
          if (p.fix && p.fix._solidFloor) on++;
        }
        return on;
      }
      function rfLowest(ropeDraw) {
        let best = null;
        for (const b of ropeDraw.bodies) {
          const p = b.getPosition();
          if (!best || p.y < best.y) best = p;
        }
        return best;
      }
      const rfUneven = [0.008, 0.021, 0.013, 0.019, 0.011];

      buildLevel(LEVELS["ein-klotz"]);
      ball.setTransform(V(2, 1.66), 0);
      ball.setLinearVelocity(V(0, 0));
      const rfA = makeBox({ x: 8, y: 4.5, hw: 1.1, hh: 2.4 });
      const rfB = makeBox({ x: 18, y: 4.5, hw: 1.1, hh: 2.4 });
      rfA.setStatic();
      rfB.setStatic();
      const rfPa = rememberPin(8, 6.2, rfA, true);
      const rfPb = rememberPin(18, 6.2, rfB, true);
      const rfRope = spawnRope(rfPa, rfPb, [
        { x: 8, y: 6.2 }, { x: 8, y: 3.2 }, { x: 13, y: 2.0 }, { x: 18, y: 3.2 }, { x: 18, y: 6.2 },
      ]);
      for (let i = 0; i < 150; i++) step(1 / 60);
      for (let i = 0; i < 30; i++) step(rfUneven[i % rfUneven.length]);
      const rfHits = rfRope ? rfHostHits(rfRope, [{ body: rfA }, { body: rfB }]) : { touch: 0, on: 1 };
      let rfThrough = false;
      let rfSag = false;
      if (rfRope) {
        for (let i = 1; i < Math.min(6, rfRope.bodies.length - 1); i++) {
          const p = rfRope.bodies[i].getPosition();
          if (p.x > 6.95 && p.x < 9.05 && p.y > 2.3 && p.y < 6.7) rfThrough = true;
        }
        for (const b of rfRope.bodies) {
          const p = b.getPosition();
          if (p.y < 2.2 && p.x > 9.5 && p.x < 16.5) rfSag = true;
        }
      }
      lines.push("INFO rope-front bodies touch " + rfHits.touch + " enabled " + rfHits.on
        + " through " + rfThrough + " sag " + rfSag);
      check("a rope from nail to nail does not collide with either host", !!rfRope && rfHits.touch > 0 && rfHits.on === 0 && rfThrough);
      check("a rope from nail to nail hangs below the nails", rfSag);
      const rfLayers = bodyLayers();
      const rfOrder = drawingsByLayer();
      check("a rope is drawn one layer in front of both nail hosts", !!rfRope && drawLayer(rfRope, rfLayers) === 1
        && rfOrder.findIndex((d) => d === rfRope) > rfOrder.findIndex((d) => d.body === rfA)
        && rfOrder.findIndex((d) => d === rfRope) > rfOrder.findIndex((d) => d.body === rfB));
      const rfHat = makeBox({ x: 8, y: 8.4, hw: 0.28, hh: 0.28, density: 0.5 });
      let rfHatOn = false;
      for (let i = 0; i < 90; i++) {
        step(1 / 60);
        for (let c = world.getContactList(); c; c = c.getNext()) {
          if (!c.isTouching() || !c.isEnabled()) continue;
          const ba = c.getFixtureA().getBody();
          const bb = c.getFixtureB().getBody();
          if ((ba === rfHat && bb === rfA) || (ba === rfA && bb === rfHat)) rfHatOn = true;
        }
      }
      check("a nail host still collides with a third body", rfHatOn);

      const rfNail = rememberPin(8.6, 5.0, rfA, true);
      const rfBoard = makeBox({ x: 10.8, y: 5.0, hw: 2.4, hh: 0.22 });
      const rfBoardDraw = drawings.find((d) => d.body === rfBoard);
      const rfPinned = rfBoardDraw ? attachExistingPins(rfBoard, rfBoardDraw.meta) : 0;
      const rfBoardPin = rememberPin(10.8, 5.0, rfBoard, true);
      const rfFar = rememberPin(18, 5.0, rfB, true);
      const rfRope2 = spawnRope(rfBoardPin, rfFar, [
        { x: 10.8, y: 5.0 }, { x: 14.4, y: 3.2 }, { x: 18, y: 5.0 },
      ]);
      const rfLayers2 = bodyLayers();
      const rfOrder2 = drawingsByLayer();
      check("a rope on a nailed board is two layers in front of the column", rfPinned > 0 && !!rfRope2 && !!rfNail
        && (rfLayers2.get(rfBoard) === 1) && drawLayer(rfRope2, rfLayers2) === 2
        && rfOrder2.findIndex((d) => d === rfRope2) > rfOrder2.findIndex((d) => d.body === rfBoard)
        && rfOrder2.findIndex((d) => d === rfRope2) > rfOrder2.findIndex((d) => d.body === rfA));

      buildLevel(LEVELS["ein-klotz"]);
      ball.setTransform(V(2, 1.66), 0);
      ball.setLinearVelocity(V(0, 0));
      addStaticSolid([{ x: 6, y: 4.8 }, { x: 8.6, y: 4.8 }, { x: 8.6, y: 8.2 }, { x: 6, y: 8.2 }], "#c9854a");
      addStaticSolid([{ x: 16.4, y: 4.8 }, { x: 19, y: 4.8 }, { x: 19, y: 8.2 }, { x: 16.4, y: 8.2 }], "#c9854a");
      const rfGa = rememberPin(7.3, 7.4, ground, true);
      const rfGb = rememberPin(17.7, 7.4, ground, true);
      const rfGroundRope = spawnRope(rfGa, rfGb, [
        { x: 7.3, y: 7.4 }, { x: 7.3, y: 3.0 }, { x: 12.5, y: 1.6 }, { x: 17.7, y: 3.0 }, { x: 17.7, y: 7.4 },
      ]);
      for (let i = 0; i < 150; i++) step(1 / 60);
      for (let i = 0; i < 30; i++) step(rfUneven[i % rfUneven.length]);
      const rfGHits = rfGroundRope ? rfHostHits(rfGroundRope, [rfGa, rfGb]) : { touch: 0, on: 1 };
      const rfGLow = rfGroundRope ? rfLowest(rfGroundRope) : null;
      const rfGFloor = rfGroundRope ? rfFloorHits(rfGroundRope) : 0;
      lines.push("INFO rope-front posts touch " + rfGHits.touch + " enabled " + rfGHits.on
        + " floor " + rfGFloor + " low " + (rfGLow ? rfGLow.y.toFixed(2) : "none")
        + " solid " + (rfGa ? rfGa.solidId : 0) + "/" + (rfGb ? rfGb.solidId : 0)
        + " floorFlag " + (rfGa ? rfGa.solidFloor : "?"));
      check("a rope between ground posts does not collide with those posts", !!rfGroundRope && rfGa.solidId > 0 && rfGb.solidId > 0
        && rfGa.solidId !== rfGb.solidId && !rfGa.solidFloor && !rfGb.solidFloor
        && rfGHits.touch > 0 && rfGHits.on === 0);
      check("a rope between ground posts still lies on the floor", rfGFloor > 0 && !!rfGLow && rfGLow.y > 1.25 && rfGLow.y < 1.8);
      const rfRock = makeBox({ x: 8.2, y: 10.2, hw: 0.22, hh: 0.22, density: 0.4 });
      let rfRockOn = false;
      for (let i = 0; i < 90; i++) {
        step(1 / 60);
        for (let c = world.getContactList(); c; c = c.getNext()) {
          if (!c.isTouching() || !c.isEnabled()) continue;
          const ba = c.getFixtureA().getBody();
          const bb = c.getFixtureB().getBody();
          const fix = ba === rfRock ? c.getFixtureB() : bb === rfRock ? c.getFixtureA() : null;
          if (fix && fix._solidId === rfGa.solidId) rfRockOn = true;
        }
      }
      check("a ground post still collides with a body that is not its rope", rfRockOn);
      const rfPostText = encodeSceneTextSync(captureScene());
      const rfPostLoad = loadSceneFromTextSync(rfPostText);
      const rfBack = drawings.find((d) => d.kind === "rope");
      for (let i = 0; i < 40; i++) step(1 / 60);
      const rfBackHits = rfBack ? rfHostHits(rfBack, [rfBack.pinA, rfBack.pinB]) : { touch: 0, on: 1 };
      const rfBackFloor = rfBack ? rfFloorHits(rfBack) : 0;
      const rfBackLow = rfBack ? rfLowest(rfBack) : null;
      lines.push("INFO rope-front import touch " + rfBackHits.touch + " enabled " + rfBackHits.on + " floor " + rfBackFloor
        + " low " + (rfBackLow ? rfBackLow.y.toFixed(2) : "none"));
      check("an imported rope still ignores its posts and lies on the floor", !!(rfPostLoad && rfPostLoad.ok) && !!rfBack
        && rfBack.pinA && rfBack.pinA.solidId > 0 && !rfBack.pinA.solidFloor
        && rfBackHits.touch > 0 && rfBackHits.on === 0 && rfBackFloor > 0
        && !!rfBackLow && rfBackLow.y > 1.25 && rfBackLow.y < 1.8);
    }

    // Geburtsregel: über ein vorhandenes Seil gezeichnet entsteht der Körper dahinter.
    {
      function bhHits(body, ropeDraw) {
        let touch = 0;
        let on = 0;
        if (!body || !ropeDraw) return { touch, on };
        for (let c = world.getContactList(); c; c = c.getNext()) {
          if (!c.isTouching()) continue;
          const ba = c.getFixtureA().getBody();
          const bb = c.getFixtureB().getBody();
          const bead = ba === body ? bb : bb === body ? ba : null;
          if (!bead) continue;
          const meta = bodyMeta.get(bead);
          if (!meta || meta.kind !== "rope" || meta.ropeId !== ropeDraw.ropeId) continue;
          touch++;
          if (c.isEnabled()) on++;
        }
        return { touch, on };
      }
      function bhSettle(n) {
        const uneven = [0.008, 0.021, 0.013, 0.019, 0.011];
        for (let i = 0; i < n; i++) step(1 / 60);
        for (let i = 0; i < uneven.length * 3; i++) step(uneven[i % uneven.length]);
      }
      function bhPark() {
        buildLevel(LEVELS["ein-klotz"]);
        ball.setTransform(V(2, 1.66), 0);
        ball.setLinearVelocity(V(0, 0));
        ball.setAngularVelocity(0);
      }
      function bhHammock(x0, x1, y, sag) {
        const postA = makeBox({ x: x0, y: y - 2.2, hw: 0.7, hh: 2.2 });
        const postB = makeBox({ x: x1, y: y - 2.2, hw: 0.7, hh: 2.2 });
        postA.setStatic();
        postB.setStatic();
        const pa = rememberPin(x0, y, postA, true);
        const pb = rememberPin(x1, y, postB, true);
        const midX = (x0 + x1) / 2;
        return spawnRope(pa, pb, [
          { x: x0, y: y },
          { x: midX, y: y - sag },
          { x: x1, y: y },
        ]);
      }
      function bhWake(body, x, y) {
        body.setTransform(V(x, y), 0);
        body.setLinearVelocity(V(0, 0));
        body.setAngularVelocity(0);
        body.setAwake(true);
      }

      bhPark();
      const bhRope = bhHammock(6, 20, 8, 0.8);
      bhSettle(20);
      const bhTri = spawnSolid([
        { x: 14.2, y: 6.5 },
        { x: 17.8, y: 6.5 },
        { x: 16.0, y: 8.4 },
      ], { density: 1.5 });
      const bhTriIds = bhTri && bhTri.meta.behindRopeIds;
      const bhOrder = drawingsByLayer();
      check("a shape drawn over a rope is born behind that rope",
        !!bhTri && bhTri.kind === "solid" && !!bhRope && !!bhTriIds && bhTriIds.indexOf(bhRope.ropeId) >= 0);
      check("a shape born behind a rope is drawn before that rope",
        !!bhTri && !!bhRope && bhOrder.indexOf(bhTri) >= 0 && bhOrder.indexOf(bhTri) < bhOrder.indexOf(bhRope));
      for (let i = 0; i < 8; i++) step(1 / 60);
      const bhEarly = bhHits(bhTri && bhTri.body, bhRope);
      const bhEarlyY = bhTri ? bhTri.body.getPosition().y : 0;
      check("a shape drawn over a rope does not collide while it still overlaps",
        bhEarly.touch > 0 && bhEarly.on === 0 && bhEarlyY > 5);
      bhSettle(140);
      const bhTriY = bhTri ? bhTri.body.getPosition().y : 99;
      const bhTriV = bhTri ? Math.hypot(bhTri.body.getLinearVelocity().x, bhTri.body.getLinearVelocity().y) : 99;
      const bhTriHits = bhHits(bhTri && bhTri.body, bhRope);
      lines.push("INFO birth-behind y " + bhTriY.toFixed(2) + " v " + bhTriV.toFixed(2)
        + " touch " + bhTriHits.touch + " on " + bhTriHits.on + " early " + bhEarly.touch + "/" + bhEarly.on);
      check("a shape drawn over a rope falls through onto the floor",
        bhTriY > 1.15 && bhTriY < 2.8 && bhTriV < 1.5 && bhTriHits.on === 0);
      const bhText = encodeSceneTextSync(captureScene());
      const bhLoad = loadSceneFromTextSync(bhText);
      const bhBack = drawings.find((d) => d.meta && d.meta.behindRopeIds && d.meta.behindRopeIds.length);
      const bhBackRope = drawings.find((d) => d.kind === "rope");
      check("born-behind ropes survive the scene slip", !!(bhLoad && bhLoad.ok) && !!bhBack && !!bhBackRope
        && bhBack.meta.behindRopeIds.indexOf(bhBackRope.ropeId) >= 0);
      if (bhBack && bhBackRope) {
        bhWake(bhBack.body, 16, 7.3);
        for (let i = 0; i < 8; i++) step(1 / 60);
        const bhLift = bhHits(bhBack.body, bhBackRope);
        check("a born-behind shape still ignores that rope after it is moved back onto it",
          bhLift.touch > 0 && bhLift.on === 0 && bhBack.body.getPosition().y > 5);
        bhSettle(140);
        const bhAgainY = bhBack.body.getPosition().y;
        const bhAgain = bhHits(bhBack.body, bhBackRope);
        lines.push("INFO birth-again y " + bhAgainY.toFixed(2) + " touch " + bhAgain.touch + " on " + bhAgain.on);
        check("a born-behind shape falls through the same rope again",
          bhAgainY > 1.15 && bhAgainY < 2.8 && bhAgain.on === 0);
      } else {
        check("a born-behind shape still ignores that rope after it is moved back onto it", false);
        check("a born-behind shape falls through the same rope again", false);
      }

      bhPark();
      const bhRopeC = bhHammock(6, 20, 8, 0.8);
      bhSettle(20);
      const bhBox = spawnSolid([
        { x: 14.6, y: 9.1 },
        { x: 17.4, y: 9.1 },
        { x: 17.4, y: 10.7 },
        { x: 14.6, y: 10.7 },
      ], { density: 1.5 });
      check("a shape drawn clear of a rope is not born behind it",
        !!bhBox && !(bhBox.meta.behindRopeIds && bhBox.meta.behindRopeIds.length));
      bhSettle(160);
      const bhBoxY = bhBox ? bhBox.body.getPosition().y : 0;
      const bhBoxV = bhBox ? Math.hypot(bhBox.body.getLinearVelocity().x, bhBox.body.getLinearVelocity().y) : 99;
      const bhBoxHits = bhHits(bhBox && bhBox.body, bhRopeC);
      lines.push("INFO birth-catch y " + bhBoxY.toFixed(2) + " v " + bhBoxV.toFixed(2)
        + " touch " + bhBoxHits.touch + " on " + bhBoxHits.on);
      check("a shape drawn clear of a rope is caught by it",
        bhBoxY > 6.2 && bhBoxY < 9.2 && bhBoxHits.on > 0);

      bhPark();
      const bhLow = bhHammock(5, 12, 5.6, 0.75);
      const bhHigh = bhHammock(18, 26, 8.2, 0.3);
      bhSettle(20);
      const bhOnly = spawnSolid([
        { x: 7.6, y: 4.3 },
        { x: 9.4, y: 4.3 },
        { x: 8.5, y: 5.9 },
      ], { density: 1.2 });
      const bhOnlyIds = bhOnly && bhOnly.meta.behindRopeIds;
      check("a shape crossing one of two ropes is born behind only that rope",
        !!bhOnly && !!bhLow && !!bhHigh && !!bhOnlyIds && bhOnlyIds.length === 1
        && bhOnlyIds.indexOf(bhLow.ropeId) >= 0 && bhOnlyIds.indexOf(bhHigh.ropeId) < 0);
      if (bhOnly && bhHigh && bhLow) {
        bhWake(bhOnly.body, 22, 10.2);
        bhSettle(150);
        const bhHighY = bhOnly.body.getPosition().y;
        const bhHighHits = bhHits(bhOnly.body, bhHigh);
        const bhLowHits = bhHits(bhOnly.body, bhLow);
        lines.push("INFO birth-other y " + bhHighY.toFixed(2)
          + " high " + bhHighHits.touch + "/" + bhHighHits.on
          + " low " + bhLowHits.touch + "/" + bhLowHits.on
          + " ids " + bhOnly.meta.behindRopeIds.length);
        check("the same shape is caught by a rope it was not drawn over",
          bhHighY > 6.4 && bhHighHits.on > 0 && bhLowHits.on === 0
          && bhOnly.meta.behindRopeIds.length === 1);
        bhWake(bhOnly.body, 8.5, 5.05);
        for (let i = 0; i < 8; i++) step(1 / 60);
        const bhLowEarly = bhHits(bhOnly.body, bhLow);
        check("moving onto the first rope still does not collide with it",
          bhLowEarly.touch > 0 && bhLowEarly.on === 0);
        bhSettle(140);
        const bhLowY = bhOnly.body.getPosition().y;
        const bhLowEnd = bhHits(bhOnly.body, bhLow);
        lines.push("INFO birth-low-again y " + bhLowY.toFixed(2) + " on " + bhLowEnd.on);
        check("moving onto the first rope lets the shape fall through it",
          bhLowY > 1.15 && bhLowY < 2.8 && bhLowEnd.on === 0);
      } else {
        check("the same shape is caught by a rope it was not drawn over", false);
        check("moving onto the first rope still does not collide with it", false);
        check("moving onto the first rope lets the shape fall through it", false);
      }

      bhPark();
      const bhOld = spawnSolid([
        { x: 15.3, y: 7.55 },
        { x: 16.7, y: 7.55 },
        { x: 16.7, y: 8.7 },
        { x: 15.3, y: 8.7 },
      ], { density: 1.5 });
      const bhLate = bhHammock(6, 20, 8, 0.55);
      check("a rope drawn across an existing body does not put that body behind it",
        !!bhOld && !!bhLate && !(bhOld.meta.behindRopeIds && bhOld.meta.behindRopeIds.length));
      for (let i = 0; i < 8; i++) step(1 / 60);
      const bhLateEarly = bhHits(bhOld && bhOld.body, bhLate);
      bhSettle(140);
      const bhOldY = bhOld ? bhOld.body.getPosition().y : 0;
      const bhLateHits = bhHits(bhOld && bhOld.body, bhLate);
      lines.push("INFO birth-late y " + bhOldY.toFixed(2)
        + " early " + bhLateEarly.touch + "/" + bhLateEarly.on
        + " end " + bhLateHits.touch + "/" + bhLateHits.on);
      check("a rope drawn across an existing body still supports it",
        bhLateEarly.on > 0 && bhOldY > 5.5 && bhLateHits.on > 0);

      bhPark();
      const bhCutRope = bhHammock(6, 20, 8, 0.8);
      bhSettle(15);
      const bhCut = spawnSolid([
        { x: 14.2, y: 6.5 },
        { x: 17.8, y: 6.5 },
        { x: 16.0, y: 8.4 },
      ], { density: 1.2 });
      const bhMid = bhCutRope ? Math.floor(bhCutRope.bodies.length / 2) : 0;
      const bhMidP = bhCutRope ? bhCutRope.bodies[bhMid].getPosition() : { x: 0, y: 0 };
      const bhCutOk = !!(bhCutRope && bhCut && cutRopeAtBead({
        draw: bhCutRope, index: bhMid, x: bhMidP.x, y: bhMidP.y,
      }));
      const bhHalves = drawings.filter((d) => d.kind === "rope");
      const bhCutIds = (bhCut && bhCut.meta.behindRopeIds) || [];
      check("cutting a rope keeps a born-behind body behind both halves",
        bhCutOk && bhHalves.length === 2 && bhCutIds.length === 2
        && bhHalves.every((d) => bhCutIds.indexOf(d.ropeId) >= 0));
      bhSettle(140);
      const bhCutY = bhCut ? bhCut.body.getPosition().y : 99;
      const bhCutOn = bhHalves.reduce((n, d) => n + bhHits(bhCut && bhCut.body, d).on, 0);
      lines.push("INFO birth-cut y " + bhCutY.toFixed(2) + " on " + bhCutOn + " halves " + bhHalves.length);
      check("a born-behind body falls through both halves of a cut rope",
        bhCutY > 1.15 && bhCutY < 2.8 && bhCutOn === 0);

      bhPark();
      const bhInkRope = bhHammock(6, 20, 8, 0.8);
      bhSettle(10);
      const bhWire = spawnWire([{ x: 16, y: 6.2 }, { x: 16, y: 8.2 }], {});
      const bhRoll = spawnRoller(16, 7.2, 0.55);
      check("a wire or ball drawn over a rope is born behind it",
        !!bhWire && !!bhRoll && !!bhInkRope
        && bhWire.meta.behindRopeIds && bhWire.meta.behindRopeIds.indexOf(bhInkRope.ropeId) >= 0
        && bhRoll.meta.behindRopeIds && bhRoll.meta.behindRopeIds.indexOf(bhInkRope.ropeId) >= 0);
    }

    // Ebenen per Nagel und Geist beim Ziehen (52-ebenen.js).
    {
      lastTap = 0;
      buildLevel(LEVELS["ein-klotz"]);
      ball.setTransform(V(3, 1.66), 0);
      cam.cx = 16;
      cam.cy = 6;
      cam.zoom = 1;
      const lvCol = makeBox({ x: 12, y: 4.35, hw: 0.5, hh: 3.0 });
      for (let i = 0; i < 20; i++) step(1 / 60);
      const lvColDraw = drawings.find((d) => d.body === lvCol);
      const lvAnch = anchorBody(lvColDraw, ground, { x: 12, y: 1.3 }, { x: 12, y: 1.8 });
      const lvPin = rememberPin(12, 6.6, lvCol, true);
      const lvBoard = makeBox({ x: 22, y: 6.6, hw: 2.4, hh: 0.2, color: "#3c7fd6" });
      world.setGravity(V(0, 0));
      // Brett am Rand greifen und mit echten Zeiger-Ereignissen über den Nagel ziehen.
      const lvGrab = worldToScreen(23.9, 6.6);
      onPointerDown({ button: 0, clientX: lvGrab.x, clientY: lvGrab.y, pointerId: 91 });
      let lvGhostOverNail = false;
      let lvTargetSeen = false;
      for (let i = 1; i <= 40; i++) {
        const gx = 23.9 + (13.9 - 23.9) * i / 40;
        const sp = worldToScreen(gx, 6.6);
        onPointerMove({ clientX: sp.x, clientY: sp.y, pointerId: 91 });
        step(1 / 60);
        if (playDrag && Math.abs(lvBoard.getPosition().x - 12) < 0.3) {
          if (playDrag.ghost) lvGhostOverNail = true;
          if (playDrag.targets && playDrag.targets.indexOf(lvPin) >= 0) lvTargetSeen = true;
        }
      }
      const lvHeld = !!playDrag && playDrag.body === lvBoard;
      const lvColPos = lvCol.getPosition();
      check("a held body passes through the column", lvHeld && Math.abs(lvBoard.getPosition().x - 12) < 0.3 && lvAnch && Math.abs(lvColPos.x - 12) < 1e-6);
      check("a held body over a nail in its host is no ghost and marks the nail", lvTargetSeen && !lvGhostOverNail);
      const lvUp = worldToScreen(13.9, 6.6);
      onPointerUp({ clientX: lvUp.x, clientY: lvUp.y, pointerId: 91 });
      const lvPinned = lvPin.joints.some((j) => j && (j.getBodyA() === lvBoard || j.getBodyB() === lvBoard));
      check("releasing over the nail pins the body to the column", !playDrag && lvPinned && nailLinked(lvBoard, lvCol));
      const lvLayers = bodyLayers();
      const lvOrder = drawingsByLayer();
      check("a body on a nail is one layer in front of its host", (lvLayers.get(lvCol) || 0) === 0 && lvLayers.get(lvBoard) === 1
        && lvOrder.findIndex((d) => d.body === lvBoard) > lvOrder.findIndex((d) => d.body === lvCol));
      world.setGravity(V(0, -24));
      const lvTouch = (a, b) => {
        for (let c = world.getContactList(); c; c = c.getNext()) {
          const ba = c.getFixtureA().getBody();
          const bb = c.getFixtureB().getBody();
          if (((ba === a && bb === b) || (ba === b && bb === a)) && c.isTouching() && c.isEnabled()) return true;
        }
        return false;
      };
      // Windrad: Motor an, das Brett dreht sich vor der Säule frei herum.
      cycleNailMotor(lvPin);
      const lvA0 = lvBoard.getAngle();
      let lvHostTouch = false;
      for (let i = 0; i < 240; i++) {
        step(1 / 60);
        if (lvTouch(lvBoard, lvCol)) lvHostTouch = true;
      }
      const lvTurn = lvBoard.getAngle() - lvA0;
      const lvAt = pinWorld(lvPin);
      const lvLocal = lvBoard.getLocalPoint(V(lvAt.x, lvAt.y));
      lines.push("INFO windrad turn " + (lvTurn * 180 / Math.PI).toFixed(0) + " deg, host touch " + lvHostTouch);
      check("a windmill board turns freely in front of its column", lvTurn > Math.PI * 1.6 && !lvHostTouch && Math.hypot(lvLocal.x, lvLocal.y) < 0.05);
      cycleNailMotor(lvPin);
      cycleNailMotor(lvPin);
      // Ein dritter Körper stößt weiter mit dem Brett zusammen.
      lvBoard.setTransform(lvBoard.getPosition(), 0);
      lvBoard.setAngularVelocity(0);
      const lvThird = makeBox({ x: 13.6, y: 8.2, hw: 0.35, hh: 0.35, density: 0.3, color: "#d94b3a" });
      let lvThirdTouch = false;
      for (let i = 0; i < 40; i++) {
        step(1 / 60);
        if (lvTouch(lvThird, lvBoard)) lvThirdTouch = true;
      }
      check("a body on a nail still collides with a third body", lvThirdTouch);
      world.destroyBody(lvThird);
      bodyMeta.delete(lvThird);
      drawings = drawings.filter((d) => d.body !== lvThird);

      // Zettel: Nach Export und Import gilt der Filter wieder.
      const lvText = encodeSceneTextSync(captureScene());
      const lvLoad = loadSceneFromTextSync(lvText);
      const lvPin2 = pins.find((pn) => Math.hypot(pinWorld(pn).x - 12, pinWorld(pn).y - 6.6) < 0.1);
      const lvCol2 = lvPin2 && lvPin2.body;
      const lvBoard2 = lvPin2 && lvPin2.joints.map((j) => nailJointOther(lvPin2, j)).find((b) => b && bodyMeta.get(b) && bodyMeta.get(b).kind !== "rope");
      let lvHostTouch2 = false;
      if (lvBoard2) {
        lvBoard2.setAngularVelocity(3);
        for (let i = 0; i < 90; i++) {
          step(1 / 60);
          if (lvTouch(lvBoard2, lvCol2)) lvHostTouch2 = true;
        }
      }
      check("after scene import the nailed board still ignores its column", !!(lvLoad && lvLoad.ok) && !!lvBoard2 && nailLinked(lvBoard2, lvCol2) && bodyLayers().get(lvBoard2) === 1 && !lvHostTouch2);

      // Geist: durch einen Klotz ziehen, überlappend loslassen, zurück zur letzten freien Pose.
      buildLevel(LEVELS["ein-klotz"]);
      ball.setTransform(V(3, 1.66), 0);
      world.setGravity(V(0, 0));
      const gsA = makeBox({ x: 16, y: 5, hw: 0.8, hh: 0.8 });
      const gsB = makeBox({ x: 21, y: 5, hw: 0.5, hh: 0.5, color: "#3c7fd6" });
      beginDrag(21, 5);
      let gsGhost = false;
      let gsShadowFree = true;
      for (let i = 1; i <= 50; i++) {
        moveDrag(21 + (13 - 21) * i / 50, 5);
        step(1 / 60);
        if (playDrag.ghost) {
          gsGhost = true;
          if (overlapAtPose(gsB, playDrag.free, null)) gsShadowFree = false;
        }
      }
      const gsAPos = gsA.getPosition();
      check("a dragged body goes through another body", Math.abs(gsB.getPosition().x - 13) < 0.05 && Math.hypot(gsAPos.x - 16, gsAPos.y - 5) < 0.02);
      check("overlapping while held sets the ghost flag, the shadow pose is free", gsGhost && gsShadowFree && !playDrag.ghost);
      for (let i = 1; i <= 20; i++) {
        moveDrag(13 + (16.3 - 13) * i / 20, 5.2);
        step(1 / 60);
      }
      const gsFree = playDrag.free ? { x: playDrag.free.x, y: playDrag.free.y, a: playDrag.free.a } : null;
      const gsWasGhost = !!playDrag.ghost;
      endDrag();
      const gsP = gsB.getPosition();
      const gsV = gsB.getLinearVelocity();
      lines.push("INFO ghost snap back to " + gsP.x.toFixed(3) + "," + gsP.y.toFixed(3));
      check("releasing a ghost without a nail jumps back to the last free pose", gsWasGhost && !!gsFree && Math.hypot(gsP.x - gsFree.x, gsP.y - gsFree.y) < 1e-6
        && Math.hypot(gsV.x, gsV.y) < 1e-9 && Math.abs(gsB.getAngularVelocity()) < 1e-9);
      check("the snap-back pose sits right at the edge of the other body", gsP.x < 16 - 1.3 + 1e-3 && gsP.x > 16 - 1.3 - 0.08 && !overlapAtPose(gsB, poseOfBody(gsB), null));

      // Über einem Nagel, aber zusätzlich in einem dritten Körper: Geist, kein Heften.
      const gsPin = rememberPin(20, 8, ground, true);
      const gsC = makeBox({ x: 20.9, y: 8, hw: 0.3, hh: 0.3, color: "#d94b3a" });
      const gsD = makeBox({ x: 25, y: 8, hw: 1.0, hh: 0.4, color: "#3c7fd6" });
      beginDrag(25, 8);
      for (let i = 1; i <= 30; i++) {
        moveDrag(25 + (20.2 - 25) * i / 30, 8);
        step(1 / 60);
      }
      const gsThirdGhost = !!playDrag.ghost;
      const gsUp = worldToScreen(20.2, 8);
      pointer = { id: 92, dragging: true, trail: [{ x: 20.2, y: 8 }] };
      onPointerUp({ clientX: gsUp.x, clientY: gsUp.y, pointerId: 92 });
      const gsDPinned = gsPin.joints.some((j) => j && (j.getBodyA() === gsD || j.getBodyB() === gsD));
      check("over a nail but inside a third body stays a ghost and does not pin", gsThirdGhost && !gsDPinned && !overlapAtPose(gsD, poseOfBody(gsD), null));
      world.setGravity(V(0, -24));
    }

    {
      // Zettel 2: Dreieck an einem Nagel im freien Viereck (kein Bodennagel).
      // Die Gruppe folgt der Maus als Ganzes, egal an welchem Teil man zieht.
      buildLevel(LEVELS["sandbox"]);
      const fgQuadDraw = spawnSolid([{ x: 11.684, y: 1.315 }, { x: 17.307, y: 1.315 }, { x: 17.307, y: 3.083 }, { x: 11.684, y: 3.083 }], {});
      const fgPin = rememberPin(16.728, 2.302, fgQuadDraw.body, true);
      const fgTriDraw = spawnSolid([{ x: 14.721, y: 5.167 }, { x: 13.682, y: 1.315 }, { x: 17.367, y: 2.22 }], {});
      const fgQuad = fgQuadDraw.body;
      const fgTri = fgTriDraw.body;
      const fgJoint = fgPin.joints.find((j) => j && nailJointOther(fgPin, j) === fgTri);
      for (let i = 0; i < 30; i++) step(1 / 60);
      const fgJointErr = () => {
        const a = fgJoint.getAnchorA();
        const b = fgJoint.getAnchorB();
        return Math.hypot(a.x - b.x, a.y - b.y);
      };
      const fgDrag = (body, from, dx, dy) => {
        const q0 = fgQuad.getPosition().clone();
        const t0 = fgTri.getPosition().clone();
        beginDrag(from.x, from.y);
        const grabbed = !!playDrag && playDrag.body === body;
        const grouped = !!playDrag && !!playDrag.group && playDrag.group.length === 2;
        let err = 0;
        for (let i = 1; i <= 60; i++) {
          moveDrag(from.x + dx * i / 60, from.y + dy * i / 60);
          step(1 / 60);
          err = Math.max(err, fgJointErr());
        }
        for (let i = 0; i < 40; i++) {
          step(1 / 60);
          err = Math.max(err, fgJointErr());
        }
        const ghost = !!playDrag && !!playDrag.ghost;
        const grabAt = playDrag ? body.getWorldPoint(V(playDrag.local.x, playDrag.local.y)) : V(0, 0);
        const grabErr = Math.hypot(grabAt.x - from.x - dx, grabAt.y - from.y - dy);
        const q1 = fgQuad.getPosition().clone();
        const t1 = fgTri.getPosition().clone();
        endDrag();
        return {
          grabbed, grouped, err, ghost, grabErr,
          dq: Math.hypot(q1.x - q0.x, q1.y - q0.y),
          dt: Math.hypot(t1.x - t0.x, t1.y - t0.y),
        };
      };
      check("a nail in a free body is no fixed pivot", hingeWorldPoints(fgQuad).length === 0 && hingeWorldPoints(fgTri).length === 0 && !!fgJoint);
      const fgInfo = (name, r) => lines.push("INFO free group " + name + ": quad " + r.dq.toFixed(2) + " m, triangle " + r.dt.toFixed(2)
        + " m, joint err " + (r.err * 100).toFixed(3) + " cm, grab err " + (r.grabErr * 100).toFixed(2) + " cm, ghost " + r.ghost);
      // Ohne Schwerkraft: reines Mitziehen, beide Körper legen die Zugstrecke zurück.
      world.setGravity(V(0, 0));
      for (const b of [fgQuad, fgTri]) {
        b.setLinearVelocity(V(0, 0));
        b.setAngularVelocity(0);
      }
      const fgQ = fgDrag(fgQuad, { x: 12.6, y: 2.2 }, 0, 4);
      fgInfo("quad drag 4 m (g=0)", fgQ);
      check("dragging the free quad drags the nailed triangle along", fgQ.grabbed && fgQ.grouped && Math.abs(fgQ.dq - 4) < 0.8 && Math.abs(fgQ.dt - 4) < 0.8 && fgQ.err < 0.01);
      const fgT = fgDrag(fgTri, fgTri.getWorldCenter().clone(), 4, 0);
      fgInfo("triangle drag 4 m (g=0)", fgT);
      check("dragging the nailed triangle drags the free quad along", fgT.grabbed && fgT.grouped && Math.abs(fgT.dt - 4) < 0.8 && Math.abs(fgT.dq - 4) < 0.8 && fgT.err < 0.01);
      // Mit Schwerkraft: Griff folgt der Maus, der Partner hängt am Nagel und pendelt mit.
      world.setGravity(V(0, -24));
      for (let i = 0; i < 120; i++) step(1 / 60);
      const fgQg = fgDrag(fgQuad, fgQuad.getWorldPoint(V(-2.3, 0)).clone(), 2, 4);
      fgInfo("quad drag with gravity", fgQg);
      check("with gravity the grab follows and the triangle hangs on the nail", fgQg.grabbed && fgQg.grouped && fgQg.grabErr < 0.05 && fgQg.dq > 2 && fgQg.dt > 2 && fgQg.err < 0.01);
      for (let i = 0; i < 120; i++) step(1 / 60);
      const fgTg = fgDrag(fgTri, fgTri.getWorldCenter().clone(), -2, 4);
      fgInfo("triangle drag with gravity", fgTg);
      check("with gravity the quad hangs on the dragged triangle", fgTg.grabbed && fgTg.grouped && fgTg.grabErr < 0.05 && fgTg.dq > 2 && fgTg.dt > 2 && fgTg.err < 0.01);
      // Die ganze Gruppe ist Geist: in den Boden ziehen, loslassen, beide springen zurück.
      for (let i = 0; i < 90; i++) step(1 / 60);
      const fgQc = fgQuad.getWorldCenter().clone();
      beginDrag(fgQc.x, fgQc.y);
      let fgGhost = false;
      for (let i = 1; i <= 40; i++) {
        moveDrag(fgQc.x, fgQc.y - 2.5 * i / 40);
        step(1 / 60);
        if (playDrag.ghost) fgGhost = true;
      }
      const fgFree = playDrag.groupFree ? new Map(playDrag.groupFree) : null;
      const fgPassThrough = dragGhostBody(fgQuad) && dragGhostBody(fgTri);
      endDrag();
      const fgBack = !!fgFree && [fgQuad, fgTri].every((b) => {
        const f = fgFree.get(b);
        const p = b.getPosition();
        const v = b.getLinearVelocity();
        return f && Math.hypot(p.x - f.x, p.y - f.y) < 1e-6 && Math.hypot(v.x, v.y) < 1e-9 && Math.abs(b.getAngularVelocity()) < 1e-9
          && !overlapAtPose(b, poseOfBody(b), new Set([fgQuad, fgTri]));
      });
      check("a free nail group is a ghost as a whole and jumps back as a whole", fgPassThrough && fgGhost && fgBack);
      // Mit Bodennagel bleibt der Nagel ein Drehpunkt (unverändert).
      const fgGP = fgQuad.getWorldPoint(fgQuad.getLocalCenter());
      const fgGPin = rememberPin(fgGP.x, fgGP.y, ground, true);
      attachExistingPins(fgQuad, bodyMeta.get(fgQuad));
      check("with a ground nail the quad keeps its fixed pivot and is no free group", hingeWorldPoints(fgQuad).length === 1 && hingeWorldPoints(fgTri).length === 1 && !freeNailGroup(fgQuad) && fgGPin.joints.length === 1);
    }

    {
      // Gezeichnete Kugel (r = 1 m): Kringel in der Mitte ist ein Nagel in ihr,
      // ein langer Zug aus der Mitte greift sie, der Rand greift sofort.
      buildLevel(LEVELS["ein-klotz"]);
      world.setGravity(V(0, 0));
      const kgDraw = spawnRoller(14, 6, 1);
      const kg = kgDraw.body;
      const kgSmall = spawnRoller(20, 6, 0.4);
      check("a drawn ball r=1 has an interior, its rim grabs at once", pressKind(14, 6) === "draw" && pressKind(14.85, 6) === "drag");
      check("a small drawn ball still grabs everywhere", pressKind(20, 6) === "drag");
      const kgPinsBefore = pins.length;
      commitStroke(ring(14, 6, 0.16), "#2b2b2b");
      const kgNail = pins.find((pin) => pin.userMade && pin.body === kg);
      check("a small loop in a drawn ball is a nail in that ball", !!kgNail && pins.length === kgPinsBefore + 1 && Math.hypot(pinWorld(kgNail).x - 14, pinWorld(kgNail).y - 6) < 0.1);
      const kgTrail = [{ x: 14.2, y: 6.3 }, { x: 14.6, y: 6.6 }, { x: 15.0, y: 7.0 }];
      pointer = { id: 93, pts: kgTrail.slice(), trail: kgTrail.slice(), moved: true, grab: null, dragging: false };
      const kgAdopt = tryAdoptCenterGrab(pointer.trail);
      check("a long stroke from inside a drawn ball grabs it", kgAdopt && !!playDrag && playDrag.body === kg);
      endDrag();
      pointer = null;
      const kgLoopTrail = ring(14.2, 5.8, 0.16);
      pointer = { id: 94, pts: kgLoopTrail.slice(), trail: kgLoopTrail.slice(), moved: true, grab: null, dragging: false };
      check("a small loop in a drawn ball does not grab it", !tryAdoptCenterGrab(pointer.trail) && !playDrag);
      pointer = null;
      void kgSmall;
      world.setGravity(V(0, -24));
    }

    {
      // Seilwinde: Klotz an einem Seil vom Bodennagel (in der Luft). Rechtsrum
      // spult auf (Klotz steigt), linksrum ab (Klotz sinkt); Grenzen halten.
      buildLevel(LEVELS.sandbox);
      world.destroyBody(ball);
      ball = null;
      stars = [];
      const swPrm = winchParams();
      const swRig = (x, hw, density, top) => {
        const box = makeBox({ x, y: top - hw, hw, hh: hw, density });
        const pb = rememberPin(x, top, box, true);
        return { box, pb };
      };
      const swNail = rememberPin(14, 9, ground, true);
      const swA = swRig(14, 0.5, 1, 5.5);
      const swRopeA = spawnRope(swNail, swA.pb, [{ x: 14, y: 9 }, { x: 14, y: 7.25 }, { x: 14, y: 5.5 }]);
      for (let i = 0; i < 90; i++) step(1 / 60);
      const swLen0 = swRopeA.restLength;
      const swY0 = swA.box.getPosition().y;
      const swBeads0 = swRopeA.bodies.length;
      const swRun = (steps, rope, box) => {
        let jump = 0;
        let vmax = 0;
        let chordMax = 0;
        let prev = box.getPosition().clone();
        for (let i = 0; i < steps; i++) {
          step(1 / 60);
          const p = box.getPosition();
          jump = Math.max(jump, Math.hypot(p.x - prev.x, p.y - prev.y));
          prev = p.clone();
          const v = box.getLinearVelocity();
          vmax = Math.max(vmax, Math.hypot(v.x, v.y));
          chordMax = Math.max(chordMax, dist(pinWorld(rope.pinA), pinWorld(rope.pinB)) / rope.restLength);
        }
        return { jump, vmax, chordMax };
      };
      // Rechtsrum: Motor -1 (zweimal klicken: aus → links → rechts).
      cycleNailMotor(swNail);
      cycleNailMotor(swNail);
      const swDirOk = swNail.motor === -1;
      const swIn = swRun(180, swRopeA, swA.box);
      const swLen1 = swRopeA.restLength;
      const swY1 = swA.box.getPosition().y;
      const swExpect = swPrm.speed * 3;
      lines.push("INFO winch in 3 s: rope " + swLen0.toFixed(3) + " -> " + swLen1.toFixed(3) + " m (expected -" + swExpect.toFixed(3)
        + "), box +" + (swY1 - swY0).toFixed(3) + " m, beads " + swBeads0 + " -> " + swRopeA.bodies.length
        + ", max step " + (swIn.jump * 100).toFixed(2) + " cm, max v " + swIn.vmax.toFixed(2) + " m/s, chord " + swIn.chordMax.toFixed(4));
      check("clockwise motor nail reels the rope in and lifts the box", swDirOk && Math.abs((swLen0 - swLen1) - swExpect) < 0.05
        && Math.abs((swY1 - swY0) - (swLen0 - swLen1)) < 0.12 && swRopeA.bodies.length < swBeads0);
      check("reeling in is smooth (no jumps, rope stays tight)", swIn.jump < 0.03 && swIn.vmax < 1.0 && swIn.chordMax < 1.012);
      swRun(480, swRopeA, swA.box);
      const swMin = Math.min(swPrm.minLen, swRopeA.drawnLength);
      lines.push("INFO winch at min: rope " + swRopeA.restLength.toFixed(3) + " m, state " + (swRopeA.winch && swRopeA.winch.state) + ", box y " + swA.box.getPosition().y.toFixed(3));
      check("reeling in stops at the minimum length", Math.abs(swRopeA.restLength - swMin) < 1e-6 && swRopeA.winch && swRopeA.winch.state === "limit");
      // Linksrum: Motor +1 (aus → links).
      cycleNailMotor(swNail);
      cycleNailMotor(swNail);
      const swYm = swA.box.getPosition().y;
      const swLm = swRopeA.restLength;
      const swOut = swRun(240, swRopeA, swA.box);
      const swLo = swRopeA.restLength;
      const swYo = swA.box.getPosition().y;
      lines.push("INFO winch out 4 s: rope " + swLm.toFixed(3) + " -> " + swLo.toFixed(3) + " m, box " + (swYo - swYm).toFixed(3) + " m, beads " + swRopeA.bodies.length
        + ", max step " + (swOut.jump * 100).toFixed(2) + " cm, max v " + swOut.vmax.toFixed(2) + " m/s, chord " + swOut.chordMax.toFixed(4));
      check("counter-clockwise motor nail pays the rope out and lowers the box", swNail.motor === 1 && Math.abs((swLo - swLm) - swPrm.speed * 4) < 0.05
        && Math.abs((swYm - swYo) - (swLo - swLm)) < 0.15 && swOut.jump < 0.03 && swOut.chordMax < 1.012);
      // Höchstlänge: gezeichnete Länge so setzen, dass nur 0,15 m Spiel bleiben.
      swRopeA.drawnLength = (swRopeA.restLength + 0.15) / swPrm.maxFactor;
      swRun(60, swRopeA, swA.box);
      check("paying out stops at the maximum length", Math.abs(swRopeA.restLength - swRopeA.drawnLength * swPrm.maxFactor) < 1e-6 && swRopeA.winch.state === "limit");
      // Bleibt der Motor aus, bleibt die Länge (links → rechts → aus).
      cycleNailMotor(swNail);
      cycleNailMotor(swNail);
      const swLoff = swRopeA.restLength;
      swRun(60, swRopeA, swA.box);
      check("a stopped motor keeps the rope length", swNail.motor === 0 && Math.abs(swRopeA.restLength - swLoff) < 1e-9);

      // Zwei Seile am selben Nagel werden beide gespult; ein zu schwerer Klotz
      // bringt die Winde zum Stehen (Zug > Windenmoment / Spulenradius).
      const swNail2 = rememberPin(24, 9, ground, true);
      const swB = swRig(22.5, 0.5, 1, 5.5);
      const swC = swRig(25.5, 0.5, 1, 5.5);
      const swRopeB = spawnRope(swNail2, swB.pb, [{ x: 24, y: 9 }, { x: 22.5, y: 5.5 }]);
      const swRopeC = spawnRope(swC.pb, swNail2, [{ x: 25.5, y: 5.5 }, { x: 24, y: 9 }]);
      for (let i = 0; i < 90; i++) step(1 / 60);
      const swLb = swRopeB.restLength;
      const swLc = swRopeC.restLength;
      swNail2.motor = -1;
      applyNailMotor(swNail2);
      swRun(120, swRopeB, swB.box);
      lines.push("INFO winch two ropes 2 s: " + (swLb - swRopeB.restLength).toFixed(3) + " m and " + (swLc - swRopeC.restLength).toFixed(3) + " m shorter");
      check("several ropes on one motor nail are all reeled (either rope end)", Math.abs((swLb - swRopeB.restLength) - swPrm.speed * 2) < 0.05 && Math.abs((swLc - swRopeC.restLength) - swPrm.speed * 2) < 0.05);
      swNail2.motor = 0;
      applyNailMotor(swNail2);

      const swNail3 = rememberPin(6, 10, ground, true);
      const swH = swRig(6, 1.5, 3, 6.5);
      const swRopeH = spawnRope(swNail3, swH.pb, [{ x: 6, y: 10 }, { x: 6, y: 6.5 }]);
      for (let i = 0; i < 90; i++) step(1 / 60);
      const swLh = swRopeH.restLength;
      const swYh = swH.box.getPosition().y;
      swNail3.motor = -1;
      applyNailMotor(swNail3);
      swRun(120, swRopeH, swH.box);
      const swPull = swRopeH.winch ? swRopeH.winch.tension : 0;
      lines.push("INFO winch heavy box " + swH.box.getMass().toFixed(1) + " kg: pull " + swPull.toFixed(0) + " N > max " + swPrm.maxPull.toFixed(0) + " N, rope " + swLh.toFixed(3) + " -> " + swRopeH.restLength.toFixed(3) + ", state " + (swRopeH.winch && swRopeH.winch.state));
      check("a too heavy load stalls the winch", swRopeH.winch && swRopeH.winch.state === "stall" && Math.abs(swRopeH.restLength - swLh) < 0.02 && Math.abs(swH.box.getPosition().y - swYh) < 0.05);
      swNail3.motor = 0;
      applyNailMotor(swNail3);

      // Seil an einen schon laufenden Motornagel: kein Absturz im ersten Schritt.
      const swNail4 = rememberPin(9, 9, ground, true);
      swNail4.motor = -1;
      applyNailMotor(swNail4);
      const swD = swRig(9, 0.4, 1, 6);
      let swFreshOk = true;
      try {
        const swRopeD = spawnRope(swNail4, swD.pb, [{ x: 9, y: 9 }, { x: 9, y: 6 }]);
        const swLd = swRopeD.restLength;
        for (let i = 0; i < 30; i++) step(1 / 60);
        swFreshOk = swRopeD.restLength < swLd - 0.2;
      } catch (err) {
        swFreshOk = false;
        lines.push("INFO fresh rope on running winch: " + err);
      }
      check("a rope drawn onto a running motor nail reels at once without error", swFreshOk);
      swNail4.motor = 0;
      applyNailMotor(swNail4);

      // Zettel: gespulte Länge und gezeichnete Länge überstehen Export und Import.
      const swText = encodeSceneTextSync(captureScene());
      const swLoad = loadSceneFromTextSync(swText);
      const swRopes2 = drawings.filter((d) => d.kind === "rope");
      check("reeled rope lengths survive scene export and import", !!(swLoad && swLoad.ok) && swRopes2.some((d) => Math.abs(d.restLength - swRopeA.restLength) < 1e-6 && Math.abs(d.drawnLength - swRopeA.drawnLength) < 1e-6));
    }

    {
      // Klick-Nagel und Kringel-Motor (Sprachnachricht 2026-11-18).
      buildLevel(LEVELS["ein-klotz"]);
      world.setGravity(V(0, 0));
      cam.cx = 16;
      cam.cy = 8;
      cam.zoom = 1;
      const ckClick = (x, y, id) => {
        const sp = worldToScreen(x, y);
        onPointerDown({ button: 0, clientX: sp.x, clientY: sp.y, pointerId: id });
        onPointerUp({ button: 0, clientX: sp.x, clientY: sp.y, pointerId: id });
        pointer = null;
        endDrag();
      };
      const ckBox = makeBox({ x: 12, y: 8, hw: 1.6, hh: 0.9, color: "#3c7fd6" });
      lastTap = 0;
      const ckPins0 = pins.length;
      ckClick(12.2, 8.1, 101);
      const ckNail = pins.find((pn) => pn.body === ckBox);
      check("a single click inside a box sets a nail in it", !!ckNail && ckNail.userMade && pins.length === ckPins0 + 1 && Math.hypot(pinWorld(ckNail).x - 12.2, pinWorld(ckNail).y - 8.1) < 0.02 && ckNail.motor === 0 && !playDrag);
      lastTap = 0;
      ckClick(12.2, 8.1, 102);
      check("a second click on the nail changes nothing", pins.length === ckPins0 + 1 && pins.indexOf(ckNail) >= 0 && ckNail.motor === 0);
      lastTap = 0;
      const ckEdgeP = ckBox.getPosition();
      const ckEdgeSp = worldToScreen(ckEdgeP.x + 1.5, ckEdgeP.y);
      onPointerDown({ button: 0, clientX: ckEdgeSp.x, clientY: ckEdgeSp.y, pointerId: 103 });
      const ckEdgeGrab = !!playDrag && playDrag.body === ckBox;
      onPointerUp({ button: 0, clientX: ckEdgeSp.x, clientY: ckEdgeSp.y, pointerId: 103 });
      pointer = null;
      check("a click at the edge grabs and sets no nail", ckEdgeGrab && pins.length === ckPins0 + 1);
      lastTap = 0;
      ckClick(20, 1.2, 104);
      const ckGround = pins.find((pn) => pn.body === ground && Math.hypot(pinWorld(pn).x - 20, pinWorld(pn).y - 1.2) < 0.02);
      check("a single click on the ground sets a ground nail", !!ckGround && pins.length === ckPins0 + 2);
      lastTap = 0;
      ckClick(22, 9, 105);
      check("a click on empty paper sets nothing", pins.length === ckPins0 + 2);
      // Schneller Doppelklick auf eine leere Stelle im Klotz: genau ein Nagel.
      lastTap = 0;
      ckClick(11.3, 7.9, 106);
      ckClick(11.3, 7.9, 107);
      const ckFresh = pins.filter((pn) => Math.hypot(pinWorld(pn).x - 11.3, pinWorld(pn).y - 7.9) < 0.05);
      check("a quick double click creates exactly one nail and keeps it", ckFresh.length === 1 && pins.length === ckPins0 + 3);
      // Doppeltipp auf einen schon vorhandenen Nagel zieht ihn heraus.
      lastTap = 0;
      ckClick(20, 1.2, 108);
      ckClick(20, 1.2, 109);
      check("a double tap on an existing nail pulls it out", pins.indexOf(ckGround) < 0 && pins.length === ckPins0 + 2);
      // Kringel rechtsrum um einen Nagel mit Seil und Klotz: Winde spult auf.
      world.setGravity(V(0, -24));
      const ckWinch = rememberPin(17, 9, ground, true);
      const ckLoad = makeBox({ x: 17, y: 6, hw: 0.4, hh: 0.4 });
      const ckHook = rememberPin(17, 6.4, ckLoad, true);
      const ckRope = spawnRope(ckWinch, ckHook, [{ x: 17, y: 9 }, { x: 17, y: 6.4 }]);
      for (let i = 0; i < 60; i++) step(1 / 60);
      const ckL0 = ckRope.restLength;
      const ckY0 = ckLoad.getPosition().y;
      doodleAround(17, 9, 0.25, true, 110);
      for (let i = 0; i < 90; i++) step(1 / 60);
      lines.push("INFO doodle winch: motor " + ckWinch.motor + ", rope " + ckL0.toFixed(3) + " -> " + ckRope.restLength.toFixed(3) + " m, box +" + (ckLoad.getPosition().y - ckY0).toFixed(3) + " m");
      check("a clockwise doodle around a rope nail turns right and reels in", ckWinch.motor === -1 && ckRope.restLength < ckL0 - 0.5 && ckLoad.getPosition().y > ckY0 + 0.5);
      doodleAround(17, 9, 0.25, false, 111);
      const ckL1 = ckRope.restLength;
      for (let i = 0; i < 30; i++) step(1 / 60);
      check("an opposite doodle stops the winch", ckWinch.motor === 0 && Math.abs(ckRope.restLength - ckL1) < 1e-9);
      doodleAround(17, 9, 0.25, false, 112);
      for (let i = 0; i < 30; i++) step(1 / 60);
      check("a counter-clockwise doodle turns left and pays out", ckWinch.motor === 1 && ckRope.restLength > ckL1 + 0.1);
      ckWinch.motor = 0;
      applyNailMotor(ckWinch);
      // Ein Kringel ohne Nagel in der Nähe bleibt ein Kringel-Nagel.
      lastTap = 0;
      const ckPinsK = pins.length;
      doodleAround(25, 0.9, 0.16, true, 113);
      check("a doodle away from nails still sets a nail", pins.length === ckPinsK + 1 && pins[pins.length - 1].motor === 0);
    }

    {
      // Umlenkrolle: Seil von Last 1 über einen festen Nagel zu Last 2.
      const puG = Math.abs(world.getGravity().y) || 10;
      const puRig = (isMotor, mHeavy, mLight) => {
        buildLevel(LEVELS["ein-klotz"]);
        lastTap = 0;
        const top = 11;
        const nail = rememberPin(16, top, ground, true);
        nail.isMotor = isMotor;
        const hw = 0.25;
        const heavy = makeBox({ x: 15.4, y: 6 - hw, hw, hh: hw, density: mHeavy / (4 * hw * hw) });
        const light = makeBox({ x: 16.6, y: 6 - hw, hw, hh: hw, density: mLight / (4 * hw * hw) });
        heavy.setLinearDamping(0);
        light.setLinearDamping(0);
        const ph = rememberPin(15.4, 6, heavy, true);
        const pl = rememberPin(16.6, 6, light, true);
        const ink = [];
        for (let k = 0; k <= 10; k++) ink.push({ x: 15.4 + 0.6 * k / 10, y: 6 + (top - 6) * k / 10 });
        for (let k = 1; k <= 10; k++) ink.push({ x: 16 + 0.6 * k / 10, y: top - (top - 6) * k / 10 });
        const rope = spawnRopeVia(ph, pl, ink);
        return { nail, heavy, light, rope, pul: rope && rope.pulley };
      };
      const puRun = (rig, sec) => {
        const y0 = rig.heavy.getPosition().y;
        const l0 = rig.light.getPosition().y;
        const v0 = rig.heavy.getLinearVelocity().y;
        let err = 0;
        for (let i = 0; i < sec * 60; i++) {
          step(1 / 60);
          const f = pulleyFrame(rig.pul.joint, false);
          err = Math.max(err, f.lA + f.lB - rig.pul.L);
        }
        const dy = y0 - rig.heavy.getPosition().y;
        const up = rig.light.getPosition().y - l0;
        return { dy, up, a: (v0 - rig.heavy.getLinearVelocity().y) / sec, err };
      };
      const puFree = puRig(true, 20, 10);
      check("a rope drawn over a fixed nail runs over it as a pulley", !!puFree.pul && pulleyList().length === 1 && puFree.pul.pin === puFree.nail && !puFree.rope.chordJoint);
      const puFreeR = puRun(puFree, 0.5);
      lines.push("INFO pulley (motor nail, stop) 20 vs 10 kg: a = " + puFreeR.a.toFixed(2) + " m/s^2 (g/3 = " + (puG / 3).toFixed(2) + "), light +" + puFreeR.up.toFixed(3) + " m, overstretch " + puFreeR.err.toFixed(4) + " m");
      check("over a stopped motor nail 2:1 accelerates at about g/3", Math.abs(puFreeR.a - puG / 3) < 0.12 * puG / 3 && puFreeR.up > 0.5 && puFreeR.err < 0.03);

      const puNail = puRig(false, 20, 10);
      for (let i = 0; i < 20; i++) step(1 / 60);
      const puNailL0 = pulleyFrame(puNail.pul.joint, false).lA;
      const puNailR = puRun(puNail, 0.5);
      for (let i = 0; i < 60; i++) step(1 / 60);
      const puNailSlip = pulleyFrame(puNail.pul.joint, false).lA - puNailL0;
      lines.push("INFO pulley plain nail 2:1 slip after 1.5 s: " + puNailSlip.toFixed(4) + " m");
      lines.push("INFO pulley (plain nail, mu " + pulleyMu(puNail.nail).toFixed(2) + ") 20 vs 10 kg: heavy down " + puNailR.dy.toFixed(3) + " m in 0.5 s");
      check("over a plain nail 2:1 is held by rope friction", Math.abs(puNailR.dy) < 0.03 && Math.abs(puNailSlip) < 0.03);

      const puNail3 = puRig(false, 30, 10);
      const puNail3R = puRun(puNail3, 0.5);
      const puE = Math.exp(pulleyMu(puNail3.nail) * (puNail3.pul.wrap || Math.PI));
      const puWant3 = puG * (3 - puE) / (3 + puE);
      lines.push("INFO pulley (plain nail) 30 vs 10 kg: a = " + puNail3R.a.toFixed(2) + " m/s^2 (capstan " + puWant3.toFixed(2) + ", frictionless " + (puG / 2).toFixed(2) + ")");
      check("over a plain nail 3:1 slides clearly slower than frictionless", puNail3R.a > 0.3 && puNail3R.a < 0.4 * puG / 2 && Math.abs(puNail3R.a - puWant3) < 0.35 * puWant3 + 0.3);

      // Laufender Motornagel als Treibscheibe: das Seil läuft mit Windentempo.
      const puDrive = puRig(true, 4, 2);
      puDrive.nail.motor = -1;
      applyNailMotor(puDrive.nail);
      const puDf0 = pulleyFrame(puDrive.pul.joint, false);
      for (let i = 0; i < 60; i++) step(1 / 60);
      const puDf1 = pulleyFrame(puDrive.pul.joint, false);
      const puDh = puDf0.lA - puDf1.lA; // > 0: Seite der schweren Last kürzer
      const puDl = puDf0.lB - puDf1.lB;
      const puSpeed = winchParams().speed;
      lines.push("INFO pulley drive (motor right): heavy side " + (-puDh).toFixed(3) + " m, light side " + (-puDl).toFixed(3) + " m in 1 s (winch speed " + puSpeed.toFixed(2) + " m/s), state " + puDrive.pul.state);
      check("a running motor nail drives the rope over it at winch speed", puDrive.pul.state === "drive" && Math.abs(Math.abs(puDh) - puSpeed) < 0.25 * puSpeed && Math.abs(puDh + puDl) < 0.1);
      puDrive.nail.motor = 0;
      applyNailMotor(puDrive.nail);
      const puStopL = pulleyFrame(puDrive.pul.joint, false).lA;
      for (let i = 0; i < 20; i++) step(1 / 60);
      const puAfter = pulleyFrame(puDrive.pul.joint, false).lA - puStopL;
      check("stopping the motor turns it back into a free pulley", puDrive.pul.state === "slide" && puAfter > 0.1);

      // Zettel: Motornagel und Umlenkung kommen wieder.
      const puRig2 = puRig(true, 20, 10);
      for (let i = 0; i < 20; i++) step(1 / 60);
      const puText = encodeSceneTextSync(captureScene());
      const puLoad = loadSceneFromTextSync(puText);
      const puPul = pulleyList();
      const puNailBack = puPul[0] && puPul[0].pin;
      check("a Zettel keeps the pulley and the motor nail", puLoad && puLoad.ok !== false && puPul.length === 1 && puNailBack && puNailBack.isMotor && puNailBack.motor === 0 && Math.abs(puPul[0].L - puRig2.pul.L) < 1e-6);
      let puBackErr = 0;
      const puBackY = puPul[0] ? puPul[0].pinA.body.getPosition().y : 0;
      for (let i = 0; i < 15; i++) {
        step(1 / 60);
        const f = pulleyFrame(puPul[0].joint, false);
        puBackErr = Math.max(puBackErr, f.lA + f.lB - puPul[0].L);
      }
      check("a reloaded pulley still runs", puPul[0] && puBackErr < 0.03 && puPul[0].pinA.body.getPosition().y < puBackY - 0.1);

      // Geste: Seil vom Nagel über einen Bodennagel zu einem Klotz.
      buildLevel(LEVELS["ein-klotz"]);
      lastTap = 0;
      const pgNail = rememberPin(16, 10, ground, true);
      const pgA = makeBox({ x: 12, y: 5, hw: 0.4, hh: 0.4, density: 2 });
      const pgB = makeBox({ x: 20, y: 5, hw: 0.4, hh: 0.4, density: 2 });
      const pgPa = rememberPin(12, 5.4, pgA, true);
      const pgPb = rememberPin(20, 5.4, pgB, true);
      const pgInk = [];
      for (let k = 0; k <= 16; k++) pgInk.push({ x: 12 + 4 * k / 16, y: 5.4 + 4.6 * k / 16 });
      for (let k = 1; k <= 16; k++) pgInk.push({ x: 16 + 4 * k / 16, y: 10 - 4.6 * k / 16 });
      const pgMade = commitStroke(pgInk, MAT.hemp);
      check("drawing a rope from nail over a ground nail to a nail makes a pulley", pulleyList().length === 1 && pulleyList()[0].pin === pgNail && pulleyList()[0].pinA === pgPa && pulleyList()[0].pinB === pgPb);
      for (let i = 0; i < 30; i++) step(1 / 60);
      const pgDead = pulleyList()[0];
      if (pgDead) pullPin(pgNail);
      for (let i = 0; i < 10; i++) step(1 / 60);
      check("pulling the pulley nail turns the sides into plain ropes", pgDead && pgDead.dead && pulleyList().length === 0 && pgDead.sideA.chordJoint && pgDead.sideB.chordJoint && pgMade !== undefined);
    }

    {
      // Seil von Turm zu Turm über die Umlenkrolle auf dem mittleren Turm.
      // Beide Enden sind fest. Das Seil darf nicht auf dem Turm liegen.
      buildLevel(LEVELS["ein-klotz"]);
      const twPost = (x) => {
        const body = makeBox({ x, y: 6.5, hw: 1.15, hh: 5.05 });
        body.setStatic();
        return body;
      };
      const twL = twPost(8);
      const twM = twPost(12.4);
      const twR = twPost(19);
      const twPL = rememberPin(8, 11.2, twL, true);
      const twPM = rememberPin(12.4, 11.3, twM, true);
      twPM.isMotor = true;
      twPM.motor = 0;
      const twPR = rememberPin(19, 11.4, twR, true);
      const twInk = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        twInk.push({ x: 8 + 11 * t, y: 11.2 + 0.2 * t });
      }
      const twRope = spawnRopeVia(twPL, twPR, twInk);
      const twPul = twRope && twRope.pulley;
      check("a rope between two fixed towers runs over the middle pulley", !!twPul && twPul.pin === twPM && !twRope.chordJoint);
      for (let i = 0; i < 90; i++) step(i % 2 ? 1 / 50 : 1 / 70);
      let twTouch = 0;
      let twOn = 0;
      let twInside = false;
      const twSides = twPul ? [twPul.sideA, twPul.sideB] : [];
      for (const side of twSides) {
        for (const bead of side.bodies || []) {
          const p = bead.getPosition();
          if (p.x > 11.3 && p.x < 13.5 && p.y < 11.45) twInside = true;
        }
      }
      for (let c = world.getContactList(); c; c = c.getNext()) {
        if (!c.isTouching()) continue;
        const ba = c.getFixtureA().getBody();
        const bb = c.getFixtureB().getBody();
        const ma = bodyMeta.get(ba);
        const mb = bodyMeta.get(bb);
        const ropeBody = ma && ma.kind === "rope" ? ba : (mb && mb.kind === "rope" ? bb : null);
        const other = ropeBody === ba ? bb : ba;
        if (!ropeBody || other !== twM) continue;
        twTouch += 1;
        if (c.isEnabled()) twOn += 1;
      }
      check("the rope falls through the middle tower and stays on the pulley", twInside && twTouch > 0 && twOn === 0 && pins.indexOf(twPM) >= 0);
    }

    {
      // Feste Enden: ein Gewicht auf einer Seite zieht die andere stramm.
      // Radieren einer Hälfte löscht das ganze Seil.
      const psPost = (x) => {
        const body = makeBox({ x, y: 5.9, hw: 0.3, hh: 4.5 });
        body.setStatic();
        return body;
      };
      const psBuild = (motor) => {
        buildLevel(LEVELS["ein-klotz"]);
        if (ball) {
          world.destroyBody(ball);
          ball = null;
        }
        const left = psPost(12);
        const mid = psPost(18);
        const right = psPost(24);
        const pinL = rememberPin(12, 10, left, true);
        const pinM = rememberPin(18, 10, mid, true);
        pinM.isMotor = !!motor;
        pinM.motor = 0;
        const pinR = rememberPin(24, 10, right, true);
        const ink = [
          { x: 12, y: 10 },
          { x: 15, y: 6.2 },
          { x: 18, y: 10 },
          { x: 21, y: 6.2 },
          { x: 24, y: 10 },
        ];
        const rope = spawnRopeVia(pinL, pinR, ink);
        const pul = rope && rope.pulley;
        const weight = makeBox({ x: 15, y: 7.35, hw: 0.55, hh: 0.4, density: 10 });
        return { pul, weight, pinM };
      };
      const psStep = (n) => {
        for (let i = 0; i < n; i++) step(i % 2 ? 1 / 50 : 1 / 70);
      };
      const psFree = psBuild(true);
      const psPul = psFree.pul;
      const psA0 = psPul ? psPul.sideA.restLength : 0;
      const psB0 = psPul ? psPul.sideB.restLength : 0;
      const psL0 = psPul ? psPul.L : 0;
      check("a slack rope over a fixed motor nail is one pulley", !!psPul && psPul.pin === psFree.pinM && !psPul.sideA.chordJoint && !psPul.sideB.chordJoint);
      psStep(150);
      const psF = psPul && psPul.joint ? pulleyFrame(psPul.joint, false) : { lA: 0, lB: 0 };
      const psA1 = psPul ? psPul.sideA.restLength : 0;
      const psB1 = psPul ? psPul.sideB.restLength : 0;
      lines.push("INFO fixed pulley load A " + (psPul ? psPul.loadA : 0).toFixed(1) + " B " + (psPul ? psPul.loadB : 0).toFixed(1)
        + " len " + psA0.toFixed(2) + "+" + psB0.toFixed(2) + " -> " + psA1.toFixed(2) + "+" + psB1.toFixed(2)
        + " straight " + psF.lB.toFixed(2) + " box " + psFree.weight.getPosition().y.toFixed(2)
        + " wrap " + ((psPul && psPul.wrap) || 0).toFixed(2));
      check("a weight on the left span pulls the right span taut",
        psB1 < psF.lB + 0.55 && psA1 > psA0 + 1.5 && Math.abs(psA1 + psB1 - psL0) < 0.35 && psFree.weight.getPosition().y > 2);
      const psBead = psPul && psPul.sideB.bodies[Math.floor(psPul.sideB.bodies.length / 2)];
      const psAt = psBead ? psBead.getPosition() : { x: 0, y: 0 };
      const psRopesBefore = drawings.filter((d) => d.kind === "rope").length;
      eraseAt(psAt.x, psAt.y);
      check("erasing one span of a pulley rope removes the whole rope",
        psRopesBefore >= 2 && drawings.filter((d) => d.kind === "rope").length === 0 && pulleyList().length === 0
        && drawings.some((d) => d.body === psFree.weight));

      const psNail = psBuild(false);
      const psN0 = psNail.pul ? psNail.pul.sideB.restLength : 0;
      psStep(120);
      const psNf = psNail.pul && psNail.pul.joint ? pulleyFrame(psNail.pul.joint, false) : { lB: 0 };
      const psN1 = psNail.pul ? psNail.pul.sideB.restLength : 0;
      const psNa = psNail.pul ? psNail.pul.sideA.restLength : 0;
      lines.push("INFO plain-nail pulley len B " + psN0.toFixed(2) + " -> " + psN1.toFixed(2) + " straight " + psNf.lB.toFixed(2)
        + " load " + (psNail.pul ? psNail.pul.loadA : 0).toFixed(1) + "/" + (psNail.pul ? psNail.pul.loadB : 0).toFixed(1));
      check("a weight on one span of a plain nail still pulls the other span taut",
        !!psNail.pul && !psNail.pinM.isMotor && psN1 < psNf.lB + 0.55 && psNa > psN0 + 1.5 && Math.abs(psNa + psN1 - psNail.pul.L) < 0.35);
    }

    {
      // Kugelwaage: zwei ungleiche Kugeln auf einer festen Umlenkrolle
      // kommen zur Ruhe. Die schwerere Seite wird länger, beide behalten
      // Durchhang, die Summe der Ruhelängen bleibt die gezeichnete Länge.
      buildLevel(LEVELS.sandbox);
      if (ball) {
        world.destroyBody(ball);
        ball = null;
      }
      stars = [];
      const kwPost = (x) => {
        const body = makeBox({ x, y: 6, hw: 0.35, hh: 4 });
        body.setStatic();
        return body;
      };
      const kwL = kwPost(8);
      const kwM = kwPost(16);
      const kwR = kwPost(24);
      const kwPL = rememberPin(8, 10.2, kwL, true);
      const kwPM = rememberPin(16, 10.2, kwM, true);
      kwPM.isMotor = true;
      kwPM.motor = 0;
      const kwPR = rememberPin(24, 10.2, kwR, true);
      const kwRope = spawnRopeVia(kwPL, kwPR, [
        { x: 8, y: 10.2 }, { x: 12, y: 7 }, { x: 16, y: 10.2 }, { x: 20, y: 7 }, { x: 24, y: 10.2 },
      ]);
      const kwPul = kwRope && kwRope.pulley;
      const kwHeavy = spawnRoller(12, 9.2, 0.7);
      const kwLight = spawnRoller(20, 9.2, 0.45);
      const kwL0 = kwPul ? kwPul.L : 0;
      const kwA0 = kwPul ? kwPul.sideA.restLength : 0;
      const kwB0 = kwPul ? kwPul.sideB.restLength : 0;
      for (let i = 0; i < 360; i++) step(i % 2 ? 1 / 50 : 1 / 70);
      const kwF = kwPul && kwPul.joint ? pulleyFrame(kwPul.joint, false) : { lA: 0, lB: 0 };
      const kwA1 = kwPul ? kwPul.sideA.restLength : 0;
      const kwB1 = kwPul ? kwPul.sideB.restLength : 0;
      const kwHv = kwHeavy.body.getLinearVelocity();
      const kwLv = kwLight.body.getLinearVelocity();
      const kwHs = Math.hypot(kwHv.x, kwHv.y);
      const kwLs = Math.hypot(kwLv.x, kwLv.y);
      lines.push("INFO kugelwaage len " + kwA0.toFixed(2) + "+" + kwB0.toFixed(2)
        + " -> " + kwA1.toFixed(2) + "+" + kwB1.toFixed(2)
        + " str " + kwF.lA.toFixed(2) + "+" + kwF.lB.toFixed(2)
        + " y " + kwHeavy.body.getPosition().y.toFixed(2) + "/" + kwLight.body.getPosition().y.toFixed(2)
        + " v " + kwHs.toFixed(2) + "/" + kwLs.toFixed(2));
      check("two unequal balls on a pulley come to rest",
        !!kwPul && kwPM.isMotor && !kwPM.motor
        && kwHs < 0.5 && kwLs < 0.5
        && kwA1 > kwB1 + 0.15
        && kwA1 > kwF.lA + 0.4 && kwB1 > kwF.lB + 0.4
        && Math.abs(kwA1 + kwB1 - kwL0) < 0.35
        && kwHeavy.body.getPosition().y < kwLight.body.getPosition().y - 0.05);
    }

    {
      // Drei Kringel-Kugeln in einem durchhängenden Seil. Ohne Bullet
      // wachsen sie ineinander (gemessen etwa 0,5 m): die Perlen sind
      // Bullets, der Durchschuss-Löser schaltet den Kontakt ab.
      buildLevel(LEVELS.sandbox);
      world.destroyBody(ball);
      ball = null;
      stars = [];
      const sbA = makeBox({ x: 8, y: 5.8, hw: 0.35, hh: 2.2 });
      const sbB = makeBox({ x: 18, y: 5.8, hw: 0.35, hh: 2.2 });
      sbA.setStatic();
      sbB.setStatic();
      const sbPa = rememberPin(8, 8, sbA, true);
      const sbPb = rememberPin(18, 8, sbB, true);
      const sbRope = spawnRope(sbPa, sbPb, [
        { x: 8, y: 8 }, { x: 13, y: 4.6 }, { x: 18, y: 8 },
      ]);
      for (let i = 0; i < 30; i++) step(1 / 60);
      const sbDraws = [
        spawnBlob(12.35, 6.5, 0.26),
        spawnBlob(13.0, 6.7, 0.28),
        spawnBlob(13.65, 6.5, 0.27),
      ];
      const sbRoll = spawnRoller(11.3, 6.9, 0.45);
      const sbAll = sbDraws.concat([sbRoll]);
      function sbRadius(draw) {
        if (draw.r) return draw.r;
        const c = draw.meta && draw.meta.circles && draw.meta.circles[0];
        return c ? c.r : 0;
      }
      function sbGap(list) {
        let worst = 99;
        let low = 99;
        for (let i = 0; i < list.length; i++) {
          const a = list[i].body.getPosition();
          const ra = sbRadius(list[i]);
          if (a.y < low) low = a.y;
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j].body.getPosition();
            const g = Math.hypot(a.x - b.x, a.y - b.y) - ra - sbRadius(list[j]);
            if (g < worst) worst = g;
          }
        }
        return { worst, low };
      }
      check("a small drawn ball is a bullet like a large one", sbDraws.every((d) => d && d.body.isBullet()) && sbRoll.body.isBullet());
      let sbWorst = 99;
      for (let i = 0; i < 300; i++) {
        step(1 / 60);
        if (i >= 90) sbWorst = Math.min(sbWorst, sbGap(sbAll).worst);
      }
      const sbUneven = [0.008, 0.021, 0.013, 0.019, 0.011];
      for (let i = 0; i < sbUneven.length * 3; i++) {
        step(sbUneven[i % sbUneven.length]);
        sbWorst = Math.min(sbWorst, sbGap(sbAll).worst);
      }
      const sbEnd = sbGap(sbAll);
      lines.push("INFO small balls in rope gap " + sbEnd.worst.toFixed(3) + " worst " + sbWorst.toFixed(3) + " low " + sbEnd.low.toFixed(2) + " roll " + sbRoll.body.getPosition().y.toFixed(2));
      check("small balls in a rope do not sink into each other", !!sbRope && sbEnd.worst > -0.05 && sbWorst > -0.08 && sbEnd.low > 3.2);

      const sbText = encodeSceneTextSync(captureScene());
      const sbDec = decodeSceneTextSync(sbText);
      for (const rec of (sbDec.data && sbDec.data.bodies) || []) {
        if (rec.drawKind === "blob") rec.bullet = false;
      }
      const sbLoad = loadSceneFromTextSync(JSON.stringify(sbDec.data));
      const sbBack = drawings.filter((d) => d.kind === "blob" || d.kind === "roller");
      check("an old zettel still makes small balls bullets", !!(sbDec && sbDec.ok && sbLoad && sbLoad.ok !== false && sbBack.filter((d) => d.kind === "blob").length === 3 && sbBack.every((d) => d.body.isBullet())));
      let sbBackWorst = 99;
      for (let i = 0; i < 120; i++) {
        step(1 / 60);
        sbBackWorst = Math.min(sbBackWorst, sbGap(sbBack).worst);
      }
      const sbBackEnd = sbGap(sbBack);
      lines.push("INFO reloaded small balls gap " + sbBackEnd.worst.toFixed(3) + " worst " + sbBackWorst.toFixed(3) + " low " + sbBackEnd.low.toFixed(2));
      check("reloaded small balls stay apart in the rope", sbBackWorst > -0.08 && sbBackEnd.worst > -0.05 && sbBackEnd.low > 3.2);
    }

    mountTunePanel();
    check("tune panel has scene copy and load controls", !!document.getElementById("tune-scene-copy") && !!document.getElementById("tune-scene-load") && !!document.getElementById("tune-scene-text"));
    const scenePanel = document.getElementById("tune-panel");
    if (scenePanel && scenePanel.parentNode) scenePanel.parentNode.removeChild(scenePanel);
  } catch (err) {
    lines.push("FAIL exception " + (err && err.stack ? err.stack : err));
  }
  const fail = lines.some((line) => line.startsWith("FAIL"));
  testlog.style.display = "block";
  testlog.textContent = lines.join("\n");
  document.title = fail ? "FAIL" : "PASS";
}



