function editorClick(worldPt) {
  const doc = editorDoc;
  if (editorTool === "ball") doc.ball = [worldPt.x, worldPt.y];
  else if (editorTool === "star") doc.stars.push([worldPt.x, worldPt.y]);
  else if (editorTool === "pin") doc.pins.push([worldPt.x, worldPt.y]);
  else if (editorTool === "erase") {
    const near = (arr, map) => {
      let bi = -1;
      let bd = 0.7;
      arr.forEach((item, i) => {
        const p = map(item);
        const d = Math.hypot(p[0] - worldPt.x, p[1] - worldPt.y);
        if (d < bd) { bd = d; bi = i; }
      });
      if (bi >= 0) arr.splice(bi, 1);
      return bi >= 0;
    };
    if (near(doc.stars, (s) => s)) return;
    if (near(doc.pins, (s) => s)) return;
    if (near(doc.rockets, (s) => [s.x, s.y])) return;
    for (let i = doc.strokes.length - 1; i >= 0; i--) {
      const pts = doc.strokes[i].points;
      for (const p of pts) {
        if (Math.hypot(p[0] - worldPt.x, p[1] - worldPt.y) < 0.45) {
          doc.strokes.splice(i, 1);
          return;
        }
      }
    }
  }
}

function onPointerDown(e) {
  if (e.button === 1) {
    pointer = { pan: true, x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy };
    return;
  }
  const hit = ui.find((b) => e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h);
  if (hit) {
    pointer = { ui: true };
    hit.onClick();
    return;
  }
  if (e.button === 2) {
    const w = screenToWorld(e.clientX, e.clientY);
    if (mode === "play" && !releaseAnchorAt(w.x, w.y)) eraseAt(w.x, w.y);
    if (mode === "editor") editorClick(w);
    return;
  }
  if (mode === "help") return;
  if (mode === "map") {
    const tog = mapDemoToggleAt(e.clientX, e.clientY);
    if (tog) {
      setMapDemo(tog);
      pointer = { id: e.pointerId, ui: true };
      return;
    }
    if (mapDemo === "trebuchet" && mapDemoBandHit(e.clientX, e.clientY)) {
      onTrebuchetClick();
      pointer = { id: e.pointerId, ui: true };
      return;
    }
    const rec = cradleBallAt(e.clientX, e.clientY);
    if (rec && beginCradleDrag(rec)) {
      cradleDrag.goal = screenToCradle(e.clientX, e.clientY);
      pointer = { id: e.pointerId, cradle: true };
      canvas.setPointerCapture(e.pointerId);
    }
    return;
  }
  const w = screenToWorld(e.clientX, e.clientY);
  if (mode === "editor" && editorTool !== "terrain" && editorTool !== "decor" && editorTool !== "rocket") {
    editorClick(w);
    pointer = { tap: true };
    return;
  }
  let kind = mode === "play" ? pressKind(w.x, w.y) : "draw";
  const nailHit = mode === "play" && kind !== "nudge" ? nearestPin(w.x, w.y, NAIL_HIT) : null;
  if (nailHit && kind === "drag") kind = "draw";
  const ink = w;
  pointer = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    wx: w.x,
    wy: w.y,
    pts: kind === "drag" ? null : [inkPoint(ink.x, ink.y, e)],
    moved: false,
    rocket: mode === "editor" && editorTool === "rocket",
    downT: performance.now(),
    grab: null,
    trail: [{ x: w.x, y: w.y }],
    nailClick: nailHit || null,
  };
  if (kind === "nudge") {
    const bp = ball.getPosition();
    pointer.onBall = true;
    pointer.nudgeDir = nudgeDirFromClick(bp.x, w.x);
  } else if (kind === "drag") {
    pointer.grab = { x: w.x, y: w.y };
    engageGrab(pointer.grab);
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
}

