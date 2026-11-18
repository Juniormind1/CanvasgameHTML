// Verbinden: ein kurzer, fast gerader Zug von unten nach oben.
// Vom Boden in einen aufliegenden festen Körper macht ihn statisch. Liegt ein
// Körper auf einem anderen, verbindet derselbe Zug die beiden starr
// (WeldJoint); die Gruppe bleibt beweglich. Seitliche Berührung verbindet
// nicht, der Strich bleibt eine Zeichnung. Ein Zug von oben nach unten
// verbindet nicht: der obere Körper wird verschoben, denn auf ihm ruht nichts.
// Ein Körper, auf dem noch etwas ruht, lässt sich nicht ziehen. Loslassen auf
// dem Boden verankert weiter. Trifft ein Zug vom Boden einen Körper ohne
// Kontakt, entsteht kein Strich; der Körper wird gegriffen.
// Der Verbindungsstrich sitzt fest an den beiden Gegenständen und wandert mit.
// Rechtsklick auf den Verbindungsstrich löst. Rechtsklick auf einen
// verbundenen Körper löscht ihn nicht.
const ANCHOR_MAX_LEN = 1.5;     // m, Weglänge des Zugs
const ANCHOR_MIN_LEN = 0.15;    // m, Sehne; kürzer ist ein Klick
const ANCHOR_STRAIGHT = 0.8;    // Sehne / Weglänge
const ANCHOR_MAX_BOW = 0.2;     // m, größte Abweichung von der Sehne
const ANCHOR_TOUCH = 0.05;      // m, Abstand, der noch als Berührung gilt
const ANCHOR_REST_UP = 0.65;    // Auflage: Normale von unten nach oben, steiler als eine Seitenlage
const ANCHOR_BASE_TOL = 0.15;   // m, Start so nah am Boden zählt als „auf dem Boden“
const ANCHOR_TARGET_TOL = 0.06; // m, Ende so nah am Umriss zählt als „im Körper“
const ANCHOR_LINK_HIT = 0.22;   // m, Rechtsklick-Abstand zum Verbindungsstrich

function anchorOf(body) {
  return anchors.find((a) => a.body === body) || null;
}

function isAnchored(body) {
  return !!anchorOf(body);
}

// Ziel oder Basis einer Verbindung. Solche Körper löscht ein Rechtsklick nicht.
function inAnchorLink(body) {
  if (!body) return false;
  return anchors.some((a) => a.body === body || (a.weld && a.base === body));
}

function weldNeighbors(body) {
  const out = [];
  if (!body) return out;
  for (const link of anchors) {
    if (!link.weld) continue;
    if (link.body === body && link.base && link.base !== ground) out.push(link.base);
    else if (link.base === body && link.body) out.push(link.body);
  }
  return out;
}

function weldComponent(body) {
  const group = [];
  const seen = new Set();
  const queue = [body];
  while (queue.length) {
    const cur = queue.pop();
    if (!cur || cur === ground || seen.has(cur)) continue;
    seen.add(cur);
    group.push(cur);
    for (const other of weldNeighbors(cur)) queue.push(other);
  }
  return group;
}

// Frei gezogen wird nur eine lose Gruppe. Starr und irgendwo fest: Physik hält.
function rigidDragHeld(body) {
  if (!body || weldComponent(body).length < 2) return false;
  return !freeNailGroup(body);
}

function syncWeldGroup(body) {
  const group = weldComponent(body);
  if (group.length < 2 || !body.isDynamic()) return;
  const w = body.getAngularVelocity();
  const v = body.getLinearVelocity();
  const com = body.getPosition();
  for (const b of group) {
    if (b === body || !b.isDynamic()) continue;
    const p = b.getPosition();
    b.setAngularVelocity(w);
    b.setLinearVelocity(V(v.x - w * (p.y - com.y), v.y + w * (p.x - com.x)));
    b.setAwake(true);
  }
}

function dropAnchorJoint(link) {
  if (!link || !link.joint) return;
  if (world && jointAlive(world, link.joint)) world.destroyJoint(link.joint);
  link.joint = null;
}

