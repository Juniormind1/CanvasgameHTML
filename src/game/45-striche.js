function resample(pts, spacing) {
  if (pts.length < 2) return pts.slice();
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let ax = pts[i - 1].x;
    let ay = pts[i - 1].y;
    let bx = pts[i].x;
    let by = pts[i].y;
    let seg = Math.hypot(bx - ax, by - ay);
    if (seg < 1e-4) continue;
    while (acc + seg >= spacing) {
      const t = (spacing - acc) / seg;
      ax = ax + (bx - ax) * t;
      ay = ay + (by - ay) * t;
      out.push({ x: ax, y: ay });
      seg = Math.hypot(bx - ax, by - ay);
      acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > spacing * 0.35) out.push({ x: last.x, y: last.y });
  return out;
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) > 0.03) out.push({ x: p.x, y: p.y });
  }
  return out;
}

function pinWorld(pin) {
  const p = pin.body.getWorldPoint(V(pin.local.x, pin.local.y));
  return { x: p.x, y: p.y, pin };
}

function nearestPin(x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const pin of pins) {
    const p = pinWorld(pin);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) { bestD = d; best = pin; }
  }
  return best;
}

function noteShape(pts) {
  stats.shapes += 1;
  if (!ball) return;
  const by = ball.getPosition().y;
  let minY = Infinity;
  for (const p of pts) minY = Math.min(minY, p.y);
  if (minY < by - 0.5) stats.drewUnder = true;
}

function commitStroke(drawnPts, color, rawInk) {
  const result = commitStrokeApply(drawnPts, rawInk);
  if (tuneOn) noteTuneResult((rawInk && rawInk.length >= 2) ? rawInk : drawnPts, result);
  return result;
}

function prepareStroke(src) {
  let pts = dedupe(simplify(src, tuneCode("simplify", 0.045)));
  if (pts.length < 2) return { pts, closed: false };
  const closed = isClosedStroke(pts);
  if (closed) pts = dedupe(pts.slice(0, -1));
  return { pts, closed };
}

function maybeSmallBody(pts, closed) {
  if (pts.length < 4) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  const small = Math.max(bw, bh) < 0.62 && Math.min(bw, bh) > 0.05;
  if (!small || !(closed || dist(pts[0], pts[pts.length - 1]) < 0.4)) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const host = hostAt(cx, cy);
  if (host && bodyMeta.get(host) && bodyMeta.get(host).kind === "ball") {
    /* pins are not allowed on the quest ball */
  } else if (host) {
    stats.userPins += 1;
    return rememberPin(cx, cy, host, true);
  }
  const r = clamp(Math.max(bw, bh) * 0.5, 0.12, 0.34);
  return spawnBlob(cx, cy, r);
}

