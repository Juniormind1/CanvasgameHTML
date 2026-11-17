// Verankern: ein kurzer, fast gerader Zug vom Boden (oder einem verankerten
// Körper) in einen festen Körper macht ihn statisch, als wäre er Teil des
// Bodens. Umgekehrt geht es auch: Körper greifen und auf dem Boden loslassen.
// Ketten beginnen immer am Boden. Trifft die Geste einen Körper, der nicht
// verankert werden kann (er berührt die Basis nicht), entsteht kein Strich;
// der Körper wird stattdessen gegriffen und folgt der Maus.
// Rechtsklick auf den Verbindungsstrich löst den Körper und alles, was an
// ihm hängt. Rechtsklick auf einen verankerten Körper selbst löscht ihn nicht.
const ANCHOR_MAX_LEN = 1.5;     // m, Weglänge des Zugs
const ANCHOR_MIN_LEN = 0.15;    // m, Sehne; kürzer ist ein Klick
const ANCHOR_STRAIGHT = 0.8;    // Sehne / Weglänge
const ANCHOR_MAX_BOW = 0.2;     // m, größte Abweichung von der Sehne
const ANCHOR_TOUCH = 0.05;      // m, Abstand, der noch als Berührung gilt
const ANCHOR_BASE_TOL = 0.15;   // m, Start so nah am Boden zählt als „auf dem Boden“
const ANCHOR_TARGET_TOL = 0.06; // m, Ende so nah am Umriss zählt als „im Körper“
const ANCHOR_LINK_HIT = 0.22;   // m, Rechtsklick-Abstand zum Verbindungsstrich

function anchorOf(body) {
  return anchors.find((a) => a.body === body) || null;
}

function isAnchored(body) {
  return !!anchorOf(body);
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

// Boden oder verankerter Körper unter dem Punkt.
function anchorBaseAt(x, y, except) {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (!d.body || d.body === except || !isAnchored(d.body)) continue;
    if (insideDraw(d, x, y, ANCHOR_BASE_TOL)) return d.body;
  }
  for (const g of geometry) {
    if (g.closed ? distToPoly(x, y, g.pts) <= ANCHOR_BASE_TOL : distToWire(x, y, g.pts) <= ANCHOR_BASE_TOL + 0.1) return ground;
  }
  return null;
}

function bodyGap(a, b) {
  let best = Infinity;
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
      best = Math.min(best, output.distance);
    }
  }
  return best;
}

function anchorAllowed(draw, base) {
  if (!world || world.isLocked() || !draw || !draw.body || !base) return false;
  const body = draw.body;
  if (draw.kind !== "solid" || (draw.meta && draw.meta.round)) return false;
  if (!body.isDynamic() || isAnchored(body) || base === body) return false;
  if (base !== ground && !isAnchored(base)) return false;
  if (bodyGap(body, base) > ANCHOR_TOUCH) return false;
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

function anchorBody(draw, base, from, to) {
  if (!anchorAllowed(draw, base)) return false;
  const body = draw.body;
  if (playDrag && playDrag.body === body) endDrag();
  body.setStatic();
  dragFresh.delete(body);
  const savedColor = draw.color;
  anchors.push({
    body, base, draw,
    a: { x: from.x, y: from.y },
    b: { x: to.x, y: to.y },
    color: savedColor,
    savedColor,
  });
  paintDraw(draw, anchorTintColor(base, from));
  return true;
}

function releaseAnchor(body) {
  const link = anchorOf(body);
  if (!link || !world || world.isLocked()) return false;
  anchors = anchors.filter((a) => a !== link);
  if (link.savedColor) paintDraw(link.draw, link.savedColor);
  for (const dep of anchors.filter((a) => a.base === body)) releaseAnchor(dep.body);
  if (bodyMeta.has(body)) {
    body.setDynamic();
    body.setAwake(true);
  }
  return true;
}

function anchorLinkAt(x, y) {
  let best = null;
  let bestD = ANCHOR_LINK_HIT;
  for (const link of anchors) {
    const d = distPointSeg(x, y, link.a.x, link.a.y, link.b.x, link.b.y);
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
    releaseAnchor(target.body);
    return "anchor";
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
  if (!base) return false;
  return anchorBody(draw, base, to, grabPt);
}

function drawAnchorLinks() {
  for (const link of anchors) {
    crayonPath([link.a, link.b], link.color, 0.1);
    for (const p of [link.a, link.b]) {
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