function makeAnchorWeld(base, body) {
  const wp = body.getPosition();
  return world.createJoint(new planck.WeldJoint({
    bodyA: base,
    bodyB: body,
    localAnchorA: base.getLocalPoint(wp),
    localAnchorB: body.getLocalPoint(wp),
    referenceAngle: body.getAngle() - base.getAngle(),
    frequencyHz: 0,
    dampingRatio: 0,
    collideConnected: false,
  }));
}

function anchorStrokeOk(trail) {
  if (!trail || trail.length < 2) return false;
  const a = trail[0];
  const b = trail[trail.length - 1];
  const chord = dist(a, b);
  let len = 0;
  let bow = 0;
  for (let i = 1; i < trail.length; i++) len += dist(trail[i - 1], trail[i]);
  for (const p of trail) bow = Math.max(bow, distPointSeg(p.x, p.y, a.x, a.y, b.x, b.y));
  return len <= ANCHOR_MAX_LEN && chord >= ANCHOR_MIN_LEN && chord >= ANCHOR_STRAIGHT * len && bow <= ANCHOR_MAX_BOW;
}

function insideDraw(d, x, y, tol) {
  if (!d || !d.body || !d.meta || !d.meta.outline || !d.meta.outline.closed) return false;
  const lp = d.body.getLocalPoint(V(x, y));
  return distToPoly(lp.x, lp.y, d.meta.outline.local) <= tol;
}

// Nur feste Körper: keine Drähte, keine Kugeln, keine Seile.
function anchorableAt(x, y) {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (d.kind !== "solid" || !d.body || (d.meta && d.meta.round)) continue;
    if (insideDraw(d, x, y, ANCHOR_TARGET_TOL)) return d;
  }
  return null;
}

// Fester Körper unter dem Punkt, sonst der Boden. Freie Körper zählen mit,
// damit ein kurzer Strich zwei Gegenstände verbindet.
function anchorBaseAt(x, y, except) {
  // Strikt innen schlägt den Toleranzrand, damit der Nachbar an der Fuge
  // den Startkörper nicht stiehlt. Der Boden schlägt den bloßen Rand.
  let loose = null;
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (!d.body || d.body === except) continue;
    if (d.kind !== "solid" || (d.meta && d.meta.round)) continue;
    if (!d.body.isDynamic() && !isAnchored(d.body)) continue;
    if (insideDraw(d, x, y, 0)) return d.body;
    if (!loose && insideDraw(d, x, y, ANCHOR_BASE_TOL)) loose = d.body;
  }
  for (const g of geometry) {
    if (g.closed ? distToPoly(x, y, g.pts) <= ANCHOR_BASE_TOL : distToWire(x, y, g.pts) <= ANCHOR_BASE_TOL + 0.1) return ground;
  }
  return loose;
}

function solidAnchorDraw(body) {
  if (!body || body === ground) return null;
  const d = drawings.find((draw) => draw.body === body);
  if (!d || d.kind !== "solid" || (d.meta && d.meta.round)) return null;
  return d;
}

// Nächster Abstand und Richtung von a nach b (ny > 0: b liegt über a).
function bodyApproach(a, b) {
  let best = Infinity;
  let nx = 0;
  let ny = 0;
  if (!a || !b || a === b) return { distance: best, nx, ny };
  const xa = a.getTransform();
  const xb = b.getTransform();
  for (let fa = a.getFixtureList(); fa; fa = fa.getNext()) {
    for (let fb = b.getFixtureList(); fb; fb = fb.getNext()) {
      const ba = fa.getAABB(0);
      const bb = fb.getAABB(0);
      if (ba.lowerBound.x - bb.upperBound.x > best || bb.lowerBound.x - ba.upperBound.x > best) continue;
      if (ba.lowerBound.y - bb.upperBound.y > best || bb.lowerBound.y - ba.upperBound.y > best) continue;
      const input = new planck.DistanceInput();
      input.proxyA.set(fa.getShape(), 0);
      input.proxyB.set(fb.getShape(), 0);
      input.transformA = xa;
      input.transformB = xb;
      input.useRadii = true;
      const output = new planck.DistanceOutput();
      planck.Distance(output, new planck.SimplexCache(), input);
      if (output.distance >= best) continue;
      best = output.distance;
      const pa = output.pointA;
      const pb = output.pointB;
      let dx = pb.x - pa.x;
      let dy = pb.y - pa.y;
      let len = Math.hypot(dx, dy);
      if (len < 1e-5) {
        const ca = a.getPosition();
        const cb = b.getPosition();
        dx = cb.x - ca.x;
        dy = cb.y - ca.y;
        len = Math.hypot(dx, dy);
      }
      if (len > 1e-6) { nx = dx / len; ny = dy / len; }
    }
  }
  return { distance: best, nx, ny };
}