function commitStrokeApply(drawnPts, rawInk) {
  if (won || !world) return null;
  let ink = (rawInk && rawInk.length >= 2) ? rawInk : drawnPts;
  if (!ink || ink.length < 2) return null;
  const motor = doodleMotor(ink);
  if (motor) return motor;
  // Überschuss am Ende eines geschlossenen Zugs abschneiden (nicht bei Seilen vom Nagel).
  if (!nearestPin(ink[0].x, ink[0].y, NAIL_HIT)) {
    const loop = closeLoop(ink);
    if (loop !== ink) ink = loop;
  }
  let { pts, closed } = prepareStroke(ink);
  if (pts.length < 2) return null;
  const small = maybeSmallBody(pts, closed);
  if (small) return small;
  const closeTol = tuneCode("close", CIRCLE_CLOSE);
  const inkOpen = dist(ink[0], ink[ink.length - 1]);
  const ptsOpen = dist(pts[0], pts[pts.length - 1]);
  if (closed || inkOpen < closeTol || ptsOpen < closeTol) {
    // 3-/4-Ecke immer auf dem Rohzug: keine Ellipse/kein Kreis, und mit
    // Geodreieck kein Raster, das schräge Kanten zu Treppen macht.
    const poly = recognizePolygon(ink);
    if (poly) {
      const neat = snapPolygonPose(poly.corners);
      const solid = spawnSolid(neat, { quadKind: poly.quadKind });
      if (solid) return solid;
    }
    // Kastenform vor der Kreisannahme: Ein Quadrat mit gerundeten oder
    // abgeschnittenen Ecken füllt sein Rechteck weit mehr als ein Kreis.
    const box = boxyLoop(ink);
    if (box) {
      const neat = snapPolygonPose(box.corners);
      const solid = spawnSolid(neat, { quadKind: "rect" });
      if (solid) return solid;
    }
    if (!(strokeSnaps() && geoKeepsPolygon(ink))) {
      const fit = tryMakeCircle(dedupe(ink));
      if (fit) {
        if (fit.kind === "ellipse") return spawnEllipse(fit.x, fit.y, fit.a, fit.b, fit.angle);
        return spawnRoller(fit.x, fit.y, fit.r);
      }
    }
  }
  if (strokeSnaps()) {
    const snapped = snapStrokePoints(ink);
    if (snapped.length >= 2) {
      const prep = prepareStroke(snapped);
      pts = prep.pts;
      closed = prep.closed;
      if (pts.length < 2) return null;
      const snappedSmall = maybeSmallBody(pts, closed);
      if (snappedSmall) return snappedSmall;
    }
  }
  if (!closed) {
    const a = nearestPin(pts[0].x, pts[0].y, 0.55) || nearestPin(ink[0].x, ink[0].y, 0.55);
    const b = nearestPin(pts[pts.length - 1].x, pts[pts.length - 1].y, 0.55) || nearestPin(ink[ink.length - 1].x, ink[ink.length - 1].y, 0.55);
    if (a && b && a !== b) return spawnRope(a, b, ink);
    // Zug, der auf einem Nagel beginnt: Seil, auch wenn das andere Ende frei bleibt.
    const fromNail = nearestPin(ink[0].x, ink[0].y, NAIL_HIT) || nearestPin(pts[0].x, pts[0].y, NAIL_HIT);
    if (fromNail) {
      if (pathLength(ink) < ROPE_FROM_NAIL_MIN && pathLength(pts) < ROPE_FROM_NAIL_MIN) return null;
      return spawnRope(fromNail, (b && b !== fromNail) ? b : null, ink);
    }
  }
  if (closed && !selfIntersects(pts, true) && Math.abs(signedArea(pts)) >= 0.05) {
    const solid = spawnSolid(regularizeClosed(pts), {});
    if (solid) return solid;
    return spawnWire(pts.concat([{ x: pts[0].x, y: pts[0].y }]), {});
  }
  if (!closed) return spawnWire(straightenOpen(pts), { thick: strokeThickness((drawnPts && drawnPts.some((p) => p.thick)) ? drawnPts : ink) });
  return spawnWire(pts, {});
}

function destroyDrawing(draw) {
  if (!draw || !world) return;
  if (draw.kind === "rope") {
    dropRopeChord(draw);
    for (const body of draw.bodies) {
      bodyMeta.delete(body);
      world.destroyBody(body);
    }
  } else if (draw.body) {
    const doomed = draw.body;
    if (isAnchored(doomed)) releaseAnchor(doomed);
    for (const d of drawings) {
      if (d.kind === "rope" && ((d.pinA && d.pinA.body === doomed) || (d.pinB && d.pinB.body === doomed))) dropRopeChord(d);
    }
    pins = pins.filter((pin) => {
      if (pin.body !== doomed) return true;
      return false;
    });
    bodyMeta.delete(doomed);
    world.destroyBody(doomed);
  }
  drawings = drawings.filter((d) => d !== draw);
}

// Einen selbst gesetzten Nagel herausziehen (Doppeltipp auf genau diesen Nagel).
function pullPin(pin) {
  if (!world || world.isLocked() || !pin || !pin.userMade) return false;
  const i = pins.indexOf(pin);
  if (i < 0) return false;
  for (const j of pin.joints) {
    if (j) world.destroyJoint(j);
  }
  pins.splice(i, 1);
  return true;
}