function distToPolyEdges(x, y, polyPts) {
  let best = Infinity;
  for (let i = 0; i < polyPts.length; i++) {
    const a = polyPts[i];
    const b = polyPts[(i + 1) % polyPts.length];
    best = Math.min(best, distPointSeg(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

function bodyInradius(meta) {
  if (!meta) return 0;
  if (meta.circles && meta.circles.length) return 0;
  if (!meta.outline || !meta.outline.closed) return 0;
  const local = meta.outline.local;
  if (!pointInPoly(0, 0, local) && distToPoly(0, 0, local) > 0) return 0;
  return distToPolyEdges(0, 0, local);
}

function contourClearance(meta, x, y) {
  if (!meta || !meta.body) return 0;
  if (meta.circles && meta.circles.length) return 0;
  if (!meta.outline || !meta.outline.closed) return 0;
  const lp = meta.body.getLocalPoint(V(x, y));
  if (!pointInPoly(lp.x, lp.y, meta.outline.local)) return 0;
  return distToPolyEdges(lp.x, lp.y, meta.outline.local);
}

function bodyAlwaysGrab(draw) {
  if (!draw) return false;
  if (draw.kind === "roller" || draw.kind === "blob" || draw.kind === "wire" || draw.kind === "rope") return true;
  if (draw.meta && draw.meta.kind === "ball") return true;
  const need = tuneCode("grabEdge", GRAB_EDGE) + GRAB_MIN_INTERIOR;
  return bodyInradius(draw.meta) <= need;
}

function pressZone(x, y) {
  const draw = drawingAt(x, y);
  if (!draw) return "empty";
  if (bodyAlwaysGrab(draw)) return "edge";
  if (contourClearance(draw.meta, x, y) <= tuneCode("grabEdge", GRAB_EDGE)) return "edge";
  return "interior";
}

function pressKind(x, y) {
  if (ball) {
    const bp = ball.getPosition();
    if (Math.hypot(bp.x - x, bp.y - y) < BALL_R * 1.3) return "nudge";
  }
  if (pressZone(x, y) === "edge") return "drag";
  return "draw";
}

// Langer Zug aus der Innenfläche, der sich nicht zum Kringel schließt: nachträglich greifen.
function tryAdoptCenterGrab(trail) {
  if (!pointer || pointer.dragging || playDrag || !world) return false;
  if (!trail || trail.length < 2) return false;
  if (pointer.nailClick) return false;
  const from = trail[0];
  if (nearestPin(from.x, from.y, NAIL_HIT)) return false;
  if (pressZone(from.x, from.y) !== "interior") return false;
  let maxD = 0;
  for (const p of trail) {
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d > maxD) maxD = d;
  }
  if (maxD <= tuneCode("grabAdopt", GRAB_ADOPT)) return false;
  const to = trail[trail.length - 1];
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.4) return false;
  pointer.grab = { x: from.x, y: from.y };
  engageGrab(to);
  if (!playDrag) {
    pointer.grab = null;
    return false;
  }
  pointer.moved = true;
  return true;
}

function engageGrab(worldPt) {
  if (!pointer || !pointer.grab || playDrag) return;
  if (!beginDrag(pointer.grab.x, pointer.grab.y)) return;
  moveDrag(worldPt.x, worldPt.y);
  pointer.pts = null;
  pointer.grab = null;
  pointer.dragging = true;
}

function onPointerMove(e) {
  if (!pointer) return;
  if (pointer.pan) {
    const s = camScale();
    cam.cx = pointer.cx - (e.clientX - pointer.x) / s;
    cam.cy = pointer.cy + (e.clientY - pointer.y) / s;
    return;
  }
  if (pointer.cradle) {
    cradleDrag.goal = screenToCradle(e.clientX, e.clientY);
    return;
  }
  const w = screenToWorld(e.clientX, e.clientY);
  pointer.wx = w.x;
  pointer.wy = w.y;
  if (pointer.trail) {
    const tl = pointer.trail[pointer.trail.length - 1];
    if (Math.hypot(w.x - tl.x, w.y - tl.y) > 0.02) pointer.trail.push({ x: w.x, y: w.y });
  }
  if (pointer.dragging && playDrag) {
    moveDrag(w.x, w.y);
    pointer.moved = true;
    return;
  }
  if (pointer.grab) {
    engageGrab(w);
    return;
  }
  if (!pointer.pts) return;
  const ink = w;
  const last = pointer.pts[pointer.pts.length - 1];
  if (Math.hypot(ink.x - last.x, ink.y - last.y) > 0.04) {
    pointer.pts.push(inkPoint(ink.x, ink.y, e));
    pointer.moved = true;
  }
  if (mode === "play") {
    tryAdoptAnchorGrab(pointer.trail);
    if (pointer && pointer.pts) tryAdoptCenterGrab(pointer.trail);
  }
}

function onPointerUp(e) {
  if (!pointer) return;
  const current = pointer;
  pointer = null;
  if (current.trail) {
    const up = screenToWorld(e.clientX, e.clientY);
    const tl = current.trail[current.trail.length - 1];
    if (Math.hypot(up.x - tl.x, up.y - tl.y) > 0.02) current.trail.push({ x: up.x, y: up.y });
  }
  if (current.dragging || playDrag || current.grab) {
    const held = playDrag && playDrag.body
      ? { body: playDrag.body, at: playDrag.body.getWorldPoint(V(playDrag.local.x, playDrag.local.y)), ghost: !!playDrag.ghost, group: playDrag.groupSet || null }
      : null;
    // Ein Geist springt in endDrag an seinen Schatten zurück und heftet sich nicht an.
    endDrag();
    if (held && mode === "play") {
      const pinned = held.ghost ? 0 : tryPinDragEnd(held.body, held.group);
      if (!pinned) tryAnchorDragEnd(held.body, { x: held.at.x, y: held.at.y }, current.trail);
    }
    return;
  }
  if (current.cradle) {
    endCradleDrag();
    return;
  }
  if (current.pan || current.ui || current.tap) return;
  const w = screenToWorld(e.clientX, e.clientY);
  if (mode === "editor" && current.rocket) {
    const a = Math.atan2(w.y - current.pts[0].y, w.x - current.pts[0].x);
    editorDoc.rockets.push({ x: current.pts[0].x, y: current.pts[0].y, a: current.moved ? a : 0 });
    return;
  }
  if (!current.moved) {
    if (mode === "play" && current.nailClick) {
      const now = performance.now();
      // Doppeltipp zieht einen selbst gesetzten Nagel heraus; ein einzelner
      // kurzer Klick schaltet nur den Motor.
      if (now - lastTap < 320) {
        eraseAt(w.x, w.y);
        lastTap = 0;
        return;
      }
      lastTap = now;
      cycleNailMotor(current.nailClick);
      return;
    }
    const now = performance.now();
    if (mode === "play" && now - lastTap < 320) eraseAt(w.x, w.y);
    lastTap = now;
    if (mode === "play" && current.onBall) doNudge(current.nudgeDir);
    return;
  }
  if (mode === "play") finishPlayStroke(current.trail, current.pts);
  if (mode === "editor" && (editorTool === "terrain" || editorTool === "decor")) {
    let src = current.pts;
    if (strokeSnaps()) src = snapStrokePoints(src);
    const shaped = editorTool === "terrain" ? tidyTerrain(src) : src;
    editorDoc.strokes.push({
      kind: editorTool === "decor" ? "decor" : "terrain",
      color: editorTool === "decor" ? MAT.decor : MAT.terrain,
      points: shaped.map((p) => [p.x, p.y]),
    });
  }
}

function finishPlayStroke(trail, pts) {
  const gesture = tryAnchorGesture(trail);
  if (gesture) return gesture;
  return commitStroke(pts || trail, null, trail || pts);
}