function bodyGap(a, b) {
  return bodyApproach(a, b).distance;
}

// upper liegt auf lower: sie berühren sich, und die Berührung kommt von oben.
// Teile derselben starren Verbindung zählen nicht als Auflage.
function restsOn(upper, lower) {
  if (!upper || !lower || upper === lower || lower === ground) return false;
  if (weldComponent(upper).indexOf(lower) >= 0) return false;
  const app = bodyApproach(lower, upper);
  return app.distance <= ANCHOR_TOUCH && app.ny >= ANCHOR_REST_UP;
}

function loadRestingOn(body) {
  if (!body || body === ground) return false;
  const group = weldComponent(body);
  for (let i = 0; i < group.length; i++) {
    const base = group[i];
    for (const d of drawings) {
      if (!d.body || group.indexOf(d.body) >= 0) continue;
      if (d.kind === "rope" || d.kind === "wire") continue;
      if (!d.body.isDynamic()) continue;
      if (restsOn(d.body, base)) return true;
    }
    if (typeof ball !== "undefined" && ball && group.indexOf(ball) < 0 && ball.isDynamic() && restsOn(ball, base)) return true;
  }
  return false;
}

function anchorAllowed(draw, base, groupTouch) {
  if (!world || world.isLocked() || !draw || !draw.body || !base) return false;
  const body = draw.body;
  if (draw.kind !== "solid" || (draw.meta && draw.meta.round)) return false;
  if (!body.isDynamic() || isAnchored(body) || base === body) return false;
  const freeze = base === ground || !base.isDynamic();
  if (freeze) {
    if (base !== ground && !isAnchored(base)) return false;
  } else if (!solidAnchorDraw(base)) {
    return false;
  }
  if (!freeze && weldComponent(body).indexOf(base) >= 0) return false;
  // Zwei freie oder ein fester Körper: nur verbinden, wenn der Zielkörper darauf ruht.
  if (base !== ground && !restsOn(body, base)) return false;
  if (groupTouch) {
    const group = weldComponent(body);
    if (!group.some((b) => bodyGap(b, base) <= ANCHOR_TOUCH)) return false;
  } else if (bodyGap(body, base) > ANCHOR_TOUCH) {
    return false;
  }
  return true;
}

function paintDraw(draw, color) {
  if (!draw) return;
  draw.color = color;
  if (draw.meta && draw.meta.outline) draw.meta.outline.color = color;
}

function groundColorAt(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const item of scenery) {
    if (item.kind !== "poly" || !item.pts) continue;
    const d = distToPoly(x, y, item.pts);
    if (d < bestD) {
      bestD = d;
      best = item.color;
    }
  }
  return best || "#3f8f55";
}

function anchorTintColor(base, at) {
  if (base === ground) return groundColorAt(at.x, at.y);
  const host = drawings.find((d) => d.body === base);
  if (host && host.color) return host.color;
  const link = anchorOf(base);
  if (link) return anchorTintColor(link.base, link.a);
  return groundColorAt(at.x, at.y);
}

function freezeWeldGroup(body) {
  const group = weldComponent(body);
  for (const link of anchors) {
    if (!link.weld) continue;
    if (group.indexOf(link.body) < 0 && group.indexOf(link.base) < 0) continue;
    dropAnchorJoint(link);
  }
  for (const b of group) {
    if (playDrag && playDrag.body === b) endDrag();
    if (b.isDynamic()) b.setStatic();
    dragFresh.delete(b);
  }
  return group;
}

function thawWeldGroup(body) {
  const group = weldComponent(body);
  for (const b of group) {
    if (!bodyMeta.has(b)) continue;
    const own = anchorOf(b);
    if (own && own.freeze) continue;
    if (!b.isDynamic()) {
      b.setDynamic();
      b.setAwake(true);
    }
  }
  for (const link of anchors) {
    if (!link.weld || link.joint) continue;
    if (group.indexOf(link.body) < 0 || group.indexOf(link.base) < 0) continue;
    if (!link.body.isDynamic() || !link.base.isDynamic()) continue;
    link.joint = makeAnchorWeld(link.base, link.body);
  }
  for (let pass = 0; pass < 6; pass++) {
    for (const link of anchors) {
      if (!link.weld || group.indexOf(link.body) < 0) continue;
      paintDraw(link.draw, anchorTintColor(link.base, link.a));
    }
  }
}

