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
  if (params.get("test") === "1") runTests();
  else if (params.get("shot")) {
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
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (pointer && pointer.grab && !pointer.dragging) {
      const at = pointer.wx == null ? pointer.grab : { x: pointer.wx, y: pointer.wy };
      engageGrab(at);
    }
    if (mode === "play") advanceFixed(playClock, dt, step);
    else if (mode === "map") advanceFixed(mapClock, dt, mapDemo === "trebuchet" ? stepTrebuchet : stepCradle);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