// Klick-Nagel: Ein kurzer Klick ohne Bewegung in die Innenfläche eines
// Gegenstands oder auf den Boden setzt dort einen Nagel (Ort wie beim
// Kringel-Nagel, nie in die Spielkugel). Auf leerem Papier passiert nichts.
function clickNailAt(x, y) {
  if (!world || world.isLocked()) return null;
  const host = hostAt(x, y);
  if (!host) return null;
  const meta = bodyMeta.get(host);
  if (meta && meta.kind === "ball") return null;
  stats.userPins += 1;
  return rememberPin(x, y, host, true);
}

// Kringel um (oder auf) einen Nagel stellt den Motor: Drehsinn des Kringels
// auf dem Bildschirm = Drehsinn des Motors. Gleicher Sinn wie der laufende
// Motor ändert nichts, Gegensinn hält ihn an. Weltkoordinaten haben y nach
// oben wie das Bild (die Bildschirm-y-Spiegelung betrifft nur Pixelwerte),
// also gilt: Fläche > 0 = gegen den Uhrzeigersinn = linksrum (+1).
const MOTOR_DOODLE_MAX = 0.9;   // m, größte Kringelausdehnung
const MOTOR_DOODLE_FILL = 0.15; // |Fläche| / Rechteck mindestens (echte Schleife)

function doodleMotor(ink) {
  if (!ink || ink.length < 6 || !pins.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ink) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  const size = Math.max(bw, bh);
  if (size > MOTOR_DOODLE_MAX || Math.min(bw, bh) < 0.05) return null;
  if (dist(ink[0], ink[ink.length - 1]) > Math.max(0.12, size * 0.6)) return null;
  let area = 0;
  for (let i = 0; i < ink.length; i++) {
    const a = ink[i];
    const b = ink[(i + 1) % ink.length];
    area += a.x * b.y - b.x * a.y;
  }
  area *= 0.5;
  if (Math.abs(area) < MOTOR_DOODLE_FILL * bw * bh) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pin = nearestPin(cx, cy, Math.max(NAIL_HIT, size * 0.5 + 0.1));
  if (!pin) return null;
  const dir = area > 0 ? 1 : -1;
  const cur = pin.motor || 0;
  if (cur === -dir) pin.motor = 0;
  else if (cur === 0) pin.motor = dir;
  applyNailMotor(pin);
  return { kind: "motor", pin, motor: pin.motor, dir };
}

function eraseAt(x, y) {
  if (!world || world.isLocked()) return false;
  for (let i = pins.length - 1; i >= 0; i--) {
    const pin = pins[i];
    if (!pin.userMade) continue;
    const p = pinWorld(pin);
    if (Math.hypot(p.x - x, p.y - y) < 0.4) {
      for (const j of pin.joints) {
        if (j) world.destroyJoint(j);
      }
      pins.splice(i, 1);
      return true;
    }
  }
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (d.kind === "rope") {
      for (const body of d.bodies) {
        const p = body.getPosition();
        if (Math.hypot(p.x - x, p.y - y) < 0.35) {
          destroyDrawing(d);
          return true;
        }
      }
    } else if (d.meta && containsMeta(d.meta, x, y)) {
      if (d.body && isAnchored(d.body)) return false;
      destroyDrawing(d);
      return true;
    }
  }
  return false;
}

function drawingAt(x, y) {
  // Vorderste Ebene zuerst (Ebenen per Nagel, 52-ebenen.js).
  const order = drawingsByLayer();
  for (let i = order.length - 1; i >= 0; i--) {
    const d = order[i];
    if (d.kind === "rope" || !d.body || !d.meta) continue;
    if (!d.body.isDynamic()) continue;
    if (containsMeta(d.meta, x, y)) return d;
  }
  return null;
}