// Enden am Gegenstand, nicht im Raum. Der Boden hat keine Lage und bleibt in Weltkoordinaten.
function anchorLinkLocals(base, body, from, to) {
  let localA = null;
  let localB = null;
  if (base && base !== ground && base.getLocalPoint) {
    const p = base.getLocalPoint(V(from.x, from.y));
    localA = { x: p.x, y: p.y };
  }
  if (body && body !== ground && body.getLocalPoint) {
    const p = body.getLocalPoint(V(to.x, to.y));
    localB = { x: p.x, y: p.y };
  }
  return { localA, localB };
}

function anchorLinkEnds(link) {
  let a = link.a;
  let b = link.b;
  if (link.localA && link.base && link.base !== ground && link.base.getWorldPoint) {
    const p = link.base.getWorldPoint(V(link.localA.x, link.localA.y));
    a = { x: p.x, y: p.y };
  }
  if (link.localB && link.body && link.body !== ground && link.body.getWorldPoint) {
    const p = link.body.getWorldPoint(V(link.localB.x, link.localB.y));
    b = { x: p.x, y: p.y };
  }
  return { a, b };
}

function anchorBody(draw, base, from, to, groupTouch) {
  if (!anchorAllowed(draw, base, groupTouch)) return false;
  const body = draw.body;
  if (playDrag && playDrag.body === body) endDrag();
  const freeze = base === ground || !base.isDynamic();
  const savedColor = draw.color;
  let joint = null;
  if (freeze) freezeWeldGroup(body);
  else joint = makeAnchorWeld(base, body);
  if (!freeze) dragFresh.delete(body);
  const locals = anchorLinkLocals(base, body, from, to);
  anchors.push({
    body, base, draw,
    a: { x: from.x, y: from.y },
    b: { x: to.x, y: to.y },
    localA: locals.localA,
    localB: locals.localB,
    color: savedColor,
    savedColor,
    weld: !freeze,
    freeze,
    joint,
  });
  const tint = anchorTintColor(base, from);
  paintDraw(draw, tint);
  if (freeze) {
    for (const b of weldComponent(body)) {
      const d = drawings.find((dr) => dr.body === b);
      if (d) paintDraw(d, tint);
    }
  }
  return true;
}

// Die Gruppe berührt die feste Basis. Der Gelenk-Eintrag landet am Wurzelkörper,
// der selbst noch keinen Anker hat.
function freezeJoinedOn(member, base, from, to) {
  if (!world || world.isLocked() || !member) return false;
  if (base !== ground && (base.isDynamic() || !isAnchored(base))) return false;
  const group = weldComponent(member);
  if (!group.some((b) => bodyGap(b, base) <= ANCHOR_TOUCH)) return false;
  const root = group.find((b) => !anchorOf(b));
  const draw = root && solidAnchorDraw(root);
  if (!draw) return false;
  return anchorBody(draw, base, from, to, true);
}

function releaseAnchor(body) {
  const link = anchorOf(body);
  if (!link || !world || world.isLocked()) return false;
  const wasFreeze = !!link.freeze;
  dropAnchorJoint(link);
  anchors = anchors.filter((a) => a !== link);
  if (link.savedColor) paintDraw(link.draw, link.savedColor);
  if (wasFreeze) {
    for (const dep of anchors.filter((a) => a.base === body && a.freeze)) releaseAnchor(dep.body);
    if (bodyMeta.has(body)) thawWeldGroup(body);
  } else if (bodyMeta.has(body) && !body.isDynamic()) {
    body.setDynamic();
    body.setAwake(true);
  }
  return true;
}

function releaseBodyAnchors(body) {
  if (!body) return;
  const pending = anchors.filter((a) => a.body === body || a.base === body);
  for (const link of pending) {
    if (anchors.indexOf(link) >= 0) releaseAnchor(link.body);
  }
}

