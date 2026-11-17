// Planck skaliert den gespeicherten Kontakt- und Gelenkimpuls beim Warmstart mit
// dtRatio = dt / dt_vorher. Früher wurde der Rest eines Frames als eigener
// Mini-Schritt gerechnet (bei 17 ms zum Beispiel 16.67 ms + 0.3 ms). Der volle
// Schritt danach hat dann dtRatio um 50 bis über 1000 und multipliziert den
// Aufprallimpuls aus dem Mini-Schritt entsprechend. Deshalb rechnet die Physik
// nur in festen Schritten, der Rest wartet auf den nächsten Frame.
const FIXED_DT = 1 / 60;
const playClock = { acc: 0 };
const mapClock = { acc: 0 };

function advanceFixed(clock, dt, stepFn) {
  clock.acc = Math.min(clock.acc + Math.max(0, dt), FIXED_DT * 3);
  let n = 0;
  while (clock.acc >= FIXED_DT - 1e-7) {
    stepFn(FIXED_DT);
    clock.acc -= FIXED_DT;
    n++;
  }
  if (clock.acc < 0) clock.acc = 0;
  return n;
}

function boot() {
  makePaper();
  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", () => {
    pointer = null;
    endDrag();
    endCradleDrag();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.shiftKey) cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.55, 2.4);
  }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (e.target === namebox) return;
    if (e.key === "r" || e.key === "R") {
      if (mode === "play" && levelDef) buildLevel(levelDef);
    } else if (e.key === "m" || e.key === "M" || e.key === "Escape") {
      if (returnMode === "editor" && editorDoc && mode === "play") {
        endDrag();
        mode = "editor";
        world = null;
        namebox.style.display = "block";
        returnMode = "map";
      } else showMap();
    } else if (e.key === "h" || e.key === "H") mode = "help";
    else if (e.key === "0") resetCam();
  });
  const params = new URLSearchParams(location.search);
  if (params.get("tune") === "1" && params.get("test") !== "1") {
    tuneOn = true;
    loadTuneVals();
    mountTunePanel();
  }
  const sceneText = params.get("scene") || window.__CRAYON_SCENE || null;
  const wantPause = params.get("pause") === "1" || !!window.__CRAYON_SCENE_PAUSE;
  const startLoop = () => {
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (pointer && pointer.grab && !pointer.dragging) {
        const at = pointer.wx == null ? pointer.grab : { x: pointer.wx, y: pointer.wy };
        engageGrab(at);
      }
      if (mode === "play" && !scenePaused) advanceFixed(playClock, dt, step);
      else if (mode === "map") advanceFixed(mapClock, dt, mapDemo === "trebuchet" ? stepTrebuchet : stepCradle);
      render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };
  if (params.get("test") === "1") {
    runTests();
    startLoop();
  } else if (sceneText) {
    Promise.resolve(loadSceneFromText(sceneText, { pause: wantPause })).then((res) => {
      if (!res || !res.ok) {
        showMap();
        showSceneMessage((res && res.error) || "Zettel konnte nicht geladen werden.", true);
      }
      startLoop();
    });
  } else if (params.get("shot")) {
    const id = params.get("shot");
    if (id === "feier") {
      buildLevel(LEVELS["ein-klotz"]);
      for (const star of stars) star.got = true;
    } else if (id === "material") {
      buildLevel(LEVELS["ein-klotz"]);
      const ring = (cx, cy, r, n) => {
        let pts = [];
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        return pts;
      };
      commitStroke([
        { x: 12.0, y: 1.3 }, { x: 16.2, y: 1.3 }, { x: 16.2, y: 3.5 }, { x: 12.0, y: 3.5 }, { x: 12.0, y: 1.3 },
      ]);
      commitStroke([
        { x: 19.6, y: 1.3 }, { x: 20.3, y: 1.3 }, { x: 20.3, y: 7.0 }, { x: 19.6, y: 7.0 }, { x: 19.6, y: 1.3 },
      ]);
      commitStroke([
        { x: 27.1, y: 1.3 }, { x: 27.8, y: 1.3 }, { x: 27.8, y: 7.0 }, { x: 27.1, y: 7.0 }, { x: 27.1, y: 1.3 },
      ]);
      for (let i = 0; i < 45; i++) step(1 / 60);
      commitStroke(ring(19.95, 7.08, 0.16, 10));
      commitStroke(ring(27.45, 7.08, 0.16, 10));
      const matPins = pins.filter((p) => p.userMade);
      if (matPins.length >= 2) {
        spawnRope(matPins[0], matPins[1], [
          { x: 19.95, y: 7.08 }, { x: 23.7, y: 4.8 }, { x: 27.45, y: 7.08 },
        ]);
      }
      commitStroke(ring(6.2, 3.6, 1.05, 28));
      commitStroke([{ x: 8.8, y: 1.38 }, { x: 11.0, y: 3.3 }]);
      for (let i = 0; i < 100; i++) step(1 / 60);
    } else if (id === "vierecke") {
      buildLevel(LEVELS["ein-klotz"]);
      const rotPts = (cx, cy, rot, local) => {
        const a = rot * Math.PI / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const pts = local.map((p) => ({ x: cx + p.x * ca - p.y * sa, y: cy + p.x * sa + p.y * ca }));
        pts.push({ x: pts[0].x, y: pts[0].y });
        return pts;
      };
      const forms = [
        { x: 5.4, y: 8.2, rot: 12, name: "Rechteck", local: [{ x: -1.5, y: -0.9 }, { x: 1.5, y: -0.9 }, { x: 1.5, y: 0.9 }, { x: -1.5, y: 0.9 }] },
        { x: 11.6, y: 8.2, rot: 8, name: "Rampe", local: [{ x: -1.55, y: -0.75 }, { x: 1.55, y: -0.75 }, { x: 0.35, y: 0.75 }, { x: -1.55, y: 0.75 }] },
        { x: 18.2, y: 8.2, rot: 18, name: "Parallelogramm", local: [{ x: -1.55, y: -0.7 }, { x: 1.15, y: -0.7 }, { x: 1.65, y: 0.7 }, { x: -1.05, y: 0.7 }] },
        { x: 25.0, y: 8.2, rot: -10, name: "Trapez", local: [{ x: -1.8, y: -0.7 }, { x: 1.8, y: -0.7 }, { x: 1.05, y: 0.7 }, { x: -1.05, y: 0.7 }] },
      ];
      shotCaptions = [];
      for (const f of forms) {
        commitStroke(rotPts(f.x, f.y, f.rot, f.local));
        shotCaptions.push({ x: f.x, y: f.y - 1.7, text: f.name });
      }
      for (let i = 0; i < 2; i++) step(1 / 60);
    } else if (id === "rauten") {
      buildLevel(LEVELS["ein-klotz"]);
      const rautenSet = [
        [6.5, 8.2, 1.15, 1.15, 0],
        [11.2, 8.2, 1.15, 1.15, 30],
        [16.0, 8.2, 1.15, 1.15, 45],
        [21.0, 8.2, 1.15, 1.15, 60],
        [26.0, 8.4, 1.35, 0.95, 25],
      ];
      for (const [cx, cy, hw, hh, rot] of rautenSet) {
        const a = rot * Math.PI / 180;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const pts = [
          { x: cx + (-hw) * ca - (-hh) * sa, y: cy + (-hw) * sa + (-hh) * ca },
          { x: cx + (hw) * ca - (-hh) * sa, y: cy + (hw) * sa + (-hh) * ca },
          { x: cx + (hw) * ca - (hh) * sa, y: cy + (hw) * sa + (hh) * ca },
          { x: cx + (-hw) * ca - (hh) * sa, y: cy + (-hw) * sa + (hh) * ca },
        ];
        pts.push({ x: pts[0].x, y: pts[0].y });
        commitStroke(pts);
      }
      for (let i = 0; i < 2; i++) step(1 / 60);
    } else if (id === "nagel-seil") {
      buildLevel(LEVELS["ein-klotz"]);
      if (ball) {
        ball.setTransform(V(3.2, 2.2), 0);
        ball.setLinearVelocity(V(0, 0));
        ball.setAngularVelocity(0);
      }
      rememberPin(9.0, 4.4, ground, true);
      rememberPin(15.2, 4.4, ground, true);
      commitStroke([
        { x: 7.4, y: 3.7 }, { x: 16.8, y: 3.7 }, { x: 16.8, y: 5.1 }, { x: 7.4, y: 5.1 }, { x: 7.4, y: 3.7 },
      ]);
      rememberPin(21.2, 8.2, ground, true);
      const hangPin = pins[pins.length - 1];
      spawnRope(hangPin, null, [
        { x: 21.2, y: 8.2 }, { x: 24.0, y: 7.4 }, { x: 26.4, y: 5.2 }, { x: 27.2, y: 3.0 },
      ]);
      for (let i = 0; i < 90; i++) step(1 / 60);
    } else if (id === "geist" || id === "windrad") {
      // Ebenen per Nagel: Säule verankert, Nagel im Kopf, Brett davor.
      buildLevel(LEVELS["ein-klotz"]);
      if (ball) ball.setTransform(V(3.2, 1.66), 0);
      const col = makeBox({ x: 12, y: 4.35, hw: 0.5, hh: 3.0 });
      for (let i = 0; i < 20; i++) step(1 / 60);
      anchorBody(drawings.find((d) => d.body === col), ground, { x: 12, y: 1.3 }, { x: 12, y: 1.8 });
      rememberPin(12, 6.6, col, true);
      const board = makeBox({ x: 12, y: 6.6, hw: 2.6, hh: 0.22, color: MAT.wood });
      attachExistingPins(board, bodyMeta.get(board));
      if (id === "windrad") {
        // Zwei Würfel an Nägeln in den Brettenden: nächste Ebene davor.
        board.setTransform(board.getPosition(), 0.3);
        for (const sx of [-2.1, 2.1]) {
          const at = board.getWorldPoint(V(sx, 0));
          rememberPin(at.x, at.y, board, true);
          const cube = makeBox({ x: at.x, y: at.y - 0.3, hw: 0.5, hh: 0.5, color: MAT.wood });
          attachExistingPins(cube, bodyMeta.get(cube));
        }
        for (let i = 0; i < 60; i++) step(1 / 60);
        cam.cx = 12;
        cam.cy = 5.2;
        cam.zoom = 1.9;
      } else {
        makeBox({ x: 19, y: 2.1, hw: 0.8, hh: 0.8 });
        for (let i = 0; i < 30; i++) step(1 / 60);
        const held = makeBox({ x: 23.5, y: 2.1, hw: 0.7, hh: 0.7, color: MAT.wood });
        for (let i = 0; i < 20; i++) step(1 / 60);
        beginDrag(23.5, 2.1);
        for (let i = 1; i <= 40; i++) {
          moveDrag(23.5 + (19.6 - 23.5) * i / 40, 2.1 + (2.5 - 2.1) * i / 40);
          step(1 / 60);
        }
        void held;
        cam.cx = 17;
        cam.cy = 4.2;
        cam.zoom = 1.7;
      }
    } else if (id === "seilwinde") {
      // Seilwinde: links rechtsrum (spult auf), rechts linksrum (spult ab).
      buildLevel(LEVELS.sandbox);
      if (ball) ball.setTransform(V(4, 1.66), 0);
      const rig = (x, motor) => {
        const nail = rememberPin(x, 9, ground, true);
        const box = makeBox({ x, y: 5.0, hw: 0.5, hh: 0.5, color: MAT.wood });
        const hook = rememberPin(x, 5.5, box, true);
        spawnRope(nail, hook, [{ x, y: 9 }, { x, y: 7.25 }, { x, y: 5.5 }]);
        nail.motor = motor;
        applyNailMotor(nail);
      };
      rig(12, -1);
      rig(20, 1);
      for (let i = 0; i < 150; i++) step(1 / 60);
      shotCaptions = [
        { x: 12, y: 10.2, text: "rechtsrum: spult auf" },
        { x: 20, y: 10.2, text: "linksrum: spult ab" },
      ];
      cam.cx = 16;
      cam.cy = 6.2;
      cam.zoom = 1.6;
    } else if (id === "trebuchet" || id === "trebuchet-wurf") {
      showMap();
      setMapDemo("trebuchet");
      releaseTrebuchet();
      for (let i = 0; i < 240 && treb && treb.hooked; i++) stepTrebuchet(1 / 60);
      for (let i = 0; i < 36; i++) stepTrebuchet(1 / 60);
      if (treb) treb.frozen = true;
    } else if (id === "trebuchet-schale") {
      showMap();
      setMapDemo("trebuchet");
      if (treb) treb.frozen = true;
    } else if (LEVELS[id]) buildLevel(LEVELS[id]);
    else showMap();
  } else showMap();
  if (params.get("test") !== "1" && !sceneText) startLoop();
}