function anchorLinkAt(x, y) {
  let best = null;
  let bestD = ANCHOR_LINK_HIT;
  for (const link of anchors) {
    const ends = anchorLinkEnds(link);
    const d = distPointSeg(x, y, ends.a.x, ends.a.y, ends.b.x, ends.b.y);
    if (d <= bestD) { bestD = d; best = link; }
  }
  return best;
}

function releaseAnchorAt(x, y) {
  const link = anchorLinkAt(x, y);
  return link ? releaseAnchor(link.body) : false;
}

// Gezeichneter Zug. "anchor" = verankert oder gelöst, "miss" = erkannt aber
// abgelehnt (kein Strich), false = kein Ankerversuch, weiterzeichnen.
function tryAnchorGesture(trail) {
  if (!world || !anchorStrokeOk(trail)) return false;
  const from = trail[0];
  if (nearestPin(from.x, from.y, NAIL_HIT)) return false;
  const to = trail[trail.length - 1];
  // Vom verankerten Körper zurück auf seine Basis: lösen.
  const startIn = anchorableAt(from.x, from.y);
  if (startIn && isAnchored(startIn.body)) {
    const back = anchorBaseAt(to.x, to.y, startIn.body);
    if (back && back === anchorOf(startIn.body).base) {
      releaseAnchor(startIn.body);
      return "anchor";
    }
  }
  const base = anchorBaseAt(from.x, from.y);
  if (!base) return false;
  const target = anchorableAt(to.x, to.y);
  if (!target || target.body === base) return false;
  if (isAnchored(target.body)) {
    const link = anchorOf(target.body);
    if (link && link.base === base) {
      releaseAnchor(target.body);
      return "anchor";
    }
    if (link && link.weld && (base === ground || !base.isDynamic())) {
      return freezeJoinedOn(target.body, base, from, to) ? "anchor" : "miss";
    }
    releaseAnchor(target.body);
    return "anchor";
  }
  // Seitliche Berührung ist kein Verbindungsstrich (der Strich bleibt eine Zeichnung).
  // Kein Kontakt bleibt ein Fehlversuch, damit der Zielkörper gegriffen wird.
  if (base !== ground && !restsOn(target.body, base)) {
    if (bodyGap(target.body, base) > ANCHOR_TOUCH) return "miss";
    return false;
  }
  if (anchorBody(target, base, from, to)) return "anchor";
  return "miss";
}

// Abgelehnte Ankergeste während des Ziehens: kein Strich, stattdessen greifen.
function tryAdoptAnchorGrab(trail) {
  if (!pointer || pointer.dragging || playDrag || !world) return false;
  if (!anchorStrokeOk(trail)) return false;
  if (pointer.nailClick) return false;
  const from = trail[0];
  if (nearestPin(from.x, from.y, NAIL_HIT)) return false;
  const to = trail[trail.length - 1];
  const base = anchorBaseAt(from.x, from.y);
  if (!base) return false;
  const target = anchorableAt(to.x, to.y);
  if (!target || target.body === base || isAnchored(target.body)) return false;
  if (anchorAllowed(target, base)) return false;
  const onBody = target.meta && containsMeta(target.meta, to.x, to.y);
  const grabAt = onBody ? to : target.body.getPosition();
  pointer.grab = { x: grabAt.x, y: grabAt.y };
  engageGrab(grabAt);
  if (!playDrag) {
    pointer.grab = null;
    return false;
  }
  pointer.moved = true;
  return true;
}

// Gegriffener Körper, Maus auf Boden oder verankertem Körper losgelassen.
function tryAnchorDragEnd(body, grabPt, trail) {
  if (!world || !anchorStrokeOk(trail)) return false;
  const to = trail[trail.length - 1];
  const draw = drawings.find((d) => d.body === body);
  if (!draw || insideDraw(draw, to.x, to.y, 0)) return false;
  const base = anchorBaseAt(to.x, to.y, body);
  if (!base || (base !== ground && base.isDynamic())) return false;
  return anchorBody(draw, base, to, grabPt);
}

function drawAnchorLinks() {
  for (const link of anchors) {
    const ends = anchorLinkEnds(link);
    crayonPath([ends.a, ends.b], link.color, 0.1);
    for (const p of [ends.a, ends.b]) {
      const s = worldToScreen(p.x, p.y);
      ctx.save();
      ctx.fillStyle = link.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(2.5, 0.08 * camScale()), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

