"use strict";

const VIEW_W = 32;
const VIEW_H = 18;
const BALL_R = 0.34;
const THICK = 0.16;
const PEN_PRESS_MIN = 0.5;                    // Dickenfaktor bei Stiftdruck 0
const PEN_PRESS_MAX = 2.5;                    // Dickenfaktor bei Stiftdruck 1
// Farbe folgt dem Material. Der Spieler wählt keine Farbe.
const MAT = {
  steel: "#8b939e",
  steelDark: "#4a515a",
  wood: "#8d5a34",
  wire: "#5c4632",
  hemp: "#c9a56a",
  ink: "#5c5348",
  terrain: "#3f8f55",
  decor: "#6b5844",
};
const GEO_GRID = 0.5;
const BALL_RESTITUTION = 0.4;
// Unter dieser Relativgeschwindigkeit bleibt der Stoß unelastisch (Ruhekontakt).
// 2.2 passt zur Gravitation g=24, damit die Kugel auf dem Boden nicht zittert.
const VELOCITY_THRESHOLD = 2.2;

if (typeof planck !== "undefined" && planck.Settings) planck.Settings.velocityThreshold = VELOCITY_THRESHOLD;

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const namebox = document.getElementById("namebox");
const testlog = document.getElementById("testlog");

let dpr = 1;
let viewW = 800;
let shotCaptions = null;
let viewH = 450;
const cam = { cx: 16, cy: 9, zoom: 1 };
let geoSnap = false;
let mode = "map";
let ui = [];
let world = null;
let ground = null;
let ball = null;
let stars = [];
let pins = [];
let rockets = [];
let drawings = [];
let scenery = [];
let geometry = [];
let bodyMeta = new Map();
let contactQ = [];
let ropeCutQ = [];
let ropeSeq = 1;
let levelDef = null;
let won = false;
let medals = { elegant: false, oldschool: false };
let stats = { shapes: 0, nudges: 0, userPins: 0, ropes: 0, drewUnder: false, dragTrick: false };
let simTime = 0;
let editorDoc = null;
let editorTool = "terrain";
let returnMode = "map";
let pointer = null;
let lastTap = 0;
let paper = null;
let confetti = [];
let playDrag = null;
let dragFresh = new Map();
let cradleWorld = null;
let cradleGround = null;
let cradleBalls = [];
let cradleDrag = null;
let trebWorld = null;
let trebGround = null;
let treb = null;
let mapDemo = "cradle";
let anchors = [];

const CONFETTI_PAIRS = [
  ["#e23b32", "#f6e27a"],
  ["#3c7fd6", "#f2c14b"],
  ["#3e9a48", "#ff5fa2"],
  ["#7a4fbf", "#8ee0c2"],
  ["#ef8b2c", "#1f4f8a"],
  ["#d94b3a", "#fff6d8"],
  ["#1f6f8a", "#f08bb0"],
  ["#c9854a", "#24324a"],
];

const LEVELS = {};

function poly(pts) {
  return pts.map(([x, y]) => ({ x, y }));
}

function addLevel(id, def) {
  def.id = id;
  if (def.solids) def.solids = def.solids.map((s) => ({ pts: poly(s.pts), color: s.color || "#3f8f55" }));
  if (def.wires) def.wires = def.wires.map((s) => ({ pts: poly(s.pts), color: s.color || "#5c4632" }));
  if (def.decor) def.decor = def.decor.map((s) => ({ pts: poly(s.pts), color: s.color || "#7eaa6a", width: s.width || 0.12 }));
  LEVELS[id] = def;
}

addLevel("ein-klotz", {
  name: "Ein Klotz",
  hint: "Male einen Klotz über die Kugel. Ein Klick auf sie schubst nur ein bisschen.",
  ball: [5, 1.66],
  stars: [[11.5, 2.05]],
  solids: [{ pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#3f8f55" }],
});

addLevel("die-luecke", {
  name: "Die Lücke",
  hint: "Eine offene Linie wird zum Steg. Danach die Kugel anschubsen.",
  ball: [4.2, 5.38],
  stars: [[26, 5.55]],
  solids: [
    { pts: [[0, 0], [11.2, 0], [11.2, 5], [0, 5]], color: "#3f8f55" },
    { pts: [[20.8, 0], [32, 0], [32, 5], [20.8, 5]], color: "#3f8f55" },
  ],
});

addLevel("bergauf", {
  name: "Bergauf",
  hint: "Eine schräge Linie ist eine Rampe. Dicke Flächen sind schwerer als Striche.",
  ball: [4, 2.78],
  stars: [[25.5, 9.6]],
  solids: [
    { pts: [[0, 0], [10, 0], [10, 2.4], [0, 2.4]], color: "#3f8f55" },
    { pts: [[18, 0], [32, 0], [32, 9], [18, 9]], color: "#c9854a" },
  ],
});

addLevel("die-mulde", {
  name: "Die Mulde",
  hint: "Etwas Schweres, das schief auf die Kugel fällt, treibt sie den Hang hinauf.",
  ball: [12.1, 2.15],
  stars: [[25, 4.75]],
  solids: [{
    pts: [[0, 0], [32, 0], [32, 4.2], [17.2, 4.2], [13.2, 1.5], [9.2, 4.2], [0, 4.2]],
    color: "#3f8f55",
  }],
});

addLevel("der-nagel", {
  name: "Der Nagel",
  hint: "Der kleine Kreis am Balken ist ein Nagel. Male einen langen Hammer darum, das dicke Ende nach links.",
  ball: [12.2, 2.9],
  stars: [[26, 2.0]],
  pins: [[15.6, 15.58]],
  solids: [
    { pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#3f8f55" },
    { pts: [[10, 1.3], [15, 1.3], [15, 2.52], [10, 2.52]], color: "#c9854a" },
    { pts: [[8, 15.5], [22, 15.5], [22, 17.4], [8, 17.4]], color: "#7eaa6a" },
  ],
});

addLevel("zwei-naegel", {
  name: "Zwei Nägel",
  hint: "Ein Brett durch zwei Nägel sitzt starr. Danach die Kugel hinüberschubsen.",
  ball: [4, 4.58],
  stars: [[26.2, 4.75]],
  pins: [[11.9, 5.05], [20.1, 5.05]],
  solids: [
    { pts: [[0, 0], [12, 0], [12, 4.2], [0, 4.2]], color: "#3f8f55" },
    { pts: [[20, 0], [32, 0], [32, 4.2], [20, 4.2]], color: "#3f8f55" },
    { pts: [[11.2, 4.2], [12.7, 4.2], [12.7, 5.35], [11.2, 5.35]], color: "#c9854a" },
    { pts: [[19.3, 4.2], [20.8, 4.2], [20.8, 5.35], [19.3, 5.35]], color: "#c9854a" },
  ],
});

addLevel("die-wippe", {
  name: "Die Wippe",
  hint: "Nagel auf die Spitze, ein Brett darüber, und einen Klotz auf die rechte Seite.",
  ball: [3.4, 6.05],
  stars: [[5.2, 11.2]],
  pins: [[15, 5.2]],
  solids: [
    { pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#d7c39a" },
    { pts: [[1, 1.3], [6.2, 1.3], [6.2, 5.65], [1, 5.65]], color: "#3f8f55" },
    { pts: [[13.1, 1.3], [16.9, 1.3], [15, 5.45]], color: "#c9854a" },
    { pts: [[2.2, 9.6], [8.4, 9.6], [8.4, 10.1], [2.2, 10.1]], color: "#7eaa6a" },
  ],
});

addLevel("das-seil", {
  name: "Das Seil",
  hint: "Eine Linie von Nagel zu Nagel wird ein Seil so lang wie der Strich. Schlenker machen es länger.",
  ball: [4.2, 8.42],
  stars: [[16, 6.3]],
  pins: [[8.3, 11.2], [23.7, 11.2]],
  solids: [
    { pts: [[0, 0], [8, 0], [8, 8], [0, 8]], color: "#3f8f55" },
    { pts: [[24, 0], [32, 0], [32, 8], [24, 8]], color: "#3f8f55" },
    { pts: [[6.6, 10.6], [9.4, 10.6], [9.4, 12.4], [6.6, 12.4]], color: "#c9854a" },
    { pts: [[22.6, 10.6], [25.4, 10.6], [25.4, 12.4], [22.6, 12.4]], color: "#c9854a" },
  ],
});

addLevel("flaschenzug", {
  name: "Flaschenzug",
  hint: "Nagel auf den Korb, Nagel auf den Klotz, Seil dazwischen. Den Klotz vom Sims stoßen.",
  ball: [8, 3.35],
  stars: [[8, 11.4]],
  boxes: [
    { x: 8, y: 2.75, hw: 1.35, hh: 0.22, density: 1, color: "#8d5a34", tag: "basket", pin: true },
    { x: 24.2, y: 8.15, hw: 0.85, hh: 0.85, density: 8, color: "#5c4632", tag: "crate", pin: true },
  ],
  solids: [
    { pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#d7c39a" },
    { pts: [[5.6, 1.3], [10.6, 1.3], [10.6, 2.45], [5.6, 2.45]], color: "#3f8f55" },
    { pts: [[21.2, 1.3], [28.5, 1.3], [28.5, 7.2], [21.2, 7.2]], color: "#c9854a" },
    { pts: [[6.2, 12.2], [10.2, 12.2], [10.2, 12.55], [6.2, 12.55]], color: "#7eaa6a" },
  ],
});

addLevel("radiere", {
  name: "Radiere",
  hint: "Bau einen Korb um die Kugel, zieh ihn hoch, und radiere ihn über dem Stern weg. Rechtsklick radiert.",
  ball: [8, 2.0],
  stars: [[8, 8.3]],
  pins: [[8, 14.8], [22.5, 14.8]],
  boxes: [
    { x: 23.4, y: 8.2, hw: 0.9, hh: 0.9, density: 7, color: "#5c4632", tag: "crate", pin: true },
  ],
  solids: [
    { pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#3f8f55" },
    { pts: [[4, 15.2], [26, 15.2], [26, 16.8], [4, 16.8]], color: "#7eaa6a" },
    { pts: [[20.5, 1.3], [27.5, 1.3], [27.5, 7.2], [20.5, 7.2]], color: "#c9854a" },
  ],
});

addLevel("zuendung", {
  name: "Zündung",
  hint: "Lass etwas auf die Rakete fallen. Sie fliegt dorthin, wohin die Spitze zeigt.",
  ball: [16, 1.66],
  stars: [[27, 2.05]],
  rockets: [{ x: 6.2, y: 1.82, a: 0 }],
  solids: [
    { pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#3f8f55" },
    { pts: [[3, 4.3], [30, 4.3], [30, 4.7], [3, 4.7]], color: "#8d5a34" },
  ],
});

addLevel("ein-strich", {
  name: "Ein Strich",
  hint: "Elegant heißt: genau ein Gegenstand, kein Schubs, Nägel zählen nicht.",
  ball: [6, 1.66],
  stars: [[9.6, 2.05]],
  solids: [{ pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#3f8f55" }],
});

addLevel("werkstatt", {
  name: "Werkstatt",
  hint: "Zwei Sterne. Nagel, Seil, Rakete, Radiergummi: alles ist erlaubt.",
  ball: [4.5, 1.66],
  stars: [[15, 2.05], [26, 8.8]],
  pins: [[18, 13.6]],
  rockets: [{ x: 8.5, y: 1.82, a: 0.15 }],
  solids: [
    { pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#3f8f55" },
    { pts: [[20, 1.3], [32, 1.3], [32, 8.2], [22, 8.2]], color: "#c9854a" },
    { pts: [[12, 13.1], [24, 13.1], [24, 15.2], [12, 15.2]], color: "#7eaa6a" },
  ],
});

addLevel("sandbox", {
  name: "Schmierzettel",
  hint: "Freies Blatt. Die Kugel und ein Stern, sonst nichts.",
  ball: [6, 1.66],
  stars: [[24, 2.1]],
  solids: [{ pts: [[0, 0], [32, 0], [32, 1.3], [0, 1.3]], color: "#3f8f55" }],
  sandbox: true,
});

const ISLANDS = [
  { name: "Erste Striche", need: 0, blurb: "Fläche, Strich, Gewicht", levels: ["ein-klotz", "die-luecke", "bergauf", "die-mulde"] },
  { name: "Nägel", need: 3, blurb: "Gelenk, Schloss, Wippe", levels: ["der-nagel", "zwei-naegel", "die-wippe"] },
  { name: "Seile", need: 6, blurb: "Seil, Zug, Radiergummi", levels: ["das-seil", "flaschenzug", "radiere"] },
  { name: "Raketen", need: 8, blurb: "Schub, eleganter Strich", levels: ["zuendung", "ein-strich", "werkstatt"] },
];

const ORDER = ISLANDS.flatMap((island) => island.levels);

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* private mode */ }
}

function progress() { return loadJSON("crayon-progress", { cleared: {} }); }

function starCount() {
  const cleared = progress().cleared;
  return ORDER.filter((id) => cleared[id]).length;
}

function customs() { return loadJSON("crayon-customs", {}); }

function hash(i, s) {
  const n = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pointInPoly(x, y, polyPts) {
  let inside = false;
  for (let i = 0, j = polyPts.length - 1; i < polyPts.length; j = i++) {
    const pi = polyPts[i];
    const pj = polyPts[j];
    const hit = ((pi.y > y) !== (pj.y > y)) &&
      (x < (pj.x - pi.x) * (y - pi.y) / ((pj.y - pi.y) || 1e-9) + pi.x);
    if (hit) inside = !inside;
  }
  return inside;
}

function distPointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToPoly(x, y, polyPts) {
  if (pointInPoly(x, y, polyPts)) return 0;
  let best = Infinity;
  for (let i = 0; i < polyPts.length; i++) {
    const a = polyPts[i];
    const b = polyPts[(i + 1) % polyPts.length];
    best = Math.min(best, distPointSeg(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

function distToWire(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distPointSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
  }
  return best;
}

function pointInTri(p, a, b, c) {
  const s1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const s2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
  const s3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
  const hasNeg = s1 < -1e-8 || s2 < -1e-8 || s3 < -1e-8;
  const hasPos = s1 > 1e-8 || s2 > 1e-8 || s3 > 1e-8;
  return !(hasNeg && hasPos);
}

function ensureCCW(pts) {
  const copy = pts.map((p) => ({ x: p.x, y: p.y }));
  if (signedArea(copy) < 0) copy.reverse();
  return copy;
}

function simplify(points, epsilon) {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distPointSeg(points[i].x, points[i].y, points[a].x, points[a].y, points[b].x, points[b].y);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push({ x: points[i].x, y: points[i].y });
  return out;
}

function simplifyClosed(points, epsilon) {
  const ring = (closedRing(points) || points).map((p) => ({ x: p.x, y: p.y }));
  if (ring.length < 3) return ring;
  let ia = 0;
  let ib = 1;
  let best = -1;
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const d = dist(ring[i], ring[j]);
      if (d > best) {
        best = d;
        ia = i;
        ib = j;
      }
    }
  }
  const keep = new Array(ring.length).fill(false);
  keep[ia] = true;
  keep[ib] = true;
  const walk = (a, b) => {
    const n = ring.length;
    let maxD = 0;
    let idx = -1;
    for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) {
      const d = distPointSeg(ring[i].x, ring[i].y, ring[a].x, ring[a].y, ring[b].x, ring[b].y);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = true;
      walk(a, idx);
      walk(idx, b);
    }
  };
  walk(ia, ib);
  walk(ib, ia);
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  return out;
}

function selfIntersects(pts, closed) {
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < last; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (closed && i === 0 && j === last - 1) continue;
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];
      if (segmentsCross(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsCross(a, b, c, d) {
  function side(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }
  const s1 = side(a, b, c);
  const s2 = side(a, b, d);
  const s3 = side(c, d, a);
  const s4 = side(c, d, b);
  return s1 * s2 < 0 && s3 * s4 < 0;
}

function isClosedStroke(pts) {
  if (pts.length < 4) return false;
  const span = dist(pts[0], pts[pts.length - 1]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return span < tuneCode("close", CIRCLE_CLOSE) || (len > 0.8 && span < len * tuneCode("closeFrac", 0.22));
}

function triangulate(pts) {
  const v = pts.map((p) => ({ x: p.x, y: p.y }));
  const tris = [];
  let guard = 0;
  while (v.length > 3 && guard++ < 800) {
    let clipped = false;
    for (let i = 0; i < v.length; i++) {
      const a = v[(i + v.length - 1) % v.length];
      const b = v[i];
      const c = v[(i + 1) % v.length];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 1e-7) continue;
      let ear = true;
      for (let j = 0; j < v.length; j++) {
        if (j === i || v[j] === a || v[j] === c) continue;
        if (pointInTri(v[j], a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      tris.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: c.x, y: c.y }]);
      v.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return [];
  }
  if (v.length === 3) tris.push(v.map((p) => ({ x: p.x, y: p.y })));
  return tris;
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function turnAngle(a, b, c) {
  const ix = b.x - a.x;
  const iy = b.y - a.y;
  const ox = c.x - b.x;
  const oy = c.y - b.y;
  return Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy);
}

function armAngle(prev, cur, next) {
  const v1x = prev.x - cur.x;
  const v1y = prev.y - cur.y;
  const v2x = next.x - cur.x;
  const v2y = next.y - cur.y;
  return Math.atan2(Math.abs(v1x * v2y - v1y * v2x), v1x * v2x + v1y * v2y);
}

function isConvex(pts) {
  if (pts.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-8) continue;
    const s = cr > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

function pruneByTurn(pts, maxDeg) {
  const limit = maxDeg * Math.PI / 180;
  const cur = pts.map((p) => ({ x: p.x, y: p.y }));
  let guard = 0;
  while (cur.length > 3 && guard++ < 48) {
    let bestI = -1;
    let best = Infinity;
    for (let i = 0; i < cur.length; i++) {
      const turn = Math.abs(turnAngle(cur[(i + cur.length - 1) % cur.length], cur[i], cur[(i + 1) % cur.length]));
      if (turn < best) {
        best = turn;
        bestI = i;
      }
    }
    if (bestI < 0 || best >= limit) break;
    cur.splice(bestI, 1);
  }
  return cur;
}

function interiorAngles(pts) {
  const ccw = ensureCCW(pts);
  const out = [];
  for (let i = 0; i < ccw.length; i++) {
    const turn = turnAngle(ccw[(i + ccw.length - 1) % ccw.length], ccw[i], ccw[(i + 1) % ccw.length]);
    out.push(Math.PI - turn);
  }
  return out;
}

function isRoughRect(pts) {
  if (pts.length !== 4) return false;
  const angs = interiorAngles(pts);
  let dev = 0;
  for (const ang of angs) {
    if (ang < tuneCode("rectMinAng", 55 * Math.PI / 180) || ang > tuneCode("rectMaxAng", 125 * Math.PI / 180)) return false;
    dev += Math.abs(ang - Math.PI / 2);
  }
  return dev / 4 < tuneCode("rectMeanDev", 28 * Math.PI / 180);
}

function orientedRect(corners, allPts) {
  let best = -1;
  let ang = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const len = dist(a, b);
    if (len > best) {
      best = len;
      ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const src = allPts && allPts.length ? allPts : corners;
  for (const p of src) {
    const u = p.x * c + p.y * s;
    const v = -p.x * s + p.y * c;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  if (maxU - minU < 0.08 || maxV - minV < 0.08) return null;
  const uv = (u, v) => ({ x: u * c - v * s, y: u * s + v * c });
  return [uv(minU, minV), uv(maxU, minV), uv(maxU, maxV), uv(minU, maxV)];
}

function snapTriangle(corners) {
  const pts = corners.map((p) => ({ x: p.x, y: p.y }));
  let bestI = 0;
  let bestDev = Infinity;
  for (let i = 0; i < 3; i++) {
    const dev = Math.abs(armAngle(pts[(i + 2) % 3], pts[i], pts[(i + 1) % 3]) - Math.PI / 2);
    if (dev < bestDev) {
      bestDev = dev;
      bestI = i;
    }
  }
  if (bestDev > tuneCode("triSnap", 22 * Math.PI / 180)) return pts;
  const cur = pts[bestI];
  const prev = pts[(bestI + 2) % 3];
  const next = pts[(bestI + 1) % 3];
  const bax = prev.x - cur.x;
  const bay = prev.y - cur.y;
  const bcx = next.x - cur.x;
  const bcy = next.y - cur.y;
  const cross = bax * bcy - bay * bcx;
  const la = Math.hypot(bax, bay) || 1;
  const lb = Math.hypot(bcx, bcy) || 1;
  const sign = cross >= 0 ? 1 : -1;
  pts[(bestI + 1) % 3] = {
    x: cur.x + (-bay / la) * sign * lb,
    y: cur.y + (bax / la) * sign * lb,
  };
  return pts;
}

function cornerGap(hull, box) {
  let worst = 0;
  for (const c of box) {
    let best = Infinity;
    for (const h of hull) best = Math.min(best, dist(c, h));
    worst = Math.max(worst, best);
  }
  return worst;
}

function rightCornerTol() {
  return tuneCode("rightCorner", RIGHT_CORNER);
}

function anglesNearRight(pts, tol) {
  const limit = tol == null ? rightCornerTol() : tol;
  const angs = interiorAngles(pts);
  return angs.length > 0 && angs.every((a) => Math.abs(a - Math.PI / 2) <= limit);
}

function squareCornerPoint(prev, cur, next) {
  const mx = (prev.x + next.x) / 2;
  const my = (prev.y + next.y) / 2;
  const r = dist(prev, next) / 2;
  if (r < 1e-6) return { x: cur.x, y: cur.y };
  let dx = cur.x - mx;
  let dy = cur.y - my;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    dx = -(next.y - prev.y);
    dy = next.x - prev.x;
    d = Math.hypot(dx, dy) || 1;
  }
  return { x: mx + dx / d * r, y: my + dy / d * r };
}

function squareNearRightCorners(pts) {
  if (!pts || pts.length < 3) return pts;
  let out = ensureCCW(pts.map((p) => ({ x: p.x, y: p.y })));
  const tol = rightCornerTol();
  if (out.length === 4 && anglesNearRight(out, tol)) {
    const box = orientedRect(out, out);
    if (box) return ensureCCW(box);
  }
  for (let pass = 0; pass < 3; pass++) {
    const angs = interiorAngles(out);
    let moved = false;
    const next = out.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(angs[i] - Math.PI / 2) > tol) continue;
      if (Math.abs(angs[i] - Math.PI / 2) < 1e-4) continue;
      const prev = out[(i + out.length - 1) % out.length];
      const cur = out[i];
      const nxt = out[(i + 1) % out.length];
      next[i] = squareCornerPoint(prev, cur, nxt);
      moved = true;
    }
    out = ensureCCW(next);
    if (!moved) break;
  }
  if (out.length === 4 && anglesNearRight(out, tol)) {
    const box = orientedRect(out, out);
    if (box) return ensureCCW(box);
  }
  return out;
}

function dirParallelAng(ax, ay, bx, by) {
  const la = Math.hypot(ax, ay) || 1;
  const lb = Math.hypot(bx, by) || 1;
  let c = Math.abs((ax * bx + ay * by) / (la * lb));
  c = Math.max(-1, Math.min(1, c));
  return Math.acos(c);
}

function oppositeSidesParallel(pts, pair, tol) {
  const a = pts[pair];
  const b = pts[(pair + 1) % 4];
  const c = pts[(pair + 2) % 4];
  const d = pts[(pair + 3) % 4];
  return dirParallelAng(b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y) <= tol;
}

function bothPairsParallel(pts, tol) {
  return oppositeSidesParallel(pts, 0, tol) && oppositeSidesParallel(pts, 1, tol);
}

function quadSize(pts) {
  const area = Math.abs(signedArea(pts));
  const diag = Math.max(dist(pts[0], pts[2]), dist(pts[1], pts[3]));
  return Math.max(Math.sqrt(Math.max(area, 0)), diag * 0.5, 0.4);
}

function cornerShift(src, dst) {
  let max = 0;
  for (let i = 0; i < 4; i++) {
    const d = dist(src[i], dst[i]);
    if (d > max) max = d;
  }
  return max;
}

function alignQuad(src, dst) {
  const dccw = ensureCCW(dst.map((p) => ({ x: p.x, y: p.y })));
  let best = dccw;
  let bestE = Infinity;
  for (let s = 0; s < 4; s++) {
    const cand = [0, 1, 2, 3].map((i) => dccw[(s + i) % 4]);
    const e = cornerShift(src, cand);
    if (e < bestE) {
      bestE = e;
      best = cand;
    }
  }
  return best;
}

function makeParallelogram(pts) {
  const c = {
    x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4,
    y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4,
  };
  const s0x = ((pts[1].x - pts[0].x) + (pts[2].x - pts[3].x)) / 2;
  const s0y = ((pts[1].y - pts[0].y) + (pts[2].y - pts[3].y)) / 2;
  const s1x = ((pts[2].x - pts[1].x) + (pts[3].x - pts[0].x)) / 2;
  const s1y = ((pts[2].y - pts[1].y) + (pts[3].y - pts[0].y)) / 2;
  return [
    { x: c.x - s0x / 2 - s1x / 2, y: c.y - s0y / 2 - s1y / 2 },
    { x: c.x + s0x / 2 - s1x / 2, y: c.y + s0y / 2 - s1y / 2 },
    { x: c.x + s0x / 2 + s1x / 2, y: c.y + s0y / 2 + s1y / 2 },
    { x: c.x - s0x / 2 + s1x / 2, y: c.y - s0y / 2 + s1y / 2 },
  ];
}

function makeRightTrapezoid(pts, i) {
  const P0 = pts[i];
  const P1 = pts[(i + 1) % 4];
  const P2 = pts[(i + 2) % 4];
  const P3 = pts[(i + 3) % 4];
  const hx = P1.x - P0.x;
  const hy = P1.y - P0.y;
  const hlen = Math.hypot(hx, hy);
  if (hlen < 0.08) return null;
  const tx = -hy / hlen;
  const ty = hx / hlen;
  const s3 = (P3.x - P0.x) * tx + (P3.y - P0.y) * ty;
  const s2 = (P2.x - P1.x) * tx + (P2.y - P1.y) * ty;
  if (s3 * s2 < 0) return null;
  if (Math.abs(s3) < 0.08 && Math.abs(s2) < 0.08) return null;
  const out = [null, null, null, null];
  out[i] = { x: P0.x, y: P0.y };
  out[(i + 1) % 4] = { x: P1.x, y: P1.y };
  out[(i + 2) % 4] = { x: P1.x + tx * s2, y: P1.y + ty * s2 };
  out[(i + 3) % 4] = { x: P0.x + tx * s3, y: P0.y + ty * s3 };
  if (!isConvex(out) || Math.abs(signedArea(out)) < 0.04) return null;
  return out;
}

function makeIsoTrapezoid(pts, pair) {
  const P = [0, 1, 2, 3].map((k) => pts[(pair + k) % 4]);
  const b0x = P[1].x - P[0].x;
  const b0y = P[1].y - P[0].y;
  const b1x = P[2].x - P[3].x;
  const b1y = P[2].y - P[3].y;
  const l0 = Math.hypot(b0x, b0y);
  const l1 = Math.hypot(b1x, b1y);
  if (l0 < 0.08 || l1 < 0.08) return null;
  let bx = b0x / l0 + b1x / l1;
  let by = b0y / l0 + b1y / l1;
  let bl = Math.hypot(bx, by);
  if (bl < 1e-6) {
    bx = b0x / l0;
    by = b0y / l0;
    bl = 1;
  }
  bx /= bl;
  by /= bl;
  const hx = -by;
  const hy = bx;
  const projB = (p) => p.x * bx + p.y * by;
  const projH = (p) => p.x * hx + p.y * hy;
  const hBot = 0.5 * (projH(P[0]) + projH(P[1]));
  const hTop = 0.5 * (projH(P[2]) + projH(P[3]));
  if (Math.abs(hTop - hBot) < 0.08) return null;
  const midB = 0.25 * (projB(P[0]) + projB(P[1]) + projB(P[2]) + projB(P[3]));
  const half0 = l0 / 2;
  const half1 = l1 / 2;
  const fromBH = (pb, ph) => ({ x: bx * pb + hx * ph, y: by * pb + hy * ph });
  const flip = projB(P[0]) > projB(P[1]);
  const Q0 = fromBH(midB + (flip ? half0 : -half0), hBot);
  const Q1 = fromBH(midB + (flip ? -half0 : half0), hBot);
  const Q2 = fromBH(midB + (flip ? -half1 : half1), hTop);
  const Q3 = fromBH(midB + (flip ? half1 : -half1), hTop);
  const out = [null, null, null, null];
  out[pair] = Q0;
  out[(pair + 1) % 4] = Q1;
  out[(pair + 2) % 4] = Q2;
  out[(pair + 3) % 4] = Q3;
  if (!isConvex(out) || Math.abs(signedArea(out)) < 0.04) return null;
  return out;
}

function fitRectangle(pts, raw, force) {
  if (!force && !anglesNearRight(pts)) return null;
  const box = orientedRect(pts, (force && raw && raw.length) ? raw : pts);
  if (!box) return null;
  const aligned = alignQuad(pts, box);
  if (!isConvex(aligned)) return null;
  return { kind: "rect", corners: aligned, error: cornerShift(pts, aligned) };
}

function fitRamp(pts, force) {
  const tol = rightCornerTol();
  const angs = interiorAngles(pts);
  const cands = [];
  for (let i = 0; i < 4; i++) {
    const a0 = Math.abs(angs[i] - Math.PI / 2);
    const a1 = Math.abs(angs[(i + 1) % 4] - Math.PI / 2);
    if (!force && (a0 > tol || a1 > tol)) continue;
    const built = makeRightTrapezoid(pts, i);
    if (!built) continue;
    cands.push({ kind: "ramp", corners: built, error: cornerShift(pts, built) });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.error - b.error);
  return cands[0];
}

function fitParallelogram(pts, force) {
  const tol = tuneCode("quadParallel", QUAD_PARALLEL);
  if (!force && !bothPairsParallel(pts, tol)) return null;
  const built = makeParallelogram(pts);
  if (!built || !isConvex(built)) return null;
  return { kind: "para", corners: built, error: cornerShift(pts, built) };
}

function fitIsoTrapezoid(pts, force) {
  const parTol = tuneCode("quadParallel", QUAD_PARALLEL);
  const symTol = tuneCode("quadSymmetry", QUAD_SYMMETRY);
  const angs = interiorAngles(pts);
  const cands = [];
  for (let pair = 0; pair < 2; pair++) {
    if (!force && !oppositeSidesParallel(pts, pair, parTol)) continue;
    const dBot = Math.abs(angs[pair] - angs[(pair + 1) % 4]);
    const dTop = Math.abs(angs[(pair + 2) % 4] - angs[(pair + 3) % 4]);
    if (!force && Math.max(dBot, dTop) > symTol) continue;
    const built = makeIsoTrapezoid(pts, pair);
    if (!built) continue;
    cands.push({ kind: "trap", corners: built, error: cornerShift(pts, built) });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.error - b.error);
  return cands[0];
}

const QUAD_PRIORITY = { rect: 0, ramp: 1, para: 2, trap: 3, free: 4 };

function pickQuadCandidate(list) {
  const copy = list.slice();
  copy.sort((a, b) => (QUAD_PRIORITY[a.kind] - QUAD_PRIORITY[b.kind]) || (a.error - b.error));
  return copy[0];
}

function regularizeQuad(corners, rawPts, force) {
  const src = ensureCCW(corners.map((p) => ({ x: p.x, y: p.y })));
  if (src.length !== 4) return { kind: "free", corners: squareNearRightCorners(src), error: 0 };
  const size = quadSize(src);
  const maxShift = size * tuneCode("quadMaxShift", QUAD_MAX_SHIFT);
  const cands = [];
  const rect = fitRectangle(src, rawPts, false);
  if (rect) cands.push(rect);
  const ramp = fitRamp(src, false);
  if (ramp) cands.push(ramp);
  const para = fitParallelogram(src, false);
  if (para) cands.push(para);
  const trap = fitIsoTrapezoid(src, false);
  if (trap) cands.push(trap);
  const ok = cands.filter((c) => c.error <= maxShift);
  if (ok.length) return pickQuadCandidate(ok);
  if (force) {
    const forced = [];
    const rectF = fitRectangle(src, rawPts, true);
    if (rectF) forced.push(rectF);
    const rampF = fitRamp(src, true);
    if (rampF) forced.push(rampF);
    const paraF = fitParallelogram(src, true);
    if (paraF) forced.push(paraF);
    const trapF = fitIsoTrapezoid(src, true);
    if (trapF) forced.push(trapF);
    if (forced.length) return pickQuadCandidate(forced);
  }
  return { kind: "free", corners: squareNearRightCorners(src), error: 0 };
}

function cornerPeaks(pts, minDeg) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return [];
  const samples = resampleRing(ring, Math.max(64, ring.length * 3));
  if (!samples || samples.length < 8) return [];
  const n = samples.length;
  const minTurn = (minDeg == null ? 32 : minDeg) * Math.PI / 180;
  const win = Math.max(1, Math.round(n * 0.03));
  const turns = [];
  for (let i = 0; i < n; i++) {
    const prev = samples[(i - win + n) % n];
    const cur = samples[i];
    const nxt = samples[(i + win) % n];
    turns.push(turnAngle(prev, cur, nxt));
  }
  const peaks = [];
  for (let i = 0; i < n; i++) {
    const a = Math.abs(turns[(i + n - 1) % n]);
    const b = Math.abs(turns[i]);
    const c = Math.abs(turns[(i + 1) % n]);
    if (b >= a && b >= c && b >= minTurn) peaks.push({ i, turn: b, p: samples[i] });
  }
  const merged = [];
  const minSep = Math.max(4, Math.round(n / 16));
  peaks.sort((u, v) => v.turn - u.turn);
  for (const pk of peaks) {
    if (merged.some((m) => Math.min((pk.i - m.i + n) % n, (m.i - pk.i + n) % n) < minSep)) continue;
    merged.push(pk);
  }
  merged.sort((u, v) => u.i - v.i);
  return merged.map((pk) => ({ x: pk.p.x, y: pk.p.y }));
}

function mergeCornerSets(a, b, minDist) {
  const out = (a || []).map((p) => ({ x: p.x, y: p.y }));
  for (const p of (b || [])) {
    if (out.some((q) => dist(p, q) < minDist)) continue;
    out.push({ x: p.x, y: p.y });
  }
  if (out.length < 3) return out;
  const c = polygonCentroid(out) || { x: 0, y: 0 };
  out.sort((p, q) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(q.y - c.y, q.x - c.x));
  return ensureCCW(out);
}

function nearestRingIndex(ring, p) {
  let best = 0;
  let bestD = 1e9;
  for (let i = 0; i < ring.length; i++) {
    const d = dist(ring[i], p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function edgeBulge(a, b, stroke) {
  const ring = closedRing(stroke);
  if (!ring || ring.length < 2) return 0;
  const n = ring.length;
  const ia = nearestRingIndex(ring, a);
  const ib = nearestRingIndex(ring, b);
  if (ia === ib) return 0;
  let best = 0;
  for (let i = (ia + 1) % n; i !== ib; i = (i + 1) % n) {
    const p = ring[i];
    const d = distPointSeg(p.x, p.y, a.x, a.y, b.x, b.y);
    if (d > best) best = d;
  }
  return best;
}

function edgesAreStraight(corners, stroke) {
  if (!corners || corners.length < 3) return false;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const len = dist(a, b);
    if (len < 0.12) return false;
    if (edgeBulge(a, b, stroke) > Math.max(0.16, len * 0.16)) return false;
  }
  return true;
}

function cornersFromStroke(pts) {
  const ring = ensureCCW(dedupe(closedRing(pts) || pts));
  if (ring.length < 3) return [];
  const eps = Math.max(tuneCode("simplify", 0.045), 0.05);
  let simple = simplifyClosed(ring, eps);
  if (simple.length > 4) simple = pruneByTurn(simple, tuneCode("pruneTurn", 25));
  if (simple.length > 4 && simple.length <= 8) {
    const softer = pruneByTurn(simple, tuneCode("pruneSoft", 42));
    if (softer.length === 3 || softer.length === 4) simple = softer;
  }
  const peaks = cornerPeaks(ring, 32);
  if ((simple.length < 3 || simple.length > 4) && (peaks.length === 3 || peaks.length === 4)) {
    simple = ensureCCW(peaks);
  } else if (simple.length > 4 && peaks.length >= 3 && peaks.length <= 4) {
    const mixed = mergeCornerSets(simple, peaks, Math.max(0.18, ringLen(ring) * 0.04));
    const pruned = mixed.length > 4 ? pruneByTurn(mixed, tuneCode("pruneSoft", 42)) : mixed;
    if (pruned.length === 3 || pruned.length === 4) simple = ensureCCW(pruned);
  }
  return simple;
}

function recognizePolygon(pts) {
  if (!pts || pts.length < 3) return null;
  let ring = closedRing(pts);
  if (!ring || ring.length < 3) return null;
  if (dist(ring[0], ring[ring.length - 1]) > 0.02 && isClosedStroke(pts)) {
    ring = ring.map((p) => ({ x: p.x, y: p.y }));
  }
  const area2 = Math.abs(signedArea(ensureCCW(ring)));
  if (area2 < 0.05) return null;
  if (selfIntersects(ring, true)) return null;
  const hull = ensureCCW(convexHull(ring));
  const hArea = Math.abs(signedArea(hull));
  if (hArea < 1e-4 || area2 / hArea < tuneCode("hullFill", 0.7)) return null;
  let corners = cornersFromStroke(ring);
  if (!(corners.length === 3 || corners.length === 4)) return null;
  if (!isConvex(corners)) return null;
  const angs = interiorAngles(corners);
  if (angs.some((a) => a < 22 * Math.PI / 180 || a > 158 * Math.PI / 180)) return null;
  if (!edgesAreStraight(corners, ring)) return null;
  corners = ensureCCW(corners);
  if (corners.length === 3) return { kind: "tri", corners: ensureCCW(snapTriangle(corners)) };
  const quad = regularizeQuad(corners, ring, strokeSnaps());
  return { kind: "quad", quadKind: quad.kind, corners: ensureCCW(quad.corners) };
}
function snapPolygonPose(pts) {
  if (!strokeSnaps() || !pts || pts.length < 3) return pts;
  const c = polygonCentroid(pts);
  if (!c) return pts;
  const g = snapDrawPoint(c);
  const dx = g.x - c.x;
  const dy = g.y - c.y;
  if (Math.hypot(dx, dy) < 1e-6) return pts;
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function regularizeClosed(pts) {
  const rec = recognizePolygon(pts);
  if (rec) return rec.corners;
  const src = ensureCCW(dedupe(pts));
  if (src.length < 3 || Math.abs(signedArea(src)) < 0.04) return src;
  const hull = ensureCCW(convexHull(src));
  if (hull.length < 3) return squareNearRightCorners(src);
  const area = Math.abs(signedArea(src));
  const hArea = Math.abs(signedArea(hull));
  if (hArea < 1e-4 || area / hArea < tuneCode("hullFill", 0.7)) return squareNearRightCorners(src);
  let shape = pruneByTurn(hull, tuneCode("pruneTurn", 25));
  if (shape.length > 4 && shape.length <= 6) {
    const softer = pruneByTurn(shape, tuneCode("pruneSoft", 42));
    if ((softer.length === 4 && anglesNearRight(softer)) || softer.length === 3) shape = softer;
  }
  if (shape.length === 4) {
    const quad = regularizeQuad(shape, src, strokeSnaps());
    return ensureCCW(quad.corners);
  }
  if (shape.length === 3) return ensureCCW(snapTriangle(shape));
  if (shape.length > 4) {
    const box = orientedRect(hull, src);
    if (box && anglesNearRight(box, rightCornerTol() * 1.5)) {
      const bArea = Math.abs(signedArea(box));
      const shortSide = Math.min(dist(box[0], box[1]), dist(box[1], box[2]));
      if (bArea > 1e-4 && hArea / bArea > tuneCode("boxFill", 0.9) && cornerGap(hull, box) < shortSide * tuneCode("boxGap", 0.16)) {
        return ensureCCW(box);
      }
    }
  }
  return squareNearRightCorners(src);
}

function straightenOpen(pts) {
  const clean = pts.map((p) => ({ x: p.x, y: p.y }));
  if (clean.length < 3) return clean;
  const a = clean[0];
  const b = clean[clean.length - 1];
  const len = dist(a, b);
  if (len < 0.12) return clean;
  let maxD = 0;
  for (let i = 1; i < clean.length - 1; i++) {
    maxD = Math.max(maxD, distPointSeg(clean[i].x, clean[i].y, a.x, a.y, b.x, b.y));
  }
  // Hand wobble on a straight stroke stays under this. A deliberate bend is larger.
  if (maxD <= Math.max(0.28, len * 0.08)) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  return clean;
}

// Kreiserkennung. Umrandung wird nach Bogenlänge gleichmäßig abgetastet,
// der Mittelpunkt ist der Flächenschwerpunkt. Hauptkriterium: relative
// Radiusstreuung std(r)/mean(r) unter CIRCLE_MAX_CV. Dazu die Eckenregel,
// damit gleichmäßige Vielecke und Felsbrocken eckig bleiben.
// Mit Geodreieck: Während des Zeichnens gibt es keinen Raster-Snap, die
// Vorschau bleibt der Rohzug. Nach dem Loslassen wird zuerst der Ellipsen-
// bzw. Kreis-Fit auf den Rohpunkten geprüft (Hauptachsen per Kovarianz/PCA).
// Residuum ist die relative Streuung der elliptischen Radien (CV-artig)
// unter ELLIPSE_MAX_CV. Eine Ellipse entsteht erst, wenn die Achsen um mehr
// als (1 - ELLIPSE_CIRCLE_RATIO)*a + ELLIPSE_EXTRA_GAP (eine Rasterweite)
// auseinanderliegen, sonst ein Kreis mit r=(a+b)/2.
// 3- und 4-Ecke werden immer zuerst auf dem Rohzug erkannt (Ecken über
// geschlossenes Douglas-Peucker und Krümmungsspitzen, unabhängig vom
// Startpunkt). Ein erkanntes Viereck behält seine Drehung; mit Geodreieck
// wird es nicht auf das achsenparallele Raster in Treppen zerlegt
// (höchstens der Schwerpunkt rastet, die Kantenrichtungen bleiben).
// Jede erkannte Ecke zwischen 80 und 100 Grad wird exakt 90 Grad, mit und ohne
// Geodreieck. Vier solche Ecken ergeben ein exaktes gedrehtes Rechteck.
// Kreis und Ellipse werden uebersprungen, wenn 3-4 klare Ecken vorliegen.
// Erst wenn keine Ellipse/kein Kreis und kein 3-/4-Eck entsteht, rastet
// eine eckige Form auf das Raster ein. Ohne Geodreieck nur Kreise;
// Felsen und schiefe Dreiecke bleiben unregelmäßig, außer 75–105°-Ecken.
const CIRCLE_MAX_CV = 0.12;                   // std(r)/mean(r), kalibriert an krakeligen Kreisen und 1:2-Ovalen
const CIRCLE_SAMPLES = 64;                    // Abtastpunkte entlang der Umrandung
const CIRCLE_MAX_CORNER = 45 * Math.PI / 180; // rad, scharfe Ecke ohne Geodreieck
const CIRCLE_TURN_WIN = 0.25;                 // Fensterlänge als Vielfaches von r
const CIRCLE_RIGHT_TOL = 10 * Math.PI / 180;  // Geodreieck: Toleranz für 90°
const RIGHT_CORNER = 15 * Math.PI / 180;      // Ecke 75-105° wird exakt 90°, drehunabhängig
const CIRCLE_MIN_R = 0.16;
const CIRCLE_MAX_R = 4;
const CIRCLE_MIN_PTS = 5;
const CIRCLE_CLOSE = 0.7;                     // Enden dürfen so weit offen sein
const ELLIPSE_MAX_CV = 0.12;                  // Residuum am Ellipsenrand, analog zu CIRCLE_MAX_CV
const ELLIPSE_CIRCLE_RATIO = 0.85;            // Anteil: Ellipse braucht a-b > (1-ratio)*a + ELLIPSE_EXTRA_GAP
const ELLIPSE_EXTRA_GAP = GEO_GRID;           // Zusatzabstand der Radien, 1 Rasterweite (0,5 m)
const ELLIPSE_PHYS_VERTS = 16;                // Physik-Polygon; über maxPolygonVertices wird zerlegt
const QUAD_PARALLEL = 12 * Math.PI / 180;     // gegenüberliegende Seiten gelten als parallel
const QUAD_SYMMETRY = 14 * Math.PI / 180;     // Basiswinkel eines gleichschenkligen Trapezes
const QUAD_MAX_SHIFT = 0.18;                  // max. Eckenverschiebung relativ zur Größe


// Parameter-Bildschirm (?tune=1). Ohne diesen Modus gelten immer die Konstanten oben.
const TUNE_STORE = "crayon-tune-v1";
const DRAG_FREQ = 5;                         // MouseJoint-Frequenz, weich genug gegen Peitschen
const DRAG_DAMPING = 0.85;                    // nahezu kritische Dämpfung
const DRAG_FORCE_G = 8;                       // maxForce = Masse * 24 * Faktor
const DRAG_ANG_DAMP = 0.6;                    // mäßige Winkeldämpfung nur während des Ziehens
const DRAG_MAX_V = 22;                        // m/s, Deckel für die Greifpunkt-Geschwindigkeit
const GRAB_EDGE = 0.35;                       // m, Randzone: Abstand zur Kontur, sofort greifen
const GRAB_ADOPT = 0.8;                       // m, Zug aus der Innenfläche wird zum Griff
const GRAB_MIN_INTERIOR = 0.15;               // zusätzlicher Inkreis, damit ein Kringel Platz hat
const TUNE_SPEC = [
  { group: "Kreis", key: "maxCv", label: "Radiusstreuung", min: 0.02, max: 0.30, step: 0.005, def: CIRCLE_MAX_CV, fmt: (v) => (v * 100).toFixed(1) + " %" },
  { group: "Kreis", key: "samples", label: "Abtastpunkte", min: 16, max: 128, step: 8, def: CIRCLE_SAMPLES, int: true },
  { group: "Kreis", key: "maxCorner", label: "Max. Eckenwinkel", min: 10, max: 90, step: 1, def: CIRCLE_MAX_CORNER * 180 / Math.PI, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Kreis", key: "turnWin", label: "Eckenfenster × r", min: 0.10, max: 0.60, step: 0.01, def: CIRCLE_TURN_WIN, fmt: (v) => v.toFixed(2) },
  { group: "Kreis", key: "minPts", label: "Min. Ecken (Geo)", min: 3, max: 10, step: 1, def: CIRCLE_MIN_PTS, int: true },
  { group: "Kreis", key: "close", label: "Offenes Ende", min: 0.2, max: 1.5, step: 0.05, def: CIRCLE_CLOSE, fmt: (v) => v.toFixed(2) + " m" },
  { group: "Kreis", key: "closeFrac", label: "Offen / Länge", min: 0.08, max: 0.40, step: 0.01, def: 0.22, fmt: (v) => (v * 100).toFixed(0) + " %" },
  { group: "Kreis", key: "minR", label: "Min. Radius", min: 0.08, max: 0.80, step: 0.02, def: CIRCLE_MIN_R, fmt: (v) => v.toFixed(2) + " m" },
  { group: "Kreis", key: "maxR", label: "Max. Radius", min: 1, max: 8, step: 0.2, def: CIRCLE_MAX_R, fmt: (v) => v.toFixed(1) + " m" },
  { group: "Ellipse (Geodreieck)", key: "ellMaxCv", label: "Ellipsen-Residuum", min: 0.02, max: 0.30, step: 0.005, def: ELLIPSE_MAX_CV, fmt: (v) => (v * 100).toFixed(1) + " %" },
  { group: "Ellipse (Geodreieck)", key: "ellCircleRatio", label: "Kreisgrenze b/a", min: 0.30, max: 0.98, step: 0.01, def: ELLIPSE_CIRCLE_RATIO, fmt: (v) => v.toFixed(2) },
  { group: "Ellipse (Geodreieck)", key: "ellExtraGap", label: "Zusatzabstand der Radien", min: 0, max: 3, step: 0.25, def: 1, fmt: (v) => Number(v).toFixed(2) + " Raster (" + (Number(v) * GEO_GRID).toFixed(2) + " m)", toCode: (d) => d * GEO_GRID },
  { group: "Ellipse (Geodreieck)", key: "rightTol", label: "90°-Toleranz", min: 2, max: 25, step: 1, def: CIRCLE_RIGHT_TOL * 180 / Math.PI, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Ellipse (Geodreieck)", key: "ellVerts", label: "Physik-Ecken", min: 8, max: 24, step: 1, def: ELLIPSE_PHYS_VERTS, int: true },
  { group: "Vieleck / Dreieck", key: "simplify", label: "Vereinfachen", min: 0.01, max: 0.12, step: 0.005, def: 0.045, fmt: (v) => v.toFixed(3) + " m" },
  { group: "Vieleck / Dreieck", key: "pruneTurn", label: "Ecken glätten", min: 8, max: 45, step: 1, def: 25, int: true, unit: "°" },
  { group: "Vieleck / Dreieck", key: "pruneSoft", label: "Weich glätten", min: 20, max: 70, step: 1, def: 42, int: true, unit: "°" },
  { group: "Vieleck / Dreieck", key: "rectMinAng", label: "Rechteck min. Winkel", min: 40, max: 80, step: 1, def: 55, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Vieleck / Dreieck", key: "rectMaxAng", label: "Rechteck max. Winkel", min: 100, max: 140, step: 1, def: 125, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Vieleck / Dreieck", key: "rectMeanDev", label: "Rechteck mittl. Abweichung", min: 8, max: 45, step: 1, def: 28, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Vieleck / Dreieck", key: "triSnap", label: "Dreieck 90° einrasten", min: 5, max: 40, step: 1, def: 22, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Vieleck / Dreieck", key: "rightCorner", label: "Rechtwinkel-Toleranz", min: 4, max: 25, step: 1, def: 15, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Vieleck / Dreieck", key: "quadParallel", label: "Parallel-Toleranz", min: 4, max: 25, step: 1, def: 12, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Vieleck / Dreieck", key: "quadSymmetry", label: "Symmetrie-Toleranz", min: 4, max: 30, step: 1, def: 14, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Vieleck / Dreieck", key: "quadMaxShift", label: "Max. Eckenverschiebung", min: 0.06, max: 0.35, step: 0.01, def: QUAD_MAX_SHIFT, fmt: (v) => (Number(v) * 100).toFixed(0) + " % der Größe" },
  { group: "Vieleck / Dreieck", key: "hullFill", label: "Füllung zur Hülle", min: 0.50, max: 0.95, step: 0.01, def: 0.7, fmt: (v) => (v * 100).toFixed(0) + " %" },
  { group: "Vieleck / Dreieck", key: "boxFill", label: "Füllung zum Rechteck", min: 0.70, max: 0.99, step: 0.01, def: 0.9, fmt: (v) => (v * 100).toFixed(0) + " %" },
  { group: "Vieleck / Dreieck", key: "boxGap", label: "Eckenabstand / kurze Seite", min: 0.04, max: 0.30, step: 0.01, def: 0.16, fmt: (v) => (v * 100).toFixed(0) + " %" },
  { group: "Seil", key: "ropeCutAngle", label: "Schnitt-Spitze", min: 5, max: 30, step: 1, def: 15, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Seil", key: "ropeCutAlign", label: "Senkrecht-Toleranz", min: 10, max: 45, step: 1, def: 30, int: true, unit: "°", toCode: (d) => d * Math.PI / 180 },
  { group: "Seil", key: "ropeCutSpeed", label: "Schnitt-Mindesttempo", min: 0.5, max: 8, step: 0.25, def: 2.5, fmt: (v) => Number(v).toFixed(2) + " m/s" },
  { group: "Griff", key: "dragFreq", label: "Griff-Steifigkeit", min: 1, max: 12, step: 0.5, def: DRAG_FREQ, fmt: (v) => Number(v).toFixed(1) + " Hz" },
  { group: "Griff", key: "dragDamp", label: "Griff-Dämpfung", min: 0.2, max: 1.5, step: 0.05, def: DRAG_DAMPING, fmt: (v) => Number(v).toFixed(2) },
  { group: "Griff", key: "dragForceG", label: "Max. Kraft / Gewicht", min: 2, max: 20, step: 0.5, def: DRAG_FORCE_G, fmt: (v) => Number(v).toFixed(1) + " × mg" },
  { group: "Griff", key: "dragAngDamp", label: "Winkeldämpfung", min: 0, max: 2, step: 0.05, def: DRAG_ANG_DAMP, fmt: (v) => Number(v).toFixed(2) },
  { group: "Griff", key: "dragMaxV", label: "Zieltempo", min: 8, max: 40, step: 1, def: DRAG_MAX_V, fmt: (v) => Number(v).toFixed(0) + " m/s" },
  { group: "Griff", key: "grabEdge", label: "Randzone", min: 0.15, max: 0.80, step: 0.05, def: GRAB_EDGE, fmt: (v) => Number(v).toFixed(2) + " m" },
  { group: "Griff", key: "grabAdopt", label: "Nachgreifen ab", min: 0.4, max: 2.0, step: 0.05, def: GRAB_ADOPT, fmt: (v) => Number(v).toFixed(2) + " m" },
  { group: "Stift", key: "penThickMin", label: "Dicke bei leichtem Druck", min: 0.3, max: 1.0, step: 0.05, def: PEN_PRESS_MIN, fmt: (v) => Number(v).toFixed(2) + " ×" },
  { group: "Stift", key: "penThickMax", label: "Dicke bei festem Druck", min: 1.2, max: 4.0, step: 0.1, def: PEN_PRESS_MAX, fmt: (v) => Number(v).toFixed(1) + " ×" },
];
const TUNE_BY_KEY = {};
for (const spec of TUNE_SPEC) TUNE_BY_KEY[spec.key] = spec;

let tuneOn = false;
let tuneVals = {};
let lastTuneInfo = null;

function tuneDefaults() {
  const out = {};
  for (const spec of TUNE_SPEC) out[spec.key] = spec.def;
  return out;
}

function tuneCode(key, fallback) {
  if (!tuneOn) return fallback;
  const spec = TUNE_BY_KEY[key];
  let v = tuneVals[key];
  if (v == null || v !== v) v = spec ? spec.def : fallback;
  if (spec) {
    v = Math.min(spec.max, Math.max(spec.min, Number(v)));
    if (spec.int) v = Math.round(v);
    if (spec.toCode) return spec.toCode(v);
  }
  return v;
}

function loadTuneVals() {
  const next = tuneDefaults();
  try {
    const raw = localStorage.getItem(TUNE_STORE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const spec of TUNE_SPEC) {
          if (parsed[spec.key] == null || parsed[spec.key] !== parsed[spec.key]) continue;
          next[spec.key] = Math.min(spec.max, Math.max(spec.min, Number(parsed[spec.key])));
          if (spec.int) next[spec.key] = Math.round(next[spec.key]);
        }
      }
    }
  } catch (err) { /* localStorage darf fehlen */ }
  tuneVals = next;
}

function saveTuneVals() {
  if (!tuneOn) return;
  try { localStorage.setItem(TUNE_STORE, JSON.stringify(tuneVals)); } catch (err) { /* ignorieren */ }
}

function setTuneFromPanel(key, raw) {
  const spec = TUNE_BY_KEY[key];
  if (!spec) return;
  let v = Number(raw);
  if (v !== v) v = spec.def;
  v = Math.min(spec.max, Math.max(spec.min, v));
  if (spec.int) v = Math.round(v);
  tuneVals[key] = v;
  saveTuneVals();
  refreshTuneSlider(key);
}

function formatTune(spec, v) {
  if (spec.fmt) return spec.fmt(v);
  if (spec.unit) return (spec.int ? String(Math.round(v)) : Number(v).toFixed(2)) + " " + spec.unit;
  return spec.int ? String(Math.round(v)) : Number(v).toFixed(3);
}

function refreshTuneSlider(key) {
  const spec = TUNE_BY_KEY[key];
  if (!spec) return;
  const v = tuneVals[key] == null ? spec.def : tuneVals[key];
  const valEl = document.getElementById("tune-val-" + key);
  const sl = document.getElementById("tune-sl-" + key);
  if (valEl) valEl.textContent = formatTune(spec, v);
  if (sl && Number(sl.value) !== Number(v)) sl.value = String(v);
}

function refreshTuneReadout() {
  const el = document.getElementById("tune-readout");
  if (!el) return;
  const info = lastTuneInfo;
  if (!info) {
    el.textContent = "Zuletzt: noch nichts gezeichnet.";
    return;
  }
  const lines = [];
  lines.push("Zuletzt: " + info.kindName + (info.geo ? "  (Geodreieck an)" : "  (Geodreieck aus)"));
  if (info.circ) lines.push("Kreis-CV: " + (info.circ.cv * 100).toFixed(1) + " %   r=" + info.circ.r.toFixed(2) + " m");
  if (info.ell) {
    lines.push("Ellipsen-CV: " + (info.ell.cv * 100).toFixed(1) + " %   a=" + info.ell.a.toFixed(2) + "  b=" + info.ell.b.toFixed(2) + "  a-b=" + (info.ell.a - info.ell.b).toFixed(2) + "  b/a=" + (info.ell.b / info.ell.a).toFixed(2));
    lines.push("Drehwinkel: " + (info.ell.angle * 180 / Math.PI).toFixed(1) + "°");
  }
  if (info.verts) {
    const ang = (info.angs || []).map((a) => a.toFixed(0) + "°").join(", ");
    lines.push("Ecken: " + info.verts + (ang ? "   Winkel: " + ang : ""));
  }
  el.textContent = lines.join("\n");
}

function noteTuneResult(rawPts, result) {
  const ring = rawPts && rawPts.length ? closedRing(dedupe(rawPts)) : null;
  let circ = null;
  let ell = null;
  if (ring && ring.length >= 3) {
    try { circ = circleFromPoints(ring); } catch (err) { circ = null; }
    try { ell = ellipseFromPoints(ring); } catch (err) { ell = null; }
  }
  let verts = 0;
  let angs = [];
  if (result && result.meta && result.meta.outline && result.meta.outline.local) {
    verts = result.meta.outline.local.length;
    try { angs = interiorAngles(result.meta.outline.local).map((a) => a * 180 / Math.PI); } catch (err) { angs = []; }
  } else if (result && result.kind === "ellipse") {
    verts = (result.meta && result.meta.outline && result.meta.outline.local) ? result.meta.outline.local.length : 0;
  }
  let kindName = "nichts";
  if (result) {
    if (result.kind === "roller" || result.kind === "blob") kindName = "Kreis";
    else if (result.kind === "ellipse") kindName = "Ellipse";
    else if (result.kind === "solid") kindName = verts === 3 ? "Dreieck" : verts === 4 ? "Viereck" : "Vieleck";
    else if (result.kind === "wire") kindName = "Draht";
    else if (result.kind === "rope") kindName = "Seil";
    else if (result.kind === "pin" || result.host) kindName = "Nagel";
    else kindName = result.kind || "Körper";
  }
  lastTuneInfo = { kindName, circ, ell, verts, angs, geo: !!geoSnap, kind: result && result.kind };
  refreshTuneReadout();
}

function mountTunePanel() {
  if (document.getElementById("tune-panel")) return;
  if (!tuneVals || !Object.keys(tuneVals).length) tuneVals = tuneDefaults();
  const style = document.createElement("style");
  style.textContent = [
    "#tune-panel { position: fixed; z-index: 6; top: 58px; right: 8px; width: min(330px, 92vw);",
    "  max-height: calc(100vh - 70px); overflow: auto; background: rgba(255,252,240,0.96);",
    "  border: 2px solid #5c4632; border-radius: 12px; color: #3a2a1c;",
    "  font: 12px system-ui, sans-serif; box-shadow: 0 8px 24px rgba(60,40,20,0.18);",
    "  touch-action: manipulation; -webkit-user-select: none; user-select: none; }",
    "#tune-panel.collapsed { max-height: none; overflow: visible; }",
    "#tune-panel.collapsed #tune-body { display: none; }",
    "#tune-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px 5px;",
    "  position: sticky; top: 0; background: rgba(255,252,240,0.98); border-bottom: 1px solid rgba(92,70,50,0.18); }",
    "#tune-toggle { flex: 1; text-align: left; font: 600 14px system-ui, sans-serif; background: none; border: 0; color: #3a2a1c; cursor: pointer; padding: 2px 0; }",
    "#tune-head button { touch-action: manipulation; }",
    "#tune-actions button { font: 12px system-ui, sans-serif; padding: 4px 8px; border: 1.5px solid #5c4632;",
    "  border-radius: 8px; background: #fff8ea; color: #3a2a1c; cursor: pointer; }",
    "#tune-body { padding: 6px 10px 10px; }",
    "#tune-readout { white-space: pre-wrap; background: rgba(60,127,214,0.10); border-radius: 8px;",
    "  padding: 6px 8px; margin-bottom: 8px; font: 11px ui-monospace, monospace; line-height: 1.3; }",
    ".tune-group { margin: 0 0 7px; }",
    ".tune-group h3 { margin: 0 0 4px; font: 600 11px system-ui, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; color: #5c4632; }",
    ".tune-row { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; align-items: center; margin: 0 0 3px; }",
    ".tune-row label { font-size: 11px; }",
    ".tune-row .tune-val { font: 11px ui-monospace, monospace; color: #5c4632; }",
    ".tune-row input[type=range] { grid-column: 1 / -1; width: 100%; height: 22px; margin: 0; touch-action: manipulation; }",
  ].join("\n");
  document.head.appendChild(style);
  const panel = document.createElement("div");
  panel.id = "tune-panel";
  const head = document.createElement("div");
  head.id = "tune-head";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "tune-toggle";
  toggle.textContent = "Parameter";
  const actions = document.createElement("div");
  actions.id = "tune-actions";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.id = "tune-reset";
  resetBtn.textContent = "Zurücksetzen";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.id = "tune-copy";
  copyBtn.textContent = "Kopieren";
  actions.appendChild(resetBtn);
  actions.appendChild(copyBtn);
  head.appendChild(toggle);
  head.appendChild(actions);
  const body = document.createElement("div");
  body.id = "tune-body";
  const readout = document.createElement("div");
  readout.id = "tune-readout";
  body.appendChild(readout);
  let currentGroup = null;
  let groupBox = null;
  for (const spec of TUNE_SPEC) {
    if (spec.group !== currentGroup) {
      currentGroup = spec.group;
      groupBox = document.createElement("div");
      groupBox.className = "tune-group";
      const h = document.createElement("h3");
      h.textContent = spec.group;
      groupBox.appendChild(h);
      body.appendChild(groupBox);
    }
    const row = document.createElement("div");
    row.className = "tune-row";
    const lab = document.createElement("label");
    lab.setAttribute("for", "tune-sl-" + spec.key);
    lab.textContent = spec.label;
    const val = document.createElement("span");
    val.className = "tune-val";
    val.id = "tune-val-" + spec.key;
    const sl = document.createElement("input");
    sl.type = "range";
    sl.id = "tune-sl-" + spec.key;
    sl.min = String(spec.min);
    sl.max = String(spec.max);
    sl.step = String(spec.step);
    sl.value = String(tuneVals[spec.key] == null ? spec.def : tuneVals[spec.key]);
    sl.addEventListener("input", () => setTuneFromPanel(spec.key, sl.value));
    row.appendChild(lab);
    row.appendChild(val);
    row.appendChild(sl);
    groupBox.appendChild(row);
  }
  panel.appendChild(head);
  panel.appendChild(body);
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());
  panel.addEventListener("pointermove", (e) => e.stopPropagation());
  panel.addEventListener("pointerup", (e) => e.stopPropagation());
  panel.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  toggle.addEventListener("click", () => {
    panel.classList.toggle("collapsed");
    toggle.textContent = panel.classList.contains("collapsed") ? "Parameter ▸" : "Parameter";
  });
  resetBtn.addEventListener("click", () => {
    tuneVals = tuneDefaults();
    saveTuneVals();
    for (const spec of TUNE_SPEC) refreshTuneSlider(spec.key);
  });
  copyBtn.addEventListener("click", () => {
    const payload = { params: Object.assign({}, tuneVals), last: lastTuneInfo && {
      art: lastTuneInfo.kindName,
      geodreieck: lastTuneInfo.geo,
      cvKreis: lastTuneInfo.circ ? lastTuneInfo.circ.cv : null,
      cvEllipse: lastTuneInfo.ell ? lastTuneInfo.ell.cv : null,
      a: lastTuneInfo.ell ? lastTuneInfo.ell.a : null,
      b: lastTuneInfo.ell ? lastTuneInfo.ell.b : null,
      ab: lastTuneInfo.ell ? lastTuneInfo.ell.a - lastTuneInfo.ell.b : null,
      winkel: lastTuneInfo.ell ? lastTuneInfo.ell.angle : null,
      ecken: lastTuneInfo.verts,
      innenwinkel: lastTuneInfo.angs,
    } };
    const text = JSON.stringify(payload, null, 2);
    const done = () => { copyBtn.textContent = "Kopiert"; setTimeout(() => { copyBtn.textContent = "Kopieren"; }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        window.prompt("Werte kopieren:", text);
      });
    } else window.prompt("Werte kopieren:", text);
  });
  document.body.appendChild(panel);
  for (const spec of TUNE_SPEC) refreshTuneSlider(spec.key);
  refreshTuneReadout();
}


function closedRing(pts) {
  if (!pts || pts.length < 2) return pts;
  if (dist(pts[0], pts[pts.length - 1]) <= 0.02) return pts.slice(0, -1);
  return pts;
}

function ringLen(pts) {
  let len = 0;
  for (let i = 0; i < pts.length; i++) len += dist(pts[i], pts[(i + 1) % pts.length]);
  return len;
}

function pointAlongRing(pts, s) {
  const n = pts.length;
  const segs = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const L = dist(pts[i], pts[(i + 1) % n]);
    segs.push(L);
    total += L;
  }
  if (total < 1e-9) return { x: pts[0].x, y: pts[0].y };
  s = ((s % total) + total) % total;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const L = segs[i];
    if (acc + L >= s - 1e-12) {
      const t = L < 1e-12 ? 0 : (s - acc) / L;
      const a = pts[i];
      const b = pts[(i + 1) % n];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += L;
  }
  return { x: pts[0].x, y: pts[0].y };
}

function headingOf(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function maxNetTurn(pts, windowLen) {
  const total = ringLen(pts);
  const W = Math.min(windowLen, total / 4);
  if (W < 1e-6) return 0;
  const samples = Math.max(24, pts.length * 2);
  let best = 0;
  for (let k = 0; k < samples; k++) {
    const s = total * k / samples;
    const p = pointAlongRing(pts, s);
    const pb = pointAlongRing(pts, s - W);
    const pf = pointAlongRing(pts, s + W);
    best = Math.max(best, Math.abs(angleDelta(headingOf(pb, p), headingOf(p, pf))));
  }
  return best;
}

function resampleRing(pts, n) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 2) return null;
  const total = ringLen(ring);
  if (total < 1e-9) return null;
  const out = [];
  const count = Math.max(3, n | 0);
  for (let i = 0; i < count; i++) out.push(pointAlongRing(ring, total * i / count));
  return out;
}

function polygonCentroid(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return null;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const cr = p.x * q.y - q.x * p.y;
    area += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) { sx += p.x; sy += p.y; }
    return { x: sx / ring.length, y: sy / ring.length };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function circleFromPoints(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return null;
  const samples = resampleRing(ring, tuneCode("samples", CIRCLE_SAMPLES));
  if (!samples) return null;
  const c = polygonCentroid(ring);
  if (!c) return null;
  const rs = samples.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  let mean = 0;
  for (const r of rs) mean += r;
  mean /= rs.length;
  if (mean < tuneCode("minR", CIRCLE_MIN_R) || mean > tuneCode("maxR", CIRCLE_MAX_R)) return null;
  let acc = 0;
  for (const r of rs) acc += (r - mean) * (r - mean);
  const cv = Math.sqrt(acc / rs.length) / mean;
  return { x: c.x, y: c.y, r: mean, cv };
}

function hasRightAngle(pts, tol) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return false;
  const limit = tol == null ? tuneCode("rightTol", CIRCLE_RIGHT_TOL) : tol;
  const angs = interiorAngles(ring);
  for (const a of angs) {
    if (Math.abs(a - Math.PI / 2) <= limit || Math.abs(a - Math.PI * 3 / 2) <= limit) return true;
  }
  return false;
}

function circleFit(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < tuneCode("minPts", CIRCLE_MIN_PTS)) return null;
  const fit = circleFromPoints(ring);
  if (!fit) return null;
  if (fit.cv >= tuneCode("maxCv", CIRCLE_MAX_CV)) return null;
  if (maxNetTurn(ring, fit.r * tuneCode("turnWin", CIRCLE_TURN_WIN)) > tuneCode("maxCorner", CIRCLE_MAX_CORNER)) return null;
  return fit;
}

function ellipseFromPoints(pts) {
  const ring = closedRing(pts);
  if (!ring || ring.length < 3) return null;
  const samples = resampleRing(ring, tuneCode("samples", CIRCLE_SAMPLES));
  if (!samples) return null;
  const c = polygonCentroid(ring);
  if (!c) return null;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of samples) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const n = samples.length;
  sxx /= n;
  syy /= n;
  sxy /= n;
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const uv = [];
  let maxU = 0;
  let maxV = 0;
  for (const p of samples) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const u = dx * ca + dy * sa;
    const v = -dx * sa + dy * ca;
    uv.push({ u, v });
    if (Math.abs(u) > maxU) maxU = Math.abs(u);
    if (Math.abs(v) > maxV) maxV = Math.abs(v);
  }
  if (maxU < 1e-6 || maxV < 1e-6) return null;
  let a = maxU;
  let b = maxV;
  let mean = 0;
  for (const p of uv) mean += Math.sqrt((p.u * p.u) / (a * a) + (p.v * p.v) / (b * b));
  mean /= uv.length;
  if (mean < 1e-6) return null;
  a *= mean;
  b *= mean;
  let acc = 0;
  mean = 0;
  for (const p of uv) mean += Math.sqrt((p.u * p.u) / (a * a) + (p.v * p.v) / (b * b));
  mean /= uv.length;
  if (mean < 1e-6) return null;
  for (const p of uv) {
    const rho = Math.sqrt((p.u * p.u) / (a * a) + (p.v * p.v) / (b * b));
    acc += (rho - mean) * (rho - mean);
  }
  const cv = Math.sqrt(acc / uv.length) / mean;
  let angle = ang;
  if (b > a) {
    const tmp = a;
    a = b;
    b = tmp;
    angle += Math.PI / 2;
  }
  while (angle > Math.PI / 2) angle -= Math.PI;
  while (angle <= -Math.PI / 2) angle += Math.PI;
  if (a < tuneCode("minR", CIRCLE_MIN_R) || a > tuneCode("maxR", CIRCLE_MAX_R) * 1.5) return null;
  if (b < tuneCode("minR", CIRCLE_MIN_R) * 0.6) return null;
  return { kind: "ellipse", x: c.x, y: c.y, a, b, angle, cv, r: 0.5 * (a + b) };
}

function ellipseAxesAreRound(a, b) {
  const ratio = tuneCode("ellCircleRatio", ELLIPSE_CIRCLE_RATIO);
  const extra = tuneCode("ellExtraGap", ELLIPSE_EXTRA_GAP);
  return !(a - b > (1 - ratio) * a + extra);
}

function tryMakeCircle(pts) {
  if (strokeSnaps()) {
    const ring = closedRing(pts);
    if (!ring || ring.length < tuneCode("minPts", CIRCLE_MIN_PTS) || Math.abs(signedArea(ring)) < 0.05) return null;
    const ell = ellipseFromPoints(ring);
    if (!ell || ell.cv >= tuneCode("ellMaxCv", ELLIPSE_MAX_CV)) return null;
    if (ellipseAxesAreRound(ell.a, ell.b)) {
      return { kind: "circle", x: ell.x, y: ell.y, r: 0.5 * (ell.a + ell.b), cv: ell.cv };
    }
    return ell;
  }
  return circleFit(pts);
}

function tidyTerrain(rawPts) {
  let pts = dedupe(simplify(rawPts, tuneCode("simplify", 0.045)));
  if (pts.length < 2) return pts;
  if (!isClosedStroke(pts)) return straightenOpen(pts);
  const ring = dedupe(pts.slice(0, -1));
  if (ring.length >= 3 && !selfIntersects(ring, true) && Math.abs(signedArea(ring)) >= 0.05) {
    const neat = regularizeClosed(ring);
    return neat.concat([{ x: neat[0].x, y: neat[0].y }]);
  }
  return pts;
}

function makePaper() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#f4e6c6";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2200; i++) {
    const light = hash(i, 1) > 0.55;
    g.fillStyle = light ? "rgba(255,255,255,0.22)" : "rgba(150,110,60,0.13)";
    g.fillRect(hash(i, 2) * 512, hash(i, 3) * 512, 1 + hash(i, 4) * 2.2, 1 + hash(i, 5) * 1.6);
  }
  g.strokeStyle = "rgba(80,120,160,0.045)";
  g.lineWidth = 1;
  for (let y = 36; y < 512; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  paper = c;
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.max(1, Math.floor(viewW * dpr));
  canvas.height = Math.max(1, Math.floor(viewH * dpr));
}

function viewInset() {
  if (mode === "play") return { top: 104, bottom: 48 };
  if (mode === "editor") return { top: 118, bottom: 96 };
  return { top: 0, bottom: 0 };
}

function camScale() {
  const inset = viewInset();
  const w = Math.max(200, viewW);
  const h = Math.max(200, viewH - inset.top - inset.bottom);
  return Math.min(w / VIEW_W, h / VIEW_H) * cam.zoom;
}

function viewCenter() {
  const inset = viewInset();
  return {
    x: viewW / 2,
    y: inset.top + (viewH - inset.top - inset.bottom) / 2,
  };
}

function worldToScreen(x, y) {
  const s = camScale();
  const c = viewCenter();
  return {
    x: c.x + (x - cam.cx) * s,
    y: c.y - (y - cam.cy) * s,
  };
}

function screenToWorld(x, y) {
  const s = camScale();
  const c = viewCenter();
  return {
    x: cam.cx + (x - c.x) / s,
    y: cam.cy - (y - c.y) / s,
  };
}

function snapDrawPoint(p) {
  if (!geoSnap) return { x: p.x, y: p.y };
  return {
    x: Math.round(p.x / GEO_GRID) * GEO_GRID,
    y: Math.round(p.y / GEO_GRID) * GEO_GRID,
  };
}

function snapStrokePoints(raw) {
  if (!raw || !raw.length) return [];
  const out = [snapDrawPoint(raw[0])];
  for (let i = 1; i < raw.length; i++) {
    const ink = snapDrawPoint(raw[i]);
    const last = out[out.length - 1];
    if (Math.hypot(ink.x - last.x, ink.y - last.y) > 0.04) out.push({ x: ink.x, y: ink.y });
  }
  return out;
}

function geoKeepsPolygon(pts) {
  const rec = recognizePolygon(pts);
  return !!(rec && rec.corners && (rec.corners.length === 3 || rec.corners.length === 4));
}

function strokeSnaps() {
  if (!geoSnap) return false;
  if (mode === "play") return true;
  return mode === "editor" && (editorTool === "terrain" || editorTool === "decor");
}

function resetCam() {
  cam.cx = 16;
  cam.cy = 9;
  cam.zoom = 1;
}

function V(x, y) { return planck.Vec2(x, y); }

function clearWorld() {
  endDrag();
  world = null;
  ground = null;
  ball = null;
  stars = [];
  pins = [];
  rockets = [];
  drawings = [];
  scenery = [];
  geometry = [];
  bodyMeta = new Map();
  contactQ = [];
  ropeCutQ = [];
  won = false;
  medals = { elegant: false, oldschool: false };
  stats = { shapes: 0, nudges: 0, userPins: 0, ropes: 0, drewUnder: false, dragTrick: false };
  simTime = 0;
  confetti = [];
  dragFresh = new Map();
  anchors = [];
}

function track(body, meta) {
  meta.body = body;
  bodyMeta.set(body, meta);
  return meta;
}

// Fixtures dünner als das rechnen sich schlecht: zwei Kontaktpunkte liegen
// dicht beieinander und Normalen kippen. Solche Stücke werden verworfen.
const MIN_FIX_H = 0.06;

function polyMinWidth(pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) return 0;
    let far = 0;
    for (const c of pts) {
      far = Math.max(far, Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / len);
    }
    best = Math.min(best, far);
  }
  return best;
}

// planck.Polygon macht aus entarteten Punkten still eine 2-m-Kiste (_setAsBox(1,1)).
// Für Spielerformen wird so ein Ersatz abgelehnt statt eingebaut.
function makePolygonFixture(body, pts, opt) {
  let shape;
  try {
    shape = new planck.Polygon(pts.map((p) => V(p.x, p.y)));
  } catch (err) {
    return false;
  }
  if (!shape.m_vertices || shape.m_count !== pts.length) return false;
  for (let i = 0; i < shape.m_count; i++) {
    const v = shape.m_vertices[i];
    if (!pts.some((p) => Math.abs(p.x - v.x) < 1e-6 && Math.abs(p.y - v.y) < 1e-6)) return false;
  }
  try {
    body.createFixture(shape, opt);
    return true;
  } catch (err) {
    return false;
  }
}

function addTriFixture(body, tri, opt) {
  const area = Math.abs(signedArea(tri));
  if (area < 0.0015) return false;
  const verts = signedArea(tri) < 0 ? tri.slice().reverse() : tri.slice();
  const e1 = Math.hypot(tri[0].x - tri[1].x, tri[0].y - tri[1].y);
  const e2 = Math.hypot(tri[1].x - tri[2].x, tri[1].y - tri[2].y);
  const e3 = Math.hypot(tri[2].x - tri[0].x, tri[2].y - tri[0].y);
  if (Math.min(e1, e2, e3) < 0.03) return false;
  if (polyMinWidth(tri) < MIN_FIX_H) return false;
  return makePolygonFixture(body, verts, opt);
}

// Legt kurze Kanten zusammen, bevor die Form in Dreiecke zerlegt wird.
// Entfernt wird jeweils die Ecke, deren Wegfall die Fläche am wenigsten ändert.
function mergeShortEdges(pts, minLen) {
  const out = pts.map((p) => ({ x: p.x, y: p.y }));
  while (out.length > 3) {
    let shortest = -1;
    let shortLen = minLen;
    for (let i = 0; i < out.length; i++) {
      const d = dist(out[i], out[(i + 1) % out.length]);
      if (d < shortLen) { shortLen = d; shortest = i; }
    }
    if (shortest < 0) break;
    const n = out.length;
    const cost = (k) => {
      const a = out[(k + n - 1) % n];
      const b = out[k];
      const c = out[(k + 1) % n];
      return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    };
    const j = (shortest + 1) % n;
    out.splice(cost(shortest) <= cost(j) ? shortest : j, 1);
  }
  return out;
}

function fixtureOpt(extra) {
  return Object.assign({
    density: 1,
    friction: 0.6,
    restitution: 0,
    filterGroupIndex: 0,
  }, extra || {});
}

function addConvexFixture(body, pts, opt) {
  const maxV = (planck.Settings && planck.Settings.maxPolygonVertices) || 8;
  if (pts.length < 3 || pts.length > maxV || !isConvex(pts)) return false;
  if (Math.abs(signedArea(pts)) < 0.04) return false;
  if (polyMinWidth(pts) < MIN_FIX_H) return false;
  return makePolygonFixture(body, pts, opt);
}

function mountOutline(body, worldPts, closed, color, width) {
  const o = body.getPosition();
  const local = worldPts.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
  return {
    local,
    closed,
    color,
    width: width || (closed ? 0.14 : THICK),
    fixed: false,
  };
}

function containsMeta(meta, x, y) {
  if (!meta.body) return false;
  const lp = meta.body.getLocalPoint(V(x, y));
  const px = lp.x;
  const py = lp.y;
  if (meta.outline && meta.outline.closed) {
    if (distToPoly(px, py, meta.outline.local) <= 0.2) return true;
  }
  if (meta.outline && !meta.outline.closed) {
    if (distToWire(px, py, meta.outline.local) <= (meta.thick || THICK) * 0.5 + 0.18) return true;
  }
  if (meta.circles) {
    for (const c of meta.circles) {
      if (Math.hypot(px - c.x, py - c.y) <= c.r + 0.16) return true;
    }
  }
  return false;
}

function hostAt(x, y) {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (!d.body || d.kind === "rope") continue;
    if (d.meta && containsMeta(d.meta, x, y)) return d.body;
  }
  for (let i = geometry.length - 1; i >= 0; i--) {
    const g = geometry[i];
    if (g.closed) {
      // The center of a tiny loop sits just above the surface it is drawn on.
      if (distToPoly(x, y, g.pts) <= 0.48) return ground;
    } else if (distToWire(x, y, g.pts) <= 0.24) return ground;
  }
  for (const r of rockets) {
    if (r.body && containsMeta(r.meta, x, y)) return r.body;
  }
  return null;
}

function rememberPin(x, y, body, userMade) {
  const local = body.getLocalPoint(V(x, y));
  const pin = {
    x, y,
    local: { x: local.x, y: local.y },
    body,
    userMade: !!userMade,
    joints: [],
    motor: 0,
  };
  pins.push(pin);
  return pin;
}

function attachExistingPins(body, meta) {
  let n = 0;
  for (const pin of pins) {
    if (pin.body === body) continue;
    const wp = pin.body.getWorldPoint(V(pin.local.x, pin.local.y));
    if (!containsMeta(meta, wp.x, wp.y)) continue;
    const joint = world.createJoint(new planck.RevoluteJoint({
      bodyA: pin.body,
      bodyB: body,
      localAnchorA: V(pin.local.x, pin.local.y),
      localAnchorB: body.getLocalPoint(V(wp.x, wp.y)),
      collideConnected: false,
    }));
    pin.joints.push(joint);
    applyNailMotor(pin);
    n++;
  }
  return n;
}

function spawnSolid(pts, opt) {
  const clean = ensureCCW(dedupe(pts));
  if (clean.length < 3 || Math.abs(signedArea(clean)) < 0.04) return null;
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < clean.length; i++) {
    const p = clean[i];
    const q = clean[(i + 1) % clean.length];
    const cr = p.x * q.y - q.x * p.y;
    a += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-4) return null;
  cx /= (6 * a);
  cy /= (6 * a);
  const body = world.createDynamicBody({
    position: V(cx, cy),
    linearDamping: 0.12,
    angularDamping: 0.35,
  });
  const local = clean.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const fopt = fixtureOpt({ density: opt.density || 1.5, friction: 0.72, restitution: 0 });
  let made = addConvexFixture(body, local, fopt) ? 1 : 0;
  if (!made) {
    const merged = ensureCCW(mergeShortEdges(local, MIN_FIX_H));
    let tris = triangulate(merged);
    if (!tris.length) {
      const hull = convexHull(merged);
      tris = [];
      for (let i = 1; i < hull.length - 1; i++) tris.push([hull[0], hull[i], hull[i + 1]]);
    }
    for (const tri of tris) made += addTriFixture(body, tri, fopt) ? 1 : 0;
  }
  if (!made) {
    world.destroyBody(body);
    return null;
  }
  const meta = track(body, {
    kind: "draw",
    thick: THICK,
    outline: { local, closed: true, color: MAT.wood, width: 0.13, fixed: false },
  });
  if (opt && opt.quadKind) meta.quadKind = opt.quadKind;
  const draw = { kind: "solid", body, meta, color: MAT.wood };
  drawings.push(draw);
  attachExistingPins(body, meta);
  noteShape(clean);
  return draw;
}

function pointerPressure(ev) {
  if (!ev || ev.pointerType !== "pen") return null;
  if (typeof ev.pressure !== "number" || !isFinite(ev.pressure)) return 0.5;
  return Math.max(0, Math.min(1, ev.pressure));
}

function thickFromPressure(pressure) {
  const lo = tuneCode("penThickMin", PEN_PRESS_MIN);
  const hi = tuneCode("penThickMax", PEN_PRESS_MAX);
  const p = Math.max(0, Math.min(1, pressure));
  return THICK * (lo + p * (hi - lo));
}

function inkPoint(x, y, ev) {
  const pt = { x, y };
  const raw = pointerPressure(ev);
  if (raw == null) return pt;
  const prev = pointer && pointer.penP;
  const smooth = prev == null ? raw : prev * 0.65 + raw * 0.35;
  if (pointer) pointer.penP = smooth;
  pt.thick = thickFromPressure(smooth);
  return pt;
}

function strokeThickness(pts) {
  const thicks = (pts || []).map((p) => p.thick).filter((t) => t > 0).sort((a, b) => a - b);
  if (!thicks.length) return THICK;
  const mid = thicks.length >> 1;
  const med = thicks.length % 2 ? thicks[mid] : 0.5 * (thicks[mid - 1] + thicks[mid]);
  const lo = THICK * tuneCode("penThickMin", PEN_PRESS_MIN);
  const hi = THICK * tuneCode("penThickMax", PEN_PRESS_MAX);
  return Math.max(lo, Math.min(hi, med));
}

function spawnWire(pts, opt) {
  const clean = dedupe(pts);
  if (clean.length < 2) return null;
  const thick = opt && opt.thick > 0 ? opt.thick : THICK;
  const half = thick / 2;
  let ox = 0;
  let oy = 0;
  for (const p of clean) { ox += p.x; oy += p.y; }
  ox /= clean.length;
  oy /= clean.length;
  const body = world.createDynamicBody({
    position: V(ox, oy),
    linearDamping: 0.08,
    angularDamping: 0.25,
  });
  const fopt = fixtureOpt({ density: opt.density || 2.1, friction: 0.62, restitution: 0 });
  let made = 0;
  for (const p of clean) {
    body.createFixture(new planck.Circle(V(p.x - ox, p.y - oy), half), fopt);
    made++;
  }
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.05) continue;
    const localCenter = V((a.x + b.x) / 2 - ox, (a.y + b.y) / 2 - oy);
    const shape = new planck.Box(len / 2, half, localCenter, Math.atan2(b.y - a.y, b.x - a.x));
    body.createFixture(shape, fopt);
    made++;
  }
  if (!made) {
    world.destroyBody(body);
    return null;
  }
  const local = clean.map((p) => ({ x: p.x - ox, y: p.y - oy }));
  const meta = track(body, {
    kind: "draw",
    thick,
    outline: { local, closed: false, color: MAT.wire, width: thick, fixed: false },
  });
  const draw = { kind: "wire", body, meta, color: MAT.wire };
  drawings.push(draw);
  attachExistingPins(body, meta);
  noteShape(clean);
  return draw;
}

function spawnBlob(x, y, r) {
  const body = world.createDynamicBody({
    position: V(x, y),
    linearDamping: 0.04,
    angularDamping: 0.04,
  });
  body.createFixture(new planck.Circle(r), fixtureOpt({ density: 3.2, friction: 0.16, restitution: 0 }));
  const meta = track(body, {
    kind: "draw",
    round: true,
    circles: [{ x: 0, y: 0, r }],
    outline: null,
  });
  const draw = { kind: "blob", body, meta, color: MAT.steel, x, y, r };
  drawings.push(draw);
  noteShape([{ x, y: y - r }, { x, y }]);
  return draw;
}

function ellipseLocalPoly(a, b, angle, n) {
  const pts = [];
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const count = Math.max(8, n | 0);
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const u = a * Math.cos(t);
    const v = b * Math.sin(t);
    pts.push({ x: u * ca - v * sa, y: u * sa + v * ca });
  }
  return ensureCCW(pts);
}

function spawnEllipse(x, y, a, b, angle) {
  const body = world.createDynamicBody({
    position: V(x, y),
    linearDamping: 0.04,
    angularDamping: 0.08,
    bullet: true,
  });
  const fopt = fixtureOpt({ density: 3.2, friction: 0.16, restitution: 0 });
  const local = ellipseLocalPoly(a, b, angle, tuneCode("ellVerts", ELLIPSE_PHYS_VERTS));
  let made = addConvexFixture(body, local, fopt) ? 1 : 0;
  if (!made) {
    const merged = ensureCCW(mergeShortEdges(local, MIN_FIX_H));
    let tris = triangulate(merged);
    if (!tris.length) {
      const hull = convexHull(merged);
      tris = [];
      for (let i = 1; i < hull.length - 1; i++) tris.push([hull[0], hull[i], hull[i + 1]]);
    }
    for (const tri of tris) made += addTriFixture(body, tri, fopt) ? 1 : 0;
  }
  if (!made) {
    world.destroyBody(body);
    return null;
  }
  const meta = track(body, {
    kind: "ellipse",
    round: true,
    ellipse: { a, b, angle },
    outline: { local, closed: true, color: MAT.steel, width: 0.13, fixed: false },
  });
  const draw = { kind: "ellipse", body, meta, color: MAT.steel, x, y, a, b, angle };
  drawings.push(draw);
  attachExistingPins(body, meta);
  noteShape([{ x: x - a, y }, { x, y: y - b }, { x: x + a, y }]);
  return draw;
}

function spawnRoller(x, y, r) {
  const body = world.createDynamicBody({
    position: V(x, y),
    linearDamping: 0.015,
    angularDamping: 0.02,
    bullet: true,
  });
  body.createFixture(new planck.Circle(r), fixtureOpt({ density: 3.2, friction: 0.16, restitution: 0 }));
  const meta = track(body, {
    kind: "roller",
    round: true,
    circles: [{ x: 0, y: 0, r }],
    outline: null,
  });
  const draw = { kind: "roller", body, meta, color: MAT.steel, x, y, r };
  drawings.push(draw);
  attachExistingPins(body, meta);
  noteShape([{ x: x - r, y }, { x, y: y - r }, { x: x + r, y }]);
  return draw;
}

const ROPE_SPACING = 0.22;
const ROPE_BEAD_R = 0.10;
const ROPE_BEAD_DENSITY = 1.6;
const ROPE_MAX_STRETCH = 1.01;
const ROPE_CUT_ANGLE = 15 * Math.PI / 180;   // Innenwinkel der Spitze
const ROPE_CUT_ALIGN = 30 * Math.PI / 180;   // Abweichung von der Senkrechten
const ROPE_CUT_SPEED = 2.5;                  // m/s, Mindestgeschwindigkeit

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function ropeChainLength(draw) {
  if (!draw || !draw.bodies) return 0;
  let len = 0;
  let prev = null;
  for (const body of draw.bodies) {
    if (!body || (typeof body.isValid === "function" && !body.isValid())) continue;
    const p = body.getPosition();
    if (prev) len += dist(prev, p);
    prev = { x: p.x, y: p.y };
  }
  return len;
}

function attachRopePins(targetWorld, pinA, pinB, bodies) {
  const endA = targetWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pinA.body,
    bodyB: bodies[0],
    localAnchorA: V(pinA.local.x, pinA.local.y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  const endB = targetWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pinB.body,
    bodyB: bodies[bodies.length - 1],
    localAnchorA: V(pinB.local.x, pinB.local.y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  return [endA, endB];
}

function linkRopeSegment(targetWorld, a, b, length) {
  const distJ = targetWorld.createJoint(new planck.DistanceJoint({
    bodyA: a,
    bodyB: b,
    localAnchorA: V(0, 0),
    localAnchorB: V(0, 0),
    length,
    frequencyHz: 0,
    dampingRatio: 0,
    collideConnected: false,
  }));
  const ropeJ = targetWorld.createJoint(new planck.RopeJoint({
    bodyA: a,
    bodyB: b,
    localAnchorA: V(0, 0),
    localAnchorB: V(0, 0),
    maxLength: length * ROPE_MAX_STRETCH,
    collideConnected: false,
  }));
  return { dist: distJ, rope: ropeJ, length };
}

function buildRope(targetWorld, pinA, pinB, stroke, trackFn) {
  const start = pinWorld(pinA);
  const end = pinWorld(pinB);
  let pts = (stroke && stroke.length >= 2) ? stroke.map((p) => ({ x: p.x, y: p.y })) : [start, end];
  pts[0] = { x: start.x, y: start.y };
  pts[pts.length - 1] = { x: end.x, y: end.y };
  const restLength = pathLength(pts);
  if (restLength < 0.08) return null;
  const samples = resample(pts, ROPE_SPACING);
  if (samples.length < 2) return null;
  const ropeId = ropeSeq++;
  const bodies = [];
  for (const p of samples) {
    const body = targetWorld.createDynamicBody({
      position: V(p.x, p.y),
      bullet: true,
      linearDamping: 0.8,
      angularDamping: 0.8,
    });
    body.createFixture(new planck.Circle(ROPE_BEAD_R), fixtureOpt({
      density: ROPE_BEAD_DENSITY,
      friction: 0.45,
      restitution: 0,
      filterGroupIndex: -2,
    }));
    if (trackFn) trackFn(body, { kind: "rope", ropeId });
    bodies.push(body);
  }
  const segJoints = [];
  for (let i = 0; i < bodies.length - 1; i++) {
    const d = dist(samples[i], samples[i + 1]) || ROPE_SPACING;
    segJoints.push(linkRopeSegment(targetWorld, bodies[i], bodies[i + 1], d));
  }
  const endJoints = attachRopePins(targetWorld, pinA, pinB, bodies);
  // Spanne zwischen den Endgliedern, nicht zwischen den Nägeln: die Nägel
  // sitzen oft auf statischen Körpern, ein Joint dort würde nichts halten.
  const spanJoint = targetWorld.createJoint(new planck.RopeJoint({
    bodyA: bodies[0],
    bodyB: bodies[bodies.length - 1],
    localAnchorA: V(0, 0),
    localAnchorB: V(0, 0),
    maxLength: restLength * ROPE_MAX_STRETCH,
    collideConnected: false,
  }));
  return {
    kind: "rope",
    ropeId,
    bodies,
    color: MAT.hemp,
    restLength,
    segJoints,
    endJoints,
    spanJoint,
    pinA,
    pinB,
  };
}

function pinBodyMass(pin) {
  if (!pin || !pin.body || !pin.body.isDynamic()) return 0;
  const m = pin.body.getMass();
  return m > 1e-8 ? m : 0;
}

function movePinWithBead(pin, dx, dy) {
  if (!pin || !pin.body || !pin.body.isDynamic()) return;
  const p = pin.body.getPosition();
  pin.body.setPosition(V(p.x + dx, p.y + dy));
}

function tightenRopeDraw(draw, passes) {
  if (!draw || !draw.bodies || !draw.segJoints) return;
  const bodies = draw.bodies;
  const n = bodies.length;
  if (n < 2) return;
  const inv = [];
  for (let i = 0; i < n; i++) {
    const body = bodies[i];
    if (!body || (typeof body.isValid === "function" && !body.isValid()) || !body.isDynamic()) inv[i] = 0;
    else {
      const m = body.getMass();
      inv[i] = m > 1e-8 ? 1 / m : 0;
    }
  }
  function endMass(pin) {
    if (!pin) return -1;
    if (draw.fixedPins) return 0;
    return pinBodyMass(pin);
  }
  const massA = endMass(draw.pinA);
  const massB = endMass(draw.pinB);
  if (massA > 0) inv[0] = 1 / (massA + (1 / (inv[0] || 1e9)));
  else if (massA === 0) inv[0] = 0;
  if (massB > 0) inv[n - 1] = 1 / (massB + (1 / (inv[n - 1] || 1e9)));
  else if (massB === 0) inv[n - 1] = 0;
  const reps = passes || Math.max(50, bodies.length * 2);
  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < draw.segJoints.length; i++) {
      const rest = draw.segJoints[i].length;
      const A = bodies[i];
      const B = bodies[i + 1];
      if (!A || !B) continue;
      const pa = A.getPosition();
      const pb = B.getPosition();
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy) || 1e-9;
      if (d <= rest * 1.0005) continue;
      const wA = inv[i];
      const wB = inv[i + 1];
      const w = wA + wB;
      if (w <= 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const excess = d - rest;
      if (wA) {
        const mx = nx * excess * (wA / w);
        const my = ny * excess * (wA / w);
        A.setPosition(V(pa.x + mx, pa.y + my));
        if (i === 0) movePinWithBead(draw.pinA, mx, my);
        const va = A.getLinearVelocity();
        const sep = va.x * nx + va.y * ny;
        if (sep < 0) {
          A.setLinearVelocity(V(va.x - sep * nx, va.y - sep * ny));
          if (i === 0 && draw.pinA && draw.pinA.body && draw.pinA.body.isDynamic()) {
            const pv = draw.pinA.body.getLinearVelocity();
            const ps = pv.x * nx + pv.y * ny;
            if (ps < 0) draw.pinA.body.setLinearVelocity(V(pv.x - ps * nx, pv.y - ps * ny));
          }
        }
      }
      if (wB) {
        const qb = B.getPosition();
        const mx = nx * excess * (wB / w);
        const my = ny * excess * (wB / w);
        B.setPosition(V(qb.x - mx, qb.y - my));
        if (i === n - 2) movePinWithBead(draw.pinB, -mx, -my);
        const vb = B.getLinearVelocity();
        const sep = vb.x * nx + vb.y * ny;
        if (sep > 0) {
          B.setLinearVelocity(V(vb.x - sep * nx, vb.y - sep * ny));
          if (i === n - 2 && draw.pinB && draw.pinB.body && draw.pinB.body.isDynamic()) {
            const pv = draw.pinB.body.getLinearVelocity();
            const ps = pv.x * nx + pv.y * ny;
            if (ps > 0) draw.pinB.body.setLinearVelocity(V(pv.x - ps * nx, pv.y - ps * ny));
          }
        }
      }
    }
  }
  if (massA === 0 && draw.pinA && bodies[0]) {
    const p = pinWorld(draw.pinA);
    bodies[0].setTransform(V(p.x, p.y), bodies[0].getAngle());
    bodies[0].setLinearVelocity(V(0, 0));
  }
  if (massB === 0 && draw.pinB && bodies[n - 1]) {
    const p = pinWorld(draw.pinB);
    bodies[n - 1].setTransform(V(p.x, p.y), bodies[n - 1].getAngle());
    bodies[n - 1].setLinearVelocity(V(0, 0));
  }
}

function limitRopeChord(draw) {
  if (!draw || !draw.pinA || !draw.pinB || draw.restLength == null) return;
  if (draw.fixedPins || draw.pinA.body === draw.pinB.body) return;
  const a = pinWorld(draw.pinA);
  const b = pinWorld(draw.pinB);
  const chord = dist(a, b);
  const maxL = draw.restLength * ROPE_MAX_STRETCH;
  if (chord <= maxL + 1e-6) return;
  const massA = pinBodyMass(draw.pinA);
  const massB = pinBodyMass(draw.pinB);
  const wA = massA > 0 ? 1 / massA : 0;
  const wB = massB > 0 ? 1 / massB : 0;
  const w = wA + wB;
  if (w <= 0) return;
  const nx = (b.x - a.x) / chord;
  const ny = (b.y - a.y) / chord;
  const excess = chord - maxL;
  if (wA) {
    const mx = nx * excess * (wA / w);
    const my = ny * excess * (wA / w);
    movePinWithBead(draw.pinA, mx, my);
    if (draw.bodies[0]) {
      const p = draw.bodies[0].getPosition();
      draw.bodies[0].setPosition(V(p.x + mx, p.y + my));
    }
  }
  if (wB) {
    const mx = nx * excess * (wB / w);
    const my = ny * excess * (wB / w);
    movePinWithBead(draw.pinB, -mx, -my);
    const last = draw.bodies[draw.bodies.length - 1];
    if (last) {
      const p = last.getPosition();
      last.setPosition(V(p.x - mx, p.y - my));
    }
  }
}

function scaleRopeToRest(draw) {
  if (!draw || !draw.bodies || draw.restLength == null) return;
  if (!draw.fixedPins && (pinBodyMass(draw.pinA) > 0 || pinBodyMass(draw.pinB) > 0)) return;
  const bodies = draw.bodies.filter((b) => b && (typeof b.isValid !== "function" || b.isValid()));
  if (bodies.length < 3) return;
  const pts = bodies.map((b) => {
    const p = b.getPosition();
    return { x: p.x, y: p.y };
  });
  const live = pathLength(pts);
  const maxL = draw.restLength * ROPE_MAX_STRETCH;
  if (live <= maxL) return;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const chord = dist(a, b) || 1e-9;
  const frac = [];
  let acc = 0;
  frac[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i]);
    frac[i] = acc;
  }
  const total = acc || 1;
  const chordPts = pts.map((_, i) => ({
    x: a.x + (b.x - a.x) * (frac[i] / total),
    y: a.y + (b.y - a.y) * (frac[i] / total),
  }));
  let lo = 0;
  let hi = 1;
  let best = 1;
  for (let k = 0; k < 12; k++) {
    const t = (lo + hi) / 2;
    let len = 0;
    let px = pts[0].x;
    let py = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const x = pts[i].x + (chordPts[i].x - pts[i].x) * t;
      const y = pts[i].y + (chordPts[i].y - pts[i].y) * t;
      len += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    if (len > maxL) lo = t;
    else {
      hi = t;
      best = t;
    }
  }
  for (let i = 1; i < bodies.length - 1; i++) {
    const x = pts[i].x + (chordPts[i].x - pts[i].x) * best;
    const y = pts[i].y + (chordPts[i].y - pts[i].y) * best;
    bodies[i].setPosition(V(x, y));
  }
}

function tightenRopes(list) {
  const src = list || drawings;
  for (const draw of src) {
    if (draw && draw.kind === "rope") {
      tightenRopeDraw(draw);
      limitRopeChord(draw);
      scaleRopeToRest(draw);
    }
  }
}

function velocityAt(body, wx, wy) {
  const v = body.getLinearVelocity();
  const w = body.getAngularVelocity();
  const p = body.getPosition();
  return { x: v.x - w * (wy - p.y), y: v.y + w * (wx - p.x) };
}

function ropeTips(worldPts, maxAng) {
  if (!worldPts || worldPts.length < 3) return [];
  const ccw = ensureCCW(worldPts.map((p) => ({ x: p.x, y: p.y })));
  const angs = interiorAngles(ccw);
  const tips = [];
  for (let i = 0; i < ccw.length; i++) {
    if (angs[i] >= maxAng) continue;
    const prev = ccw[(i + ccw.length - 1) % ccw.length];
    const cur = ccw[i];
    const next = ccw[(i + 1) % ccw.length];
    const e1x = prev.x - cur.x;
    const e1y = prev.y - cur.y;
    const e2x = next.x - cur.x;
    const e2y = next.y - cur.y;
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    let ox = -(e1x / l1 + e2x / l2);
    let oy = -(e1y / l1 + e2y / l2);
    const lo = Math.hypot(ox, oy) || 1;
    tips.push({ x: cur.x, y: cur.y, nx: ox / lo, ny: oy / lo, ang: angs[i] });
  }
  return tips;
}

function ropeTangentAtBead(draw, index, contact) {
  const bodies = draw.bodies;
  const i = index;
  let ax, ay, bx, by;
  if (i > 0 && i < bodies.length - 1) {
    const pa = bodies[i - 1].getPosition();
    const pb = bodies[i + 1].getPosition();
    ax = pa.x;
    ay = pa.y;
    bx = pb.x;
    by = pb.y;
  } else if (i < bodies.length - 1) {
    const pa = bodies[i].getPosition();
    const pb = bodies[i + 1].getPosition();
    ax = pa.x;
    ay = pa.y;
    bx = pb.x;
    by = pb.y;
  } else if (i > 0) {
    const pa = bodies[i - 1].getPosition();
    const pb = bodies[i].getPosition();
    ax = pa.x;
    ay = pa.y;
    bx = pb.x;
    by = pb.y;
  } else return null;
  const d = Math.hypot(bx - ax, by - ay) || 1;
  return { x: (bx - ax) / d, y: (by - ay) / d };
}

function noteRopeCutContact(contact) {
  const ba = contact.getFixtureA().getBody();
  const bb = contact.getFixtureB().getBody();
  const ma = bodyMeta.get(ba);
  const mb = bodyMeta.get(bb);
  if (!ma || !mb) return;
  let bead = null;
  let cutter = null;
  let cutMeta = null;
  if (ma.kind === "rope" && mb.kind !== "rope") {
    bead = ba;
    cutter = bb;
    cutMeta = mb;
  } else if (mb.kind === "rope" && ma.kind !== "rope") {
    bead = bb;
    cutter = ba;
    cutMeta = ma;
  } else return;
  if (!cutMeta || cutMeta.kind === "ball" || cutMeta.kind === "star" || cutMeta.kind === "wire" || cutMeta.round) return;
  const wm = contact.getWorldManifold && contact.getWorldManifold();
  if (!wm || !wm.pointCount) return;
  const pt = wm.points[0];
  const x = pt.x;
  const y = pt.y;
  const vc = velocityAt(cutter, x, y);
  const vb = velocityAt(bead, x, y);
  ropeCutQ.push({
    bead,
    cutter,
    cutMeta,
    x,
    y,
    vx: vc.x - vb.x,
    vy: vc.y - vb.y,
  });
}

function ropeShouldCut(ev) {
  if (!ev || !ev.cutter || !ev.bead || !ev.cutMeta) return false;
  const draw = drawings.find((d) => d.kind === "rope" && d.bodies && d.bodies.indexOf(ev.bead) >= 0);
  if (!draw) return false;
  const maxAng = tuneCode("ropeCutAngle", ROPE_CUT_ANGLE);
  const align = tuneCode("ropeCutAlign", ROPE_CUT_ALIGN);
  const minSpeed = tuneCode("ropeCutSpeed", ROPE_CUT_SPEED);
  const speed = Math.hypot(ev.vx, ev.vy);
  if (speed < minSpeed) return false;
  const outline = outlineWorld(ev.cutMeta);
  if (!outline || outline.length < 3) return false;
  const tips = ropeTips(outline, maxAng);
  if (!tips.length) return false;
  let best = null;
  let bestD = 0.28;
  for (const tip of tips) {
    const d = Math.hypot(tip.x - ev.x, tip.y - ev.y);
    if (d < bestD) {
      bestD = d;
      best = tip;
    }
  }
  if (!best) return false;
  const sm = speed || 1;
  const rx = ev.vx / sm;
  const ry = ev.vy / sm;
  if (best.nx * rx + best.ny * ry < 0.35) return false;
  const idx = draw.bodies.indexOf(ev.bead);
  const tan = ropeTangentAtBead(draw, idx, ev);
  if (!tan) return false;
  const along = Math.abs(rx * tan.x + ry * tan.y);
  if (along > Math.sin(align)) return false;
  const tipAlong = Math.abs(best.nx * tan.x + best.ny * tan.y);
  if (tipAlong > Math.sin(align)) return false;
  ev.draw = draw;
  ev.index = idx;
  return true;
}

function cutRopeAtBead(ev) {
  const draw = ev.draw;
  if (!draw || !world) return false;
  const bodies = draw.bodies;
  const i = ev.index;
  if (i < 0 || bodies.length < 3) return false;
  let cut = i;
  if (i <= 0) cut = 0;
  else if (i >= bodies.length - 1) cut = i - 1;
  else {
    const pa = bodies[i - 1].getPosition();
    const pb = bodies[i].getPosition();
    const pc = bodies[i + 1].getPosition();
    const d1 = distPointSeg(ev.x, ev.y, pa.x, pa.y, pb.x, pb.y);
    const d2 = distPointSeg(ev.x, ev.y, pb.x, pb.y, pc.x, pc.y);
    cut = d1 <= d2 ? i - 1 : i;
  }
  const seg = draw.segJoints[cut];
  if (!seg) return false;
  if (seg.dist) world.destroyJoint(seg.dist);
  if (seg.rope) world.destroyJoint(seg.rope);
  if (draw.spanJoint) {
    world.destroyJoint(draw.spanJoint);
    draw.spanJoint = null;
  }
  const leftBodies = bodies.slice(0, cut + 1);
  const rightBodies = bodies.slice(cut + 1);
  const leftJoints = draw.segJoints.slice(0, cut);
  const rightJoints = draw.segJoints.slice(cut + 1);
  if (!leftBodies.length || !rightBodies.length) return false;
  draw.bodies = leftBodies;
  draw.segJoints = leftJoints;
  draw.restLength = leftJoints.reduce((s, j) => s + (j && j.length ? j.length : 0), 0);
  const ends = draw.endJoints || [null, null];
  draw.endJoints = [ends[0], null];
  const rightPin = draw.pinB;
  draw.pinB = null;
  const rightId = ropeSeq++;
  for (const body of rightBodies) {
    const meta = bodyMeta.get(body);
    if (meta) meta.ropeId = rightId;
  }
  drawings.push({
    kind: "rope",
    ropeId: rightId,
    bodies: rightBodies,
    color: draw.color || MAT.hemp,
    restLength: rightJoints.reduce((s, j) => s + (j && j.length ? j.length : 0), 0),
    segJoints: rightJoints,
    endJoints: [null, ends[1]],
    spanJoint: null,
    pinA: null,
    pinB: rightPin,
  });
  return true;
}

function applyRopeCuts() {
  if (!ropeCutQ.length || !world || (world.isLocked && world.isLocked())) {
    ropeCutQ = [];
    return;
  }
  const batch = ropeCutQ.splice(0);
  const seen = new Set();
  for (const ev of batch) {
    if (!ropeShouldCut(ev)) continue;
    if (seen.has(ev.draw)) continue;
    if (cutRopeAtBead(ev)) seen.add(ev.draw);
  }
}

function spawnRope(pinA, pinB, stroke) {
  if (!world) return null;
  const draw = buildRope(world, pinA, pinB, stroke, track);
  if (!draw) return null;
  drawings.push(draw);
  stats.shapes += 1;
  stats.ropes += 1;
  return draw;
}

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
  const ink = (rawInk && rawInk.length >= 2) ? rawInk : drawnPts;
  if (!ink || ink.length < 2) return null;
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
    const a = nearestPin(pts[0].x, pts[0].y, 0.55);
    const b = nearestPin(pts[pts.length - 1].x, pts[pts.length - 1].y, 0.55);
    if (a && b && a !== b) return spawnRope(a, b, ink);
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
    for (const body of draw.bodies) {
      bodyMeta.delete(body);
      world.destroyBody(body);
    }
  } else if (draw.body) {
    const doomed = draw.body;
    if (isAnchored(doomed)) releaseAnchor(doomed);
    pins = pins.filter((pin) => {
      if (pin.body !== doomed) return true;
      return false;
    });
    bodyMeta.delete(doomed);
    world.destroyBody(doomed);
  }
  drawings = drawings.filter((d) => d !== draw);
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
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (d.kind === "rope" || !d.body || !d.meta) continue;
    if (!d.body.isDynamic()) continue;
    if (containsMeta(d.meta, x, y)) return d;
  }
  return null;
}

function supportAlong(body, dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  const wx = dx / len;
  const wy = dy / len;
  const ang = body.getAngle();
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const lx = c * wx + s * wy;
  const ly = -s * wx + c * wy;
  let best = 0.02;
  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    const shape = f.getShape();
    if (shape.m_type === "circle") {
      const p = shape.m_p || { x: 0, y: 0 };
      best = Math.max(best, p.x * lx + p.y * ly + shape.m_radius);
    } else if (shape.m_vertices && shape.m_count) {
      for (let i = 0; i < shape.m_count; i++) {
        const v = shape.m_vertices[i];
        best = Math.max(best, v.x * lx + v.y * ly);
      }
    }
  }
  return best;
}

function rayBlock(body, x1, y1, x2, y2) {
  let best = null;
  const dirx = x2 - x1;
  const diry = y2 - y1;
  world.rayCast(V(x1, y1), V(x2, y2), (fixture, point, normal, fraction) => {
    const other = fixture.getBody();
    if (other === body || fixture.isSensor()) return -1;
    const meta = bodyMeta.get(other);
    if (meta && (meta.kind === "star" || meta.kind === "rope")) return -1;
    const nx = normal.x;
    const ny = normal.y;
    if (nx * dirx + ny * diry > 0) return -1;
    if (!best || fraction < best.fraction) best = { fraction, nx, ny, quest: other === ball };
    return Math.max(fraction, 1e-5);
  });
  return best;
}

function clampDragGoal(body, goal) {
  const origin = body.getPosition();
  let cx = origin.x;
  let cy = origin.y;
  let dx = goal.x - cx;
  let dy = goal.y - cy;
  // Other bodies stop 1.2 cm short. The quest ball is pressed 5 cm so the
  // contact solver actually shoves it; that shove is the drag trick.
  const skinOut = 0.012;
  const skinBall = -0.05;
  for (let slide = 0; slide < 4; slide++) {
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-4) break;
    const dirx = dx / seg;
    const diry = dy / seg;
    const support = supportAlong(body, dirx, diry);
    const cast = support + seg + skinBall;
    const hit = rayBlock(body, cx, cy, cx + dirx * cast, cy + diry * cast);
    if (!hit) {
      cx += dx;
      cy += dy;
      break;
    }
    const skin = hit.quest ? skinBall : skinOut;
    const allow = hit.fraction * cast - support - skin;
    const stepLen = Math.min(seg, Math.max(allow, 0));
    if (allow < 0) {
      cx += dirx * allow;
      cy += diry * allow;
    } else {
      cx += dirx * stepLen;
      cy += diry * stepLen;
    }
    if (allow >= seg - 1e-4) break;
    const nx = hit.nx;
    const ny = hit.ny;
    const leftx = dx - dirx * Math.max(allow, 0);
    const lefty = dy - diry * Math.max(allow, 0);
    const into = leftx * nx + lefty * ny;
    if (into >= 0) break;
    dx = leftx - nx * into;
    dy = lefty - ny * into;
  }
  return { x: cx, y: cy };
}

const NAIL_MOTOR_SPEED = Math.PI / 2;
const NAIL_MOTOR_TORQUE = 8000;
const NAIL_HIT = 0.32;

function applyNailMotor(pin) {
  if (!pin) return;
  const mode = pin.motor || 0;
  const on = mode !== 0;
  const speed = mode * NAIL_MOTOR_SPEED;
  for (const j of pin.joints) {
    if (!j) continue;
    j.enableMotor(on);
    if (on) {
      j.setMotorSpeed(speed);
      j.setMaxMotorTorque(NAIL_MOTOR_TORQUE);
    }
  }
}

function cycleNailMotor(pin) {
  if (!pin) return 0;
  const cur = pin.motor || 0;
  pin.motor = cur === 0 ? 1 : cur === 1 ? -1 : 0;
  applyNailMotor(pin);
  return pin.motor;
}

function hingeWorldPoints(body) {
  const pts = [];
  for (const pin of pins) {
    for (const j of pin.joints) {
      if (!j) continue;
      if (j.getBodyA() !== body && j.getBodyB() !== body) continue;
      const wp = pinWorld(pin);
      if (pts.some((p) => Math.hypot(p.x - wp.x, p.y - wp.y) < 0.05)) continue;
      pts.push({ x: wp.x, y: wp.y, pin });
      break;
    }
  }
  return pts;
}

function constrainNailedGoal(body, goal) {
  if (!playDrag) return null;
  const hinges = hingeWorldPoints(body);
  if (hinges.length >= 2) {
    const g = body.getWorldPoint(V(playDrag.local.x, playDrag.local.y));
    return { x: g.x, y: g.y, hinges };
  }
  if (hinges.length === 1) {
    const p = hinges[0];
    const grab = body.getWorldPoint(V(playDrag.local.x, playDrag.local.y));
    const r = Math.hypot(grab.x - p.x, grab.y - p.y);
    if (r < 0.02) return { x: p.x, y: p.y, hinges };
    const dx = goal.x - p.x;
    const dy = goal.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / d * r, y: p.y + dy / d * r, hinges };
  }
  return null;
}

function dragGoalVelocity(dt) {
  if (!playDrag || !playDrag.prevGoal) return { x: 0, y: 0 };
  const stepDt = dt > 1e-8 ? dt : 1 / 60;
  let vx = (playDrag.goal.x - playDrag.prevGoal.x) / stepDt;
  let vy = (playDrag.goal.y - playDrag.prevGoal.y) / stepDt;
  const speed = Math.hypot(vx, vy);
  const maxV = tuneCode("dragMaxV", DRAG_MAX_V);
  if (speed > maxV && speed > 1e-12) {
    vx *= maxV / speed;
    vy *= maxV / speed;
  }
  return { x: vx, y: vy };
}

function applyDragPivotImpulse(body, offx, offy, dt) {
  const goalV = dragGoalVelocity(dt);
  const lastV = playDrag.lastGoalV || { x: 0, y: 0 };
  const dvx = goalV.x - lastV.x;
  const dvy = goalV.y - lastV.y;
  const mass = Math.max(1e-6, body.getMass());
  const inertia = Math.max(1e-6, body.getInertia());
  const pivotI = inertia + mass * (offx * offx + offy * offy);
  const w = body.getAngularVelocity() + mass * (offy * dvx - offx * dvy) / pivotI;
  body.setAngularVelocity(w);
  body.setLinearVelocity(V(-w * offy, w * offx));
  playDrag.lastGoalV = { x: goalV.x, y: goalV.y };
}

function restDragAboutGrab(body, offx, offy) {
  const w = body.getAngularVelocity();
  body.setLinearVelocity(V(-w * offy, w * offx));
}

function clampDragFollow(body) {
  const anchor = body.getWorldPoint(V(playDrag.local.x, playDrag.local.y));
  const com = body.getPosition();
  const offx = com.x - anchor.x;
  const offy = com.y - anchor.y;
  const clamped = clampDragGoal(body, {
    x: playDrag.goal.x + offx,
    y: playDrag.goal.y + offy,
  });
  return { offx, offy, clamped };
}

function chaseDrag(dt) {
  if (!playDrag || !world || !playDrag.joint) return;
  const body = playDrag.body;
  const nailed = constrainNailedGoal(body, playDrag.goal);
  if (nailed) {
    playDrag.joint.setTarget(V(nailed.x, nailed.y));
    return;
  }
  const follow = clampDragFollow(body);
  body.setTransform(V(follow.clamped.x, follow.clamped.y), body.getAngle());
  applyDragPivotImpulse(body, follow.offx, follow.offy, dt);
  body.setAwake(true);
  playDrag.joint.setTarget(V(follow.clamped.x - follow.offx, follow.clamped.y - follow.offy));
}

function snapDrag(dt) {
  if (!playDrag || !playDrag.body) return;
  const body = playDrag.body;
  const nailed = constrainNailedGoal(body, playDrag.goal);
  if (nailed) {
    const hinges = nailed.hinges;
    if (hinges.length >= 2) {
      body.setLinearVelocity(V(0, 0));
      body.setAngularVelocity(0);
      playDrag.joint.setTarget(V(nailed.x, nailed.y));
      return;
    }
    const p = hinges[0];
    const grab = body.getWorldPoint(V(playDrag.local.x, playDrag.local.y));
    const a0 = Math.atan2(grab.y - p.y, grab.x - p.x);
    const a1 = Math.atan2(nailed.y - p.y, nailed.x - p.x);
    let dang = a1 - a0;
    while (dang > Math.PI) dang -= Math.PI * 2;
    while (dang < -Math.PI) dang += Math.PI * 2;
    const pos = body.getPosition();
    const c = Math.cos(dang);
    const s = Math.sin(dang);
    const ox = pos.x - p.x;
    const oy = pos.y - p.y;
    body.setTransform(V(p.x + ox * c - oy * s, p.y + ox * s + oy * c), body.getAngle() + dang);
    body.setLinearVelocity(V(0, 0));
    body.setAngularVelocity(0);
    body.setAwake(true);
    playDrag.joint.setTarget(V(nailed.x, nailed.y));
    return;
  }
  const follow = clampDragFollow(body);
  body.setTransform(V(follow.clamped.x, follow.clamped.y), body.getAngle());
  restDragAboutGrab(body, follow.offx, follow.offy);
  body.setAwake(true);
  playDrag.joint.setTarget(V(follow.clamped.x - follow.offx, follow.clamped.y - follow.offy));
  playDrag.prevGoal = { x: playDrag.goal.x, y: playDrag.goal.y };
}

function beginDrag(x, y) {
  if (!world || world.isLocked()) return false;
  const draw = drawingAt(x, y);
  if (!draw) return false;
  endDrag();
  const body = draw.body;
  const wasBullet = body.isBullet();
  const angularDamping = body.getAngularDamping();
  body.setBullet(true);
  body.setAngularDamping(tuneCode("dragAngDamp", DRAG_ANG_DAMP));
  body.setAwake(true);
  const mass = Math.max(0.2, body.getMass());
  const local = body.getLocalPoint(V(x, y));
  const joint = world.createJoint(new planck.MouseJoint({
    bodyA: ground,
    bodyB: body,
    target: V(x, y),
    maxForce: mass * 24 * tuneCode("dragForceG", DRAG_FORCE_G),
    frequencyHz: tuneCode("dragFreq", DRAG_FREQ),
    dampingRatio: tuneCode("dragDamp", DRAG_DAMPING),
    collideConnected: true,
  }));
  playDrag = {
    body,
    joint,
    wasBullet,
    angularDamping,
    local: { x: local.x, y: local.y },
    goal: { x, y },
    prevGoal: { x, y },
    lastGoalV: { x: 0, y: 0 },
  };
  return true;
}

function moveDrag(x, y) {
  if (!playDrag) return;
  playDrag.goal.x = x;
  playDrag.goal.y = y;
}

function endDrag() {
  if (!playDrag) return;
  const drag = playDrag;
  playDrag = null;
  if (!world || !drag.joint) return;
  world.destroyJoint(drag.joint);
  if (!drag.body) return;
  drag.body.setLinearVelocity(V(0, 0));
  drag.body.setAngularVelocity(0);
  drag.body.setBullet(drag.wasBullet);
  drag.body.setAngularDamping(drag.angularDamping);
  drag.body.setAwake(true);
  dragFresh.set(drag.body, 0);
}

function dragBodyHot(body) {
  if (!body) return false;
  if (playDrag && playDrag.body === body) return true;
  return dragFresh.has(body);
}

function stepDragFresh(dt) {
  for (const [body, still] of dragFresh) {
    if (!bodyMeta.has(body)) {
      dragFresh.delete(body);
      continue;
    }
    const v = body.getLinearVelocity();
    const slow = Math.hypot(v.x, v.y) < 0.4 && Math.abs(body.getAngularVelocity()) < 0.45;
    if (slow && still + dt > 0.45) dragFresh.delete(body);
    else dragFresh.set(body, slow ? still + dt : 0);
  }
}

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
  const from = trail[0];
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

function buildLevel(def) {
  clearWorld();
  levelDef = def;
  resetCam();
  world = new planck.World(V(0, -24));
  world.on("begin-contact", (contact) => {
    contactQ.push([contact.getFixtureA().getBody(), contact.getFixtureB().getBody()]);
  });
  world.on("pre-solve", (contact) => {
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
  ground = world.createBody();
  track(ground, { kind: "level" });
  addStaticSolid([[-0.5, -2], [0.4, -2], [0.4, 18], [-0.5, 18]], "#c9b48a");
  addStaticSolid([[31.6, -2], [32.5, -2], [32.5, 18], [31.6, 18]], "#c9b48a");
  for (const solid of def.solids || []) addStaticSolid(solid.pts, solid.color);
  for (const wire of def.wires || []) addStaticWire(wire.pts, wire.color);
  for (const d of def.decor || []) scenery.push({ kind: "line", pts: d.pts, color: d.color, width: d.width || 0.12 });
  for (const box of def.boxes || []) makeBox(box);
  for (const xy of def.pins || []) {
    const host = hostAt(xy[0], xy[1]);
    if (host) rememberPin(xy[0], xy[1], host, false);
  }
  for (const r of def.rockets || []) makeRocket(r);
  for (const xy of def.stars || []) {
    const body = world.createBody({ position: V(xy[0], xy[1]) });
    body.createFixture(new planck.Circle(0.58), { isSensor: true, density: 0 });
    const meta = track(body, { kind: "star", got: false });
    stars.push(meta);
  }
  ball = world.createDynamicBody({
    position: V(def.ball[0], def.ball[1]),
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

function outlineWorld(meta) {
  if (!meta || !meta.outline) return null;
  return meta.outline.local.map((p) => {
    const w = meta.body.getWorldPoint(V(p.x, p.y));
    return { x: w.x, y: w.y };
  });
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
    ctx.globalAlpha = pass === 0 ? 0.8 : 0.32;
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
  ctx.globalAlpha = 0.28;
  ctx.fill();
  ctx.clip();
  ctx.globalAlpha = 0.18;
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
  ctx.globalAlpha = 1;
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
  ctx.globalAlpha = 0.96;
  ctx.fill();
  ctx.strokeStyle = MAT.steelDark;
  ctx.globalAlpha = 0.9;
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
  const pos = draw.body.getPosition();
  const phi = draw.body.getAngle() + (draw.angle || 0);
  const pts = ellipseWorldPts(draw, 48);
  const scr = pts.map((p) => worldToScreen(p.x, p.y));
  const scale = camScale();
  ctx.save();
  ctx.beginPath();
  scr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = MAT.steel;
  ctx.globalAlpha = 0.96;
  ctx.fill();
  ctx.strokeStyle = MAT.steelDark;
  ctx.globalAlpha = 0.9;
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
  for (const draw of drawings) {
    if (draw.kind === "rope") drawRope(draw);
    else if (draw.kind === "blob" || draw.kind === "roller") {
      const p = draw.body.getPosition();
      drawSteelCircle(p.x, p.y, draw.r, draw.body.getAngle(), false);
    } else if (draw.kind === "ellipse") {
      drawSteelEllipse(draw);
    } else if (draw.meta) {
      const pts = outlineWorld(draw.meta);
      if (!pts) continue;
      if (draw.meta.outline && draw.meta.outline.closed) {
        crayonFill(pts, draw.color);
        crayonPath(pts.concat([pts[0]]), draw.color, 0.13);
      } else crayonPath(pts, draw.color, (draw.meta && draw.meta.thick) || THICK);
    }
  }
  drawAnchorLinks();
  for (const pin of pins) drawPin(pin);
  for (const star of stars) drawStar(star);
  drawBall();
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

function ellipseWorldPts(draw, n) {
  if (!draw || !draw.body) return [];
  const pos = draw.body.getPosition();
  const rot = draw.body.getAngle();
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

function ensureCradle() {
  if (cradleWorld) return;
  cradleWorld = new planck.World(V(0, -24));
  cradleGround = cradleWorld.createBody();
  cradleWorld.on("pre-solve", (contact) => {
    // Planck merges touching balls into one block; resolveCradleHits handles ball hits instead.
    const a = contact.getFixtureA().getBody();
    const b = contact.getFixtureB().getBody();
    if (cradleBalls.some((rec) => rec.body === a) && cradleBalls.some((rec) => rec.body === b)) contact.setEnabled(false);
  });
  const n = 5;
  const r = 0.2;
  const gap = 0.001;
  const len = 1.15;
  const anchorY = 0;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (r * 2 + gap);
    const anchor = cradleWorld.createBody({ position: V(x, anchorY) });
    const body = cradleWorld.createDynamicBody({
      position: V(x, anchorY - len),
      bullet: true,
      linearDamping: 0.012,
      angularDamping: 0.02,
    });
    body.createFixture(new planck.Circle(r), {
      density: 3.2,
      friction: 0.01,
      restitution: 0,
    });
    cradleWorld.createJoint(new planck.RevoluteJoint({
      bodyA: anchor,
      bodyB: body,
      localAnchorA: V(0, 0),
      localAnchorB: V(0, len),
      collideConnected: false,
    }));
    cradleBalls.push({
      body,
      anchorX: x,
      anchorY,
      len,
      r,
      side: i === 0 ? -1 : i === n - 1 ? 1 : 0,
    });
  }
}

function cradlePose(rec, ang) {
  return {
    x: rec.anchorX + Math.sin(ang) * rec.len,
    y: rec.anchorY - Math.cos(ang) * rec.len,
  };
}

function mapFrame() {
  const cols = (viewW >= 860 || (viewW >= 700 && viewH < 780)) ? 2 : 1;
  const margin = viewW < 520 ? 16 : 48;
  const colGap = 16;
  const cardW = cols === 1 ? Math.min(460, viewW - margin * 2) : Math.min(360, (viewW - margin * 2 - colGap) / 2);
  const rows = Math.ceil(ISLANDS.length / cols);
  const buttonTop = viewH - 58;
  const limit = buttonTop - 8;
  const compact = viewH < 720 || viewW < 520;
  const titleY = compact ? 16 : 28;
  const titleSize = compact ? 36 : 48;
  const subY = titleY + (compact ? 40 : 56);
  const wrapSub = viewW < 720;
  const starY = subY + (wrapSub ? 40 : 0) + (compact ? 22 : 28);
  const headerBottom = starY + 24;
  const gridRight = margin + cols * cardW + (cols - 1) * colGap;
  const sideRoom = viewW - gridRight;
  const rowGap = 10;
  const useSide = sideRoom >= 300 && viewH >= 640;
  if (useSide) {
    const cardsTop = Math.max(168, headerBottom);
    const avail = limit - cardsTop;
    let cardH = Math.floor((avail - (rows - 1) * rowGap) / rows);
    cardH = Math.max(112, Math.min(156, cardH));
    const cradle = {
      x: gridRight + 20,
      y: cardsTop,
      w: Math.min(460, sideRoom - 36),
      h: Math.min(400, Math.max(180, cardH * rows + rowGap * (rows - 1))),
    };
    return { cols, margin, colGap, cardW, rows, cardsTop, cardH, rowGap, cradle, side: true, titleY, titleSize, subY, starY, buttonTop, gridRight };
  }
  const minCard = 112;
  const need = rows * minCard + (rows - 1) * rowGap;
  let cradleH = Math.min(compact ? 124 : 158, Math.max(88, limit - need - headerBottom));
  let cardsTop = headerBottom + cradleH + 6;
  let avail = limit - cardsTop;
  let cardH = Math.floor((avail - (rows - 1) * rowGap) / rows);
  if (cardH < minCard) {
    cradleH = Math.max(78, limit - need - headerBottom);
    cardsTop = headerBottom + cradleH + 6;
    avail = limit - cardsTop;
    cardH = Math.floor((avail - (rows - 1) * rowGap) / rows);
  }
  cardH = Math.max(90, Math.min(156, cardH));
  const cradle = {
    x: margin,
    y: headerBottom,
    w: Math.max(160, Math.min(viewW - margin * 2, cardW * cols + colGap * (cols - 1))),
    h: Math.max(78, cradleH),
  };
  return { cols, margin, colGap, cardW, rows, cardsTop, cardH, rowGap, cradle, side: false, titleY, titleSize, subY, starY, buttonTop, gridRight };
}

function cradleLayout() {
  ensureCradle();
  const frame = mapFrame();
  const band = frame.cradle;
  const r = cradleBalls[0].r;
  const len = cradleBalls[0].len;
  const span = cradleBalls[cradleBalls.length - 1].anchorX - cradleBalls[0].anchorX;
  const worldW = span + (r + len * 0.92) * 2;
  const worldH = len + r * 2 + 0.18;
  const scale = Math.max(8, Math.min((band.w - 12) / worldW, (band.h - 28) / worldH));
  return {
    frame,
    band,
    scale,
    originX: band.x + band.w / 2,
    originY: band.y + 22,
  };
}

function cradleToScreen(x, y, lay) {
  const box = lay || cradleLayout();
  return {
    x: box.originX + x * box.scale,
    y: box.originY - y * box.scale,
  };
}

function screenToCradle(sx, sy) {
  const lay = cradleLayout();
  return {
    x: (sx - lay.originX) / lay.scale,
    y: (lay.originY - sy) / lay.scale,
  };
}

function cradleArcGoal(rec, x, y) {
  let ang = Math.atan2(x - rec.anchorX, -(y - rec.anchorY));
  const maxA = 1.15;
  if (rec.side < 0) ang = clamp(ang, -maxA, -0.02);
  else ang = clamp(ang, 0.02, maxA);
  return cradlePose(rec, ang);
}

function beginCradleDrag(rec) {
  if (!rec || !rec.side || !cradleWorld || cradleWorld.isLocked()) return false;
  endCradleDrag();
  const body = rec.body;
  const p = body.getPosition();
  const joint = cradleWorld.createJoint(new planck.MouseJoint({
    bodyA: cradleGround,
    bodyB: body,
    target: V(p.x, p.y),
    maxForce: Math.max(30, body.getMass() * 260),
    frequencyHz: 8,
    dampingRatio: 1,
    collideConnected: false,
  }));
  cradleDrag = { rec, joint, goal: { x: p.x, y: p.y } };
  return true;
}

function endCradleDrag() {
  if (!cradleDrag) return;
  const drag = cradleDrag;
  cradleDrag = null;
  if (!cradleWorld || !drag.joint) return;
  cradleWorld.destroyJoint(drag.joint);
  drag.rec.body.setLinearVelocity(V(0, 0));
  drag.rec.body.setAngularVelocity(0);
  drag.rec.body.setAwake(true);
}

const CRADLE_SUBSTEPS = 8;

// Newton's cradle hits between neighbouring balls: swap the normal velocity of
// approaching pairs, sweeping alternately from both sides so a hit runs through the row.
function resolveCradleHits(h) {
  const e = 1;
  const n = cradleBalls.length;
  for (let pass = 0; pass < 2 * n; pass++) {
    let hit = false;
    const forward = pass % 2 === 0;
    for (let k = 0; k < n - 1; k++) {
      const i = forward ? k : n - 2 - k;
      const A = cradleBalls[i].body;
      const B = cradleBalls[i + 1].body;
      const pa = A.getPosition();
      const pb = B.getPosition();
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.hypot(dx, dy) || 1e-9;
      const nx = dx / dist;
      const ny = dy / dist;
      const va = A.getLinearVelocity();
      const vb = B.getLinearVelocity();
      const vrel = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
      const gap = dist - cradleBalls[i].r - cradleBalls[i + 1].r;
      if (vrel > 1e-4 && gap < vrel * h + 0.002) {
        const j = 0.5 * (1 + e) * vrel;
        A.setLinearVelocity(V(va.x - j * nx, va.y - j * ny));
        B.setLinearVelocity(V(vb.x + j * nx, vb.y + j * ny));
        hit = true;
      }
    }
    if (!hit) break;
  }
}

function stepCradle(dt) {
  if (!cradleWorld) return;
  if (cradleDrag && cradleDrag.joint) {
    const goal = cradleArcGoal(cradleDrag.rec, cradleDrag.goal.x, cradleDrag.goal.y);
    cradleDrag.joint.setTarget(V(goal.x, goal.y));
  }
  const h = dt / CRADLE_SUBSTEPS;
  for (let q = 0; q < CRADLE_SUBSTEPS; q++) {
    cradleWorld.step(h, 12, 8);
    resolveCradleHits(h);
  }
}

function cradleBallAt(sx, sy) {
  const lay = cradleLayout();
  let best = null;
  let bestD = 1e9;
  for (const rec of cradleBalls) {
    if (!rec.side) continue;
    const p = rec.body.getPosition();
    const s = cradleToScreen(p.x, p.y, lay);
    const hit = Math.max(rec.r * lay.scale * 1.4, 18);
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d <= hit && d < bestD) {
      best = rec;
      bestD = d;
    }
  }
  return best;
}

function drawCradle() {
  const lay = cradleLayout();
  const band = lay.band;
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.fillStyle = "rgba(255,252,240,0.55)";
  ctx.fill();
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 2;
  ctx.stroke();
  label("Zieh eine äußere Kugel zur Seite", band.x + 12, band.y + 6, band.w < 280 ? 13 : 15, "#5c4632");
  drawMapDemoToggle(band);
  const first = cradleBalls[0];
  const last = cradleBalls[cradleBalls.length - 1];
  const a0 = cradleToScreen(first.anchorX, first.anchorY, lay);
  const a1 = cradleToScreen(last.anchorX, last.anchorY, lay);
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a0.x - 10, a0.y);
  ctx.lineTo(a1.x + 10, a1.y);
  ctx.stroke();
  for (const rec of cradleBalls) {
    const p = rec.body.getPosition();
    const anchor = cradleToScreen(rec.anchorX, rec.anchorY, lay);
    const s = cradleToScreen(p.x, p.y, lay);
    ctx.strokeStyle = "#8d5a34";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    const rad = Math.max(5, rec.r * lay.scale);
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = MAT.steel;
    ctx.fill();
    ctx.strokeStyle = MAT.steelDark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawSteelMark(s.x, s.y, rad, rec.body.getAngle(), false);
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
    ctx.clip();
    fillSteelHighlight(s.x - rad * 0.32, s.y - rad * 0.35, rad);
    ctx.restore();
  }
}


const TREB_PIVOT_Y = 6.7;
const TREB_ARM_SHORT = 1.35;
const TREB_ARM_LONG = 4.7;
const TREB_ARM_THICK = 0.14;
const TREB_COCKED = -1.05;
const TREB_HOLD_DELAY = 0.7;
const TREB_BALL_R = 0.28;
const TREB_SLING_LEN = 1.42;
const TREB_SLING_RELEASE = 0;
const TREB_SLING_WOUND = -0.8;
const TREB_ARM_SAFETY = 1.35;
const TREB_VIEW_W = 36;
const TREB_VIEW_H = 16;
const TREB_VIEW_RIGHT = 4.5;
const TREB_POUCH_INNER = 0.7;
const TREB_POUCH_WALL = 0.09;
const TREB_POUCH_DEPTH = 0.52;
const TREB_POUCH_FLOOR = 0.1;
const TREB_LEATHER = "#7a4a2e";
const TREB_LEATHER_DARK = "#5a3220";
const TREB_CAT_GROUND = 0x0001;
const TREB_CAT_FRAME = 0x0002;
const TREB_CAT_ROPE = 0x0004;
const TREB_CAT_POUCH = 0x0008;
const TREB_CAT_BALL = 0x0010;

function setMapDemo(kind) {
  mapDemo = kind === "trebuchet" ? "trebuchet" : "cradle";
  if (mapDemo === "trebuchet") ensureTrebuchet();
  else endCradleDrag();
}

function mapDemoBandHit(sx, sy) {
  const band = mapFrame().cradle;
  return sx >= band.x && sx <= band.x + band.w && sy >= band.y && sy <= band.y + band.h;
}

function mapDemoToggleAt(sx, sy) {
  const band = mapFrame().cradle;
  if (sy < band.y || sy > band.y + 28 || sx < band.x + band.w - 160 || sx > band.x + band.w - 8) return null;
  const mid = band.x + band.w - 84;
  if (sx < mid) return "cradle";
  return "trebuchet";
}

function trebPin(body, lx, ly) {
  return { body, local: { x: lx, y: ly } };
}

function trebFinite(body) {
  if (!body) return false;
  const p = body.getPosition();
  const v = body.getLinearVelocity();
  return [p.x, p.y, v.x, v.y, body.getAngle(), body.getAngularVelocity()].every(Number.isFinite);
}

function trebFrameFix(extra) {
  return Object.assign({
    density: 0,
    friction: 0.7,
    restitution: 0,
    filterGroupIndex: -3,
    filterCategoryBits: TREB_CAT_FRAME,
    filterMaskBits: TREB_CAT_GROUND | TREB_CAT_FRAME,
  }, extra || {});
}

function trebPouchFix(density) {
  return {
    density: density,
    friction: 0.95,
    restitution: 0,
    filterGroupIndex: -4,
    filterCategoryBits: TREB_CAT_POUCH,
    filterMaskBits: TREB_CAT_GROUND | TREB_CAT_BALL,
  };
}

function trebStrandLen(strand) {
  if (!strand || !strand.anchorA || !strand.anchorB) return 0;
  const a = strand.anchorA.body.getWorldPoint(V(strand.anchorA.local.x, strand.anchorA.local.y));
  const b = strand.anchorB.body.getWorldPoint(V(strand.anchorB.local.x, strand.anchorB.local.y));
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function trebMakeStrand(pinA, pinB) {
  const a = pinWorld(pinA);
  const b = pinWorld(pinB);
  const length = Math.max(0.2, Math.hypot(b.x - a.x, b.y - a.y));
  const distJ = trebWorld.createJoint(new planck.DistanceJoint({
    bodyA: pinA.body,
    bodyB: pinB.body,
    localAnchorA: V(pinA.local.x, pinA.local.y),
    localAnchorB: V(pinB.local.x, pinB.local.y),
    length,
    frequencyHz: 0,
    dampingRatio: 0,
    collideConnected: false,
  }));
  const ropeJ = trebWorld.createJoint(new planck.RopeJoint({
    bodyA: pinA.body,
    bodyB: pinB.body,
    localAnchorA: V(pinA.local.x, pinA.local.y),
    localAnchorB: V(pinB.local.x, pinB.local.y),
    maxLength: length * ROPE_MAX_STRETCH,
    collideConnected: false,
  }));
  return { anchorA: pinA, anchorB: pinB, restLength: length, distJoint: distJ, ropeJoint: ropeJ };
}

function trebCockedTip() {
  return {
    x: TREB_ARM_LONG * Math.cos(TREB_COCKED),
    y: TREB_PIVOT_Y + TREB_ARM_LONG * Math.sin(TREB_COCKED),
  };
}

function trebPouchPose() {
  const tip = trebCockedTip();
  const half = TREB_POUCH_INNER / 2;
  const L = TREB_SLING_LEN;
  const reach = Math.sqrt(Math.max(1e-6, L * L - half * half));
  const minMouthY = 0.78;
  let mx;
  let my;
  if (tip.y - reach >= minMouthY) {
    mx = tip.x;
    my = tip.y - reach;
  } else {
    my = minMouthY;
    const dy = tip.y - my;
    mx = tip.x + Math.sqrt(Math.max(1e-6, reach * reach - dy * dy));
  }
  const tx = tip.x - mx;
  const ty = tip.y - my;
  const tlen = Math.hypot(tx, ty) || 1;
  const ux = tx / tlen;
  const uy = ty / tlen;
  const px = uy;
  const py = -ux;
  const angle = Math.atan2(py, px);
  function at(lx, ly) {
    return { x: mx + px * lx + ux * ly, y: my + py * lx + uy * ly };
  }
  return {
    tip,
    mx,
    my,
    angle,
    ux,
    uy,
    px,
    py,
    leftRim: at(-half, 0),
    rightRim: at(half, 0),
    bottom: at(0, -(TREB_POUCH_DEPTH - TREB_POUCH_FLOOR / 2)),
    leftWall: at(-half, -TREB_POUCH_DEPTH / 2),
    rightWall: at(half, -TREB_POUCH_DEPTH / 2),
    ball: at(0, -(TREB_POUCH_DEPTH - TREB_POUCH_FLOOR - TREB_BALL_R)),
  };
}

function trebMouthLocalY() {
  return TREB_POUCH_DEPTH - TREB_POUCH_FLOOR / 2;
}

function trebBallRestLocalY() {
  return TREB_POUCH_FLOOR / 2 + TREB_BALL_R;
}

function trebBallInPouch(slack) {
  if (!treb || !treb.ball || !treb.pouchBottom) return false;
  const pad = slack == null ? 0.2 : slack;
  const local = treb.pouchBottom.getLocalPoint(treb.ball.getPosition());
  const yRest = trebBallRestLocalY();
  const mouthY = trebMouthLocalY();
  if (Math.abs(local.x) > TREB_POUCH_INNER / 2 + TREB_BALL_R + pad) return false;
  if (local.y < -TREB_POUCH_FLOOR - pad) return false;
  if (local.y > mouthY + TREB_BALL_R + pad) return false;
  return Math.hypot(local.x, local.y - yRest) < TREB_POUCH_INNER + TREB_BALL_R + pad;
}

function keepBallInPouch() {
  if (!treb || !treb.hooked || !treb.ball || !treb.pouchBottom) return;
  const ball = treb.ball;
  const local = treb.pouchBottom.getLocalPoint(ball.getPosition());
  const yRest = trebBallRestLocalY();
  const mouthY = trebMouthLocalY();
  let x = local.x;
  let y = local.y;
  let fix = false;
  if (y < yRest - 0.05) {
    y = yRest;
    fix = true;
  }
  const wallX = TREB_POUCH_INNER / 2 + TREB_BALL_R * 0.2;
  if (y < mouthY && Math.abs(x) > wallX) {
    x = Math.sign(x) * wallX;
    fix = true;
  }
  if (!fix) return;
  const world = treb.pouchBottom.getWorldPoint(V(x, y));
  ball.setTransform(V(world.x, world.y), ball.getAngle());
  const pv = treb.pouchBottom.getLinearVelocityFromWorldPoint
    ? treb.pouchBottom.getLinearVelocityFromWorldPoint(V(world.x, world.y))
    : treb.pouchBottom.getLinearVelocity();
  const bv = ball.getLinearVelocity();
  ball.setLinearVelocity(V(pv.x + (bv.x - pv.x) * 0.2, pv.y + (bv.y - pv.y) * 0.2));
  ball.setAngularVelocity(treb.pouchBottom.getAngularVelocity());
}

function trebSlingArmRaw() {
  if (!treb || !treb.arm || !treb.pouchRight) return 0;
  const hook = treb.arm.getWorldPoint(V(treb.hookLocal.x, treb.hookLocal.y));
  const rim = treb.pouchRight.getWorldPoint(V(0, TREB_POUCH_DEPTH / 2));
  const sx = rim.x - hook.x;
  const sy = rim.y - hook.y;
  const ang = treb.arm.getAngle();
  const ax = Math.cos(ang);
  const ay = Math.sin(ang);
  return Math.atan2(ax * sy - ay * sx, ax * sx + ay * sy);
}

function trebSlingArmAngle() {
  const raw = trebSlingArmRaw();
  if (!treb) return raw;
  if (treb.lastRel == null) {
    treb.lastRel = raw;
    treb.slingAng = raw;
    return treb.slingAng;
  }
  let delta = raw - treb.lastRel;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  treb.slingAng = (treb.slingAng == null ? raw : treb.slingAng) + delta;
  treb.lastRel = raw;
  return treb.slingAng;
}

function tightenTrebStrands() {
  if (!treb) return;
  const crew = [treb.pouchBottom, treb.pouchLeft, treb.pouchRight, treb.ball];
  if (treb.hookRing && !treb.hooked) crew.push(treb.hookRing);
  function shift(body, mx, my, nx, ny) {
    if (!body || body === treb.arm || body === treb.frame) return;
    const q = body.getPosition();
    body.setPosition(V(q.x + mx, q.y + my));
    const v = body.getLinearVelocity();
    const sep = v.x * nx + v.y * ny;
    const along = mx * nx + my * ny;
    if (along < 0 && sep > 0) body.setLinearVelocity(V(v.x - sep * nx, v.y - sep * ny));
    if (along > 0 && sep < 0) body.setLinearVelocity(V(v.x - sep * nx, v.y - sep * ny));
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const strand of [treb.strandA, treb.strandB]) {
      if (!strand || !strand.restLength || !strand.anchorA || !strand.anchorB) continue;
      const live = trebStrandLen(strand);
      const maxL = strand.restLength * ROPE_MAX_STRETCH;
      if (live <= maxL) continue;
      const a = strand.anchorA.body.getWorldPoint(V(strand.anchorA.local.x, strand.anchorA.local.y));
      const b = strand.anchorB.body.getWorldPoint(V(strand.anchorB.local.x, strand.anchorB.local.y));
      const nx = (b.x - a.x) / live;
      const ny = (b.y - a.y) / live;
      const excess = live - strand.restLength;
      const bIsArm = strand.anchorB.body === treb.arm;
      if (bIsArm) {
        for (const body of crew) shift(body, nx * excess, ny * excess, nx, ny);
      } else {
        for (const body of crew) shift(body, nx * excess * 0.5, ny * excess * 0.5, nx, ny);
        shift(strand.anchorB.body, -nx * excess * 0.5, -ny * excess * 0.5, nx, ny);
      }
    }
  }
  for (const strand of [treb.strandA, treb.strandB]) {
    if (!strand || !strand.restLength) continue;
    treb.maxLive = Math.max(treb.maxLive, trebStrandLen(strand) / strand.restLength);
  }
}

function resetTrebuchet() {
  trebWorld = null;
  trebGround = null;
  treb = null;
  ensureTrebuchet();
}

function ensureTrebuchet() {
  if (trebWorld && treb) return;
  trebWorld = new planck.World(V(0, -24));
  trebGround = trebWorld.createBody();
  trebGround.createFixture(new planck.Edge(V(-200, 0), V(20, 0)), {
    friction: 0.55,
    restitution: 0,
    filterCategoryBits: TREB_CAT_GROUND,
    filterMaskBits: 0xffff,
  });
  const woodFix = trebFrameFix();
  const frame = trebWorld.createBody({ position: V(0, 0) });
  frame.createFixture(new planck.Box(2.4, 0.16, V(0, 0.16), 0), woodFix);
  frame.createFixture(new planck.Box(0.16, TREB_PIVOT_Y / 2, V(0, TREB_PIVOT_Y / 2), 0), woodFix);
  frame.createFixture(new planck.Box(0.14, 3.15, V(-1.2, 2.6), 0.48), woodFix);
  frame.createFixture(new planck.Box(0.14, 3.15, V(1.2, 2.6), -0.48), woodFix);

  const arm = trebWorld.createDynamicBody({
    position: V(0, TREB_PIVOT_Y),
    angle: TREB_COCKED,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.04,
  });
  const halfLen = (TREB_ARM_SHORT + TREB_ARM_LONG) / 2;
  const armOff = (TREB_ARM_LONG - TREB_ARM_SHORT) / 2;
  arm.createFixture(new planck.Box(halfLen, TREB_ARM_THICK, V(armOff, 0), 0), trebFrameFix({
    density: 1.4,
    friction: 0.62,
    restitution: 0,
  }));
  trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: frame,
    bodyB: arm,
    localAnchorA: V(0, TREB_PIVOT_Y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  const holdJoint = trebWorld.createJoint(new planck.WeldJoint({
    bodyA: frame,
    bodyB: arm,
    localAnchorA: V(0, TREB_PIVOT_Y),
    localAnchorB: V(0, 0),
    referenceAngle: TREB_COCKED,
    collideConnected: false,
  }));

  const tipS = arm.getWorldPoint(V(-TREB_ARM_SHORT, 0));
  const wh = 0.52;
  const ww = 0.48;
  const weight = trebWorld.createDynamicBody({
    position: V(tipS.x, tipS.y - wh - 0.1),
    angularDamping: 0.15,
    linearDamping: 0.02,
  });
  weight.createFixture(new planck.Box(ww, wh), trebFrameFix({
    density: 36,
    friction: 0.7,
    restitution: 0.05,
  }));
  trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: arm,
    bodyB: weight,
    localAnchorA: V(-TREB_ARM_SHORT, 0),
    localAnchorB: V(0, wh + 0.06),
    collideConnected: false,
  }));

  const pose = trebPouchPose();
  const pouchBottom = trebWorld.createDynamicBody({
    position: V(pose.bottom.x, pose.bottom.y),
    angle: pose.angle,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.08,
  });
  pouchBottom.createFixture(
    new planck.Box(TREB_POUCH_INNER / 2 + TREB_POUCH_WALL / 2, TREB_POUCH_FLOOR / 2),
    trebPouchFix(2.2)
  );
  const pouchLeft = trebWorld.createDynamicBody({
    position: V(pose.leftWall.x, pose.leftWall.y),
    angle: pose.angle,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.08,
  });
  pouchLeft.createFixture(
    new planck.Box(TREB_POUCH_WALL / 2, TREB_POUCH_DEPTH / 2),
    trebPouchFix(1.8)
  );
  const pouchRight = trebWorld.createDynamicBody({
    position: V(pose.rightWall.x, pose.rightWall.y),
    angle: pose.angle,
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.08,
  });
  pouchRight.createFixture(
    new planck.Box(TREB_POUCH_WALL / 2, TREB_POUCH_DEPTH / 2),
    trebPouchFix(1.8)
  );
  trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pouchBottom,
    bodyB: pouchLeft,
    localAnchorA: V(-TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2),
    localAnchorB: V(0, -TREB_POUCH_DEPTH / 2 + TREB_POUCH_FLOOR / 2),
    enableLimit: true,
    lowerAngle: -2.4,
    upperAngle: 0.28,
    collideConnected: false,
  }));
  trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: pouchBottom,
    bodyB: pouchRight,
    localAnchorA: V(TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2),
    localAnchorB: V(0, -TREB_POUCH_DEPTH / 2 + TREB_POUCH_FLOOR / 2),
    enableLimit: true,
    lowerAngle: -0.28,
    upperAngle: 2.4,
    collideConnected: false,
  }));
  const pouchWeldL = trebWorld.createJoint(new planck.WeldJoint({
    bodyA: pouchBottom,
    bodyB: pouchLeft,
    localAnchorA: V(-TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2),
    localAnchorB: V(0, -TREB_POUCH_DEPTH / 2 + TREB_POUCH_FLOOR / 2),
    collideConnected: false,
  }));
  const pouchWeldR = trebWorld.createJoint(new planck.WeldJoint({
    bodyA: pouchBottom,
    bodyB: pouchRight,
    localAnchorA: V(TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2),
    localAnchorB: V(0, -TREB_POUCH_DEPTH / 2 + TREB_POUCH_FLOOR / 2),
    collideConnected: false,
  }));

  const hookLocal = { x: TREB_ARM_LONG + 0.14, y: -0.05 };
  const fixedLocal = { x: TREB_ARM_LONG, y: 0.04 };
  const pinFixed = trebPin(arm, fixedLocal.x, fixedLocal.y);
  const pinHook = trebPin(arm, hookLocal.x, hookLocal.y);
  const pinPouchL = trebPin(pouchLeft, 0, TREB_POUCH_DEPTH / 2);
  const pinPouchR = trebPin(pouchRight, 0, TREB_POUCH_DEPTH / 2);
  const hookPos = pinWorld(pinHook);
  const hookRing = trebWorld.createDynamicBody({
    position: V(hookPos.x, hookPos.y),
    bullet: true,
    linearDamping: 0.02,
    angularDamping: 0.02,
  });
  hookRing.createFixture(new planck.Circle(0.05), {
    density: 1.2,
    friction: 0,
    restitution: 0,
    filterCategoryBits: TREB_CAT_ROPE,
    filterMaskBits: 0,
  });
  const hookJoint = trebWorld.createJoint(new planck.RevoluteJoint({
    bodyA: arm,
    bodyB: hookRing,
    localAnchorA: V(hookLocal.x, hookLocal.y),
    localAnchorB: V(0, 0),
    collideConnected: false,
  }));
  const pinRing = trebPin(hookRing, 0, 0);
  const strandA = trebMakeStrand(pinPouchL, pinFixed);
  const strandB = trebMakeStrand(pinPouchR, pinRing);

  const ball = trebWorld.createDynamicBody({
    position: V(pose.ball.x, pose.ball.y),
    bullet: true,
    linearDamping: 0.01,
    angularDamping: 0.02,
  });
  ball.createFixture(new planck.Circle(TREB_BALL_R), {
    density: 3.2,
    friction: 0.55,
    restitution: 0.08,
    filterCategoryBits: TREB_CAT_BALL,
    filterMaskBits: TREB_CAT_GROUND | TREB_CAT_POUCH,
  });

  treb = {
    frame,
    arm,
    weight,
    ball,
    holdJoint,
    pouchBottom,
    pouchLeft,
    pouchRight,
    pouchWeldL,
    pouchWeldR,
    strandA,
    strandB,
    hookRing,
    hookJoint,
    pinA: pinFixed,
    pinB: pinHook,
    hookLocal,
    fixedLocal,
    released: false,
    hooked: true,
    slingWound: false,
    holdTimer: 0,
    frozen: false,
    armOff,
    halfLen,
    ww,
    wh,
    exploded: false,
    maxBallX: ball.getPosition().x,
    minBallX: ball.getPosition().x,
    maxLive: 1,
    bestOut: 0,
    noSlip: false,
  };
  for (let i = 0; i < 12; i++) {
    trebWorld.step(1 / 60, 20, 16);
    keepBallInPouch();
    tightenTrebStrands();
  }
  treb.maxLive = 1;
  if (treb.ball) {
    const p = treb.ball.getPosition();
    treb.maxBallX = p.x;
    treb.minBallX = p.x;
    treb.ball.setLinearVelocity(V(0, 0));
    treb.ball.setAngularVelocity(0);
  }
  [pouchBottom, pouchLeft, pouchRight, arm, weight].forEach((body) => {
    if (!body) return;
    body.setLinearVelocity(V(0, 0));
    body.setAngularVelocity(0);
  });
  treb.lastRel = null;
  treb.slingAng = null;
}

function releaseTrebuchet() {
  if (!treb || !trebWorld || treb.released) return;
  if (trebWorld.isLocked && trebWorld.isLocked()) return;
  if (treb.holdJoint) {
    trebWorld.destroyJoint(treb.holdJoint);
    treb.holdJoint = null;
  }
  treb.released = true;
  treb.arm.setAwake(true);
  treb.weight.setAwake(true);
  if (treb.ball) treb.ball.setAwake(true);
  if (treb.pouchBottom) treb.pouchBottom.setAwake(true);
  if (treb.pouchLeft) treb.pouchLeft.setAwake(true);
  if (treb.pouchRight) treb.pouchRight.setAwake(true);
}

function slipTrebuchetHook() {
  if (!treb || !treb.hooked || !trebWorld) return;
  if (trebWorld.isLocked && trebWorld.isLocked()) return;
  if (treb.hookJoint) {
    trebWorld.destroyJoint(treb.hookJoint);
    treb.hookJoint = null;
  }
  if (treb.pouchWeldR) {
    trebWorld.destroyJoint(treb.pouchWeldR);
    treb.pouchWeldR = null;
  }
  if (treb.ball) {
    for (let f = treb.ball.getFixtureList(); f; f = f.getNext()) {
      if (f.setFilterData) {
        f.setFilterData({
          groupIndex: 0,
          categoryBits: TREB_CAT_BALL,
          maskBits: TREB_CAT_GROUND,
        });
      }
    }
  }
  const tip = treb.arm ? treb.arm.getWorldPoint(V(TREB_ARM_LONG, 0)) : { x: 0, y: 0 };
  const bp = treb.ball ? treb.ball.getPosition() : { x: 0, y: 0 };
  const bv = treb.ball ? treb.ball.getLinearVelocity() : { x: 0, y: 0 };
  treb.slipAng = treb.arm ? treb.arm.getAngle() : 0;
  treb.slipRel = trebSlingArmAngle();
  treb.slip = { x: bp.x, y: bp.y, vx: bv.x, vy: bv.y, tipX: tip.x, tipY: tip.y };
  treb.hooked = false;
}

function onTrebuchetClick() {
  ensureTrebuchet();
  if (!treb) return;
  if (!treb.released) releaseTrebuchet();
  else resetTrebuchet();
}

function stepTrebuchet(dt) {
  if (!trebWorld || !treb || treb.frozen) return;
  if (!treb.released) {
    treb.holdTimer += dt;
    if (treb.holdTimer >= TREB_HOLD_DELAY) releaseTrebuchet();
  }
  if (treb.released && treb.hooked) {
    const rel = trebSlingArmAngle();
    if (rel < TREB_SLING_WOUND) treb.slingWound = true;
    let ang = treb.arm.getAngle();
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    const bv = treb.ball.getLinearVelocity();
    const speed = Math.hypot(bv.x, bv.y);
    if (speed > treb.bestOut) treb.bestOut = speed;
    if (!treb.noSlip) {
      if (treb.slingWound && rel >= TREB_SLING_RELEASE) slipTrebuchetHook();
      else if (ang >= TREB_ARM_SAFETY) slipTrebuchetHook();
    }
  }
  tightenTrebStrands();
  trebWorld.step(dt, 24, 20);
  if (treb.hooked) keepBallInPouch();
  tightenTrebStrands();
  if (treb.hooked) keepBallInPouch();
  if (treb.ball) {
    const p = treb.ball.getPosition();
    treb.maxBallX = Math.max(treb.maxBallX, p.x);
    treb.minBallX = Math.min(treb.minBallX, p.x);
  }
  const pouchOk = [treb.pouchBottom, treb.pouchLeft, treb.pouchRight].every((b) => !b || trebFinite(b));
  if (![treb.arm, treb.weight, treb.ball].every(trebFinite) || !pouchOk) treb.exploded = true;
}

function trebuchetLayout() {
  ensureTrebuchet();
  const frame = mapFrame();
  const band = frame.cradle;
  const worldW = TREB_VIEW_W;
  const worldH = TREB_VIEW_H;
  const scale = Math.max(5, Math.min((band.w - 16) / worldW, (band.h - 36) / worldH));
  return {
    frame,
    band,
    scale,
    originX: band.x + band.w - 10 - TREB_VIEW_RIGHT * scale,
    originY: band.y + band.h - 10,
  };
}

function trebToScreen(x, y, lay) {
  const box = lay || trebuchetLayout();
  return { x: box.originX + x * box.scale, y: box.originY - y * box.scale };
}

function fillTrebPoly(pts, lay, fill, stroke, width) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  const s0 = trebToScreen(pts[0].x, pts[0].y, lay);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = trebToScreen(pts[i].x, pts[i].y, lay);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke || "#5c4632";
  ctx.lineWidth = width || 1.5;
  ctx.stroke();
}

function trebBoxPts(body, hx, hy, ox, oy, ang) {
  const ca = Math.cos(ang || 0);
  const sa = Math.sin(ang || 0);
  const corners = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  return corners.map(([x, y]) => {
    const lx = ox + x * ca - y * sa;
    const ly = oy + x * sa + y * ca;
    const p = body.getWorldPoint(V(lx, ly));
    return { x: p.x, y: p.y };
  });
}

function drawMapDemoToggle(band) {
  const x = band.x + band.w - 156;
  const y = band.y + 5;
  label("Pendel", x + 4, y, 14, mapDemo === "cradle" ? "#3a2a1c" : "#8a7b64");
  label("Tribok", x + 78, y, 14, mapDemo === "trebuchet" ? "#3a2a1c" : "#8a7b64");
}

function drawTrebStrand(strand, lay) {
  if (!strand || !strand.anchorA || !strand.anchorB) return;
  const a = strand.anchorA.body.getWorldPoint(V(strand.anchorA.local.x, strand.anchorA.local.y));
  const b = strand.anchorB.body.getWorldPoint(V(strand.anchorB.local.x, strand.anchorB.local.y));
  const s0 = trebToScreen(a.x, a.y, lay);
  const s1 = trebToScreen(b.x, b.y, lay);
  ctx.strokeStyle = MAT.hemp;
  ctx.lineWidth = Math.max(2, 0.16 * lay.scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y);
  ctx.lineTo(s1.x, s1.y);
  ctx.stroke();
}

function drawTrebPouch(lay) {
  if (!treb.pouchBottom || !treb.pouchLeft || !treb.pouchRight) return;
  fillTrebPoly(trebBoxPts(treb.pouchBottom, TREB_POUCH_INNER / 2 + TREB_POUCH_WALL / 2, TREB_POUCH_FLOOR / 2, 0, 0, 0), lay, TREB_LEATHER, TREB_LEATHER_DARK, 1.6);
  fillTrebPoly(trebBoxPts(treb.pouchLeft, TREB_POUCH_WALL / 2, TREB_POUCH_DEPTH / 2, 0, 0, 0), lay, TREB_LEATHER, TREB_LEATHER_DARK, 1.6);
  fillTrebPoly(trebBoxPts(treb.pouchRight, TREB_POUCH_WALL / 2, TREB_POUCH_DEPTH / 2, 0, 0, 0), lay, TREB_LEATHER, TREB_LEATHER_DARK, 1.6);
  const lTop = treb.pouchLeft.getWorldPoint(V(0, TREB_POUCH_DEPTH / 2));
  const rTop = treb.pouchRight.getWorldPoint(V(0, TREB_POUCH_DEPTH / 2));
  const lBot = treb.pouchBottom.getWorldPoint(V(-TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2));
  const rBot = treb.pouchBottom.getWorldPoint(V(TREB_POUCH_INNER / 2, TREB_POUCH_FLOOR / 2));
  const midBot = treb.pouchBottom.getWorldPoint(V(0, -TREB_POUCH_FLOOR / 2));
  const sL = trebToScreen(lTop.x, lTop.y, lay);
  const sLB = trebToScreen(lBot.x, lBot.y, lay);
  const sM = trebToScreen(midBot.x, midBot.y, lay);
  const sRB = trebToScreen(rBot.x, rBot.y, lay);
  const sR = trebToScreen(rTop.x, rTop.y, lay);
  ctx.beginPath();
  ctx.moveTo(sL.x, sL.y);
  ctx.lineTo(sLB.x, sLB.y);
  ctx.quadraticCurveTo(sM.x, sM.y, sRB.x, sRB.y);
  ctx.lineTo(sR.x, sR.y);
  ctx.strokeStyle = TREB_LEATHER_DARK;
  ctx.lineWidth = Math.max(2.2, 0.11 * lay.scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawTrebuchet() {
  const lay = trebuchetLayout();
  const band = lay.band;
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.fillStyle = "rgba(255,252,240,0.55)";
  ctx.fill();
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 2;
  ctx.stroke();
  const hint = !treb || !treb.released ? "Klick: Haltepin lösen" : "Klick: neu spannen";
  label(hint, band.x + 12, band.y + 6, band.w < 280 ? 13 : 15, "#5c4632");
  drawMapDemoToggle(band);
  if (!treb) return;
  ctx.save();
  ctx.beginPath();
  roundRect(band.x, band.y, band.w, band.h, 14);
  ctx.clip();
  const g0 = trebToScreen(-(TREB_VIEW_W - TREB_VIEW_RIGHT), 0, lay);
  const g1 = trebToScreen(TREB_VIEW_RIGHT + 2, 0, lay);
  ctx.strokeStyle = "#d7c39a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.stroke();
  fillTrebPoly(trebBoxPts(treb.frame, 2.4, 0.16, 0, 0.16, 0), lay, MAT.wood, "#5c4632");
  fillTrebPoly(trebBoxPts(treb.frame, 0.16, TREB_PIVOT_Y / 2, 0, TREB_PIVOT_Y / 2, 0), lay, MAT.wood, "#5c4632");
  fillTrebPoly(trebBoxPts(treb.frame, 0.14, 3.15, -1.2, 2.6, 0.48), lay, MAT.wood, "#5c4632");
  fillTrebPoly(trebBoxPts(treb.frame, 0.14, 3.15, 1.2, 2.6, -0.48), lay, MAT.wood, "#5c4632");
  fillTrebPoly(trebBoxPts(treb.arm, treb.halfLen, TREB_ARM_THICK, treb.armOff, 0, 0), lay, MAT.wood, "#5c4632", 2);
  fillTrebPoly(trebBoxPts(treb.weight, treb.ww, treb.wh, 0, 0, 0), lay, MAT.wood, "#5c4632", 2);
  if (treb.arm && treb.hookLocal) {
    const hookBase = treb.arm.getWorldPoint(V(TREB_ARM_LONG, 0));
    const hookTip = treb.arm.getWorldPoint(V(treb.hookLocal.x + 0.06, treb.hookLocal.y - 0.06));
    const a = trebToScreen(hookBase.x, hookBase.y, lay);
    const b = trebToScreen(hookTip.x, hookTip.y, lay);
    ctx.strokeStyle = MAT.steel;
    ctx.lineWidth = Math.max(2, 0.07 * lay.scale);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = MAT.steel;
    ctx.beginPath();
    ctx.arc(b.x, b.y, Math.max(2.2, 0.055 * lay.scale), 0, Math.PI * 2);
    ctx.fill();
  }
  drawTrebStrand(treb.strandA, lay);
  drawTrebStrand(treb.strandB, lay);
  if (treb.hookRing) {
    const rp = treb.hookRing.getPosition();
    const rs = trebToScreen(rp.x, rp.y, lay);
    ctx.strokeStyle = MAT.steel;
    ctx.lineWidth = Math.max(1.4, 0.05 * lay.scale);
    ctx.beginPath();
    ctx.arc(rs.x, rs.y, Math.max(2.4, 0.07 * lay.scale), 0, Math.PI * 2);
    ctx.stroke();
  }
  drawTrebPouch(lay);
  if (treb.holdJoint) {
    const tip = treb.arm.getWorldPoint(V(TREB_ARM_LONG * 0.35, 0));
    const s = trebToScreen(tip.x, tip.y, lay);
    ctx.fillStyle = MAT.steel;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(3, 0.08 * lay.scale), 0, Math.PI * 2);
    ctx.fill();
  }
  const bp = treb.ball.getPosition();
  const bs = trebToScreen(bp.x, bp.y, lay);
  const rad = Math.max(4, TREB_BALL_R * lay.scale);
  ctx.beginPath();
  ctx.arc(bs.x, bs.y, rad, 0, Math.PI * 2);
  ctx.fillStyle = MAT.steel;
  ctx.fill();
  ctx.strokeStyle = MAT.steelDark;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  drawSteelMark(bs.x, bs.y, rad, treb.ball.getAngle(), false);
  ctx.save();
  ctx.beginPath();
  ctx.arc(bs.x, bs.y, rad, 0, Math.PI * 2);
  ctx.clip();
  fillSteelHighlight(bs.x - rad * 0.32, bs.y - rad * 0.35, rad);
  ctx.restore();
  const pivot = trebToScreen(0, TREB_PIVOT_Y, lay);
  ctx.fillStyle = "#5c4632";
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, Math.max(3, 0.1 * lay.scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderMap() {
  const frame = mapFrame();
  label("Crayon", frame.margin, frame.titleY, frame.titleSize);
  if (viewW < 720) {
    label("Male die Welt.", frame.margin, frame.subY, 16, "#5c4632");
    label("Die Kugel muss jeden Stern berühren.", frame.margin, frame.subY + 20, 16, "#5c4632");
  } else {
    label("Male die Welt. Die Spielkugel muss jeden Stern berühren.", frame.margin, frame.subY, frame.titleSize > 40 ? 20 : 16, "#5c4632");
  }
  label("Sterne " + starCount() + " / " + ORDER.length, frame.margin, frame.starY, 18, "#8a5a20");
  if (mapDemo === "trebuchet") drawTrebuchet();
  else drawCradle();
  const owned = starCount();
  ISLANDS.forEach((island, i) => {
    const col = i % frame.cols;
    const row = Math.floor(i / frame.cols);
    const x = frame.margin + col * (frame.cardW + frame.colGap);
    const y = frame.cardsTop + row * (frame.cardH + frame.rowGap);
    const open = owned >= island.need;
    roundRect(x, y, frame.cardW, frame.cardH, 16);
    ctx.fillStyle = open ? "rgba(255,252,240,0.65)" : "rgba(220,210,190,0.55)";
    ctx.fill();
    ctx.strokeStyle = "#5c4632";
    ctx.stroke();
    label(island.name, x + 16, y + 8, frame.cardH < 120 ? 18 : 24);
    if (frame.cardH >= 118) {
      label(open ? island.blurb : "noch " + (island.need - owned) + " Sterne", x + 16, y + 40, 15, "#6b5844");
    }
    island.levels.forEach((id, n) => {
      const bx = x + 16 + (n % 4) * 62;
      const by = y + frame.cardH - 40;
      const done = progress().cleared[id];
      button(bx, by, 56, 32, done ? "★" : String(n + 1), () => {
        if (open) buildLevel(LEVELS[id]);
      }, { locked: !open, size: 16 });
    });
  });
  const actions = [
    ["Schmierzettel", () => buildLevel(LEVELS.sandbox)],
    ["Editor", openEditor],
    ["Hilfe", () => { mode = "help"; }],
  ];
  const gapb = 10;
  const rowW = Math.min(640, viewW - frame.margin * 2);
  const bw = Math.floor((rowW - gapb * (actions.length - 1)) / actions.length);
  let ax = frame.margin;
  for (const [text, fn] of actions) {
    button(ax, frame.buttonTop, bw, 42, text, fn, { size: bw < 150 ? 14 : 16 });
    ax += bw + gapb;
  }
  const list = Object.values(customs());
  if (list.length && frame.side) {
    const y0 = frame.cradle.y + frame.cradle.h + 12;
    if (y0 + 44 < frame.buttonTop) {
      label("Eigene Zettel", frame.cradle.x, y0, 18);
      list.slice(0, 4).forEach((doc, i) => {
        button(frame.cradle.x, y0 + 28 + i * 48, Math.min(220, frame.cradle.w), 42, doc.name || "Ohne Titel", () => buildLevel(levelFromDoc(doc)), { size: 16 });
      });
    }
  } else if (list.length && frame.gridRight + 250 < viewW) {
    label("Eigene Zettel", frame.gridRight + 28, frame.cardsTop, 22);
    list.slice(0, 6).forEach((doc, i) => {
      button(frame.gridRight + 28, frame.cardsTop + 40 + i * 52, 220, 44, doc.name || "Ohne Titel", () => buildLevel(levelFromDoc(doc)), { size: 16 });
    });
  }
}

function renderHelp() {
  label("So kritzelt es", 48, 36, 40);
  const lines = [
    "Linke Maustaste, Finger oder Stift: zeichnen. Loslassen erweckt den Strich.",
    "Offene Linie: leichter, etwas federnder Draht. Geschlossene Fläche: schwerer Körper.",
    "Mit dem Stift bestimmt der Druck die Dicke offener Drähte: fester Druck macht sie breiter und schwerer. Maus und Finger behalten die Standarddicke.",
    "Ein runder Strich wird eine Kugel. Sie rollt und gibt ihren Schwung weiter.",
    "Winziger Kreis in der Fläche eines Körpers oder auf dem Boden: Nagel. Ein Seil daran hält fest.",
    "Zwei Nägel in derselben Fläche machen sie starr.",
    "Linie von Nagel zu Nagel: Seil, so lang wie der Strich, mit allen Schlenkern. Eine Spitze unter 15°, die senkrecht trifft, zerschneidet es.",
    "Am Rand eines Gegenstands fasst du ihn und ziehst ihn. In der Fläche wird gezeichnet; ein kleiner Kreis setzt einen Nagel. Ein längerer Zug aus der Mitte greift nachträglich.",
    "Den Ball mit einem gerade gezogenen Gegenstand stoßen löst das Level, aber ohne Konfetti.",
    "Auf der Karte hängt ein Kugelstoßpendel. Zieh eine äußere Kugel zur Seite und lass los.",
    "Klick auf die Spielkugel: kleiner Schubs. Rechtsklick oder Doppeltipp: radiert das Deine.",
    "Rakete: etwas darauf fallen lassen. Sie fliegt in Blickrichtung und kommt wieder.",
    "Elegant: genau ein Gegenstand, ohne die Kugel anzuklicken. Nägel zählen nicht.",
    "Old School: kein Schubs, kein eigener Nagel, kein Seil, nichts unter der Kugel.",
    "Das Geodreieck oben rechts lässt den Strich frei; erst nach dem Loslassen rastet die Form ein. Ellipsen und Kreise werden vorher erkannt.",
    "Shift+Rad zoomt, mittlere Taste verschiebt das Blatt.",
    "R setzt das Level zurück. M oder Esc öffnet die Karte.",
  ];
  const helpStep = Math.min(34, Math.max(20, Math.floor((viewH - 110 - 96) / lines.length)));
  lines.forEach((line, i) => label(line, 48, 100 + i * helpStep, helpStep < 26 ? 15 : 18, "#3a2a1c"));
  button(48, viewH - 84, 140, 48, "Karte", showMap);
}

function showMap() {
  endDrag();
  mode = "map";
  namebox.style.display = "none";
  world = null;
  confetti = [];
  ensureCradle();
  if (mapDemo === "trebuchet") ensureTrebuchet();
}

function freshDoc() {
  return {
    id: "",
    name: "Ohne Titel",
    ball: [6, 2],
    stars: [[24, 2.1]],
    rockets: [],
    pins: [],
    strokes: [{
      kind: "terrain",
      color: "#3f8f55",
      points: [[0, 0], [32, 0], [32, 1.3], [0, 1.3], [0, 0]],
    }],
  };
}

function openEditor() {
  editorDoc = freshDoc();
  editorTool = "terrain";
  mode = "editor";
  resetCam();
  namebox.style.display = "block";
  namebox.value = editorDoc.name;
  namebox.style.left = "48px";
  namebox.style.top = "20px";
}

function levelFromDoc(doc) {
  const solids = [];
  const wires = [];
  const decor = [];
  for (const stroke of doc.strokes || []) {
    const raw = (stroke.points || []).map((p) => ({ x: p[0], y: p[1] }));
    if (stroke.kind === "decor") {
      const pts = dedupe(simplify(raw, 0.05));
      if (pts.length >= 2) decor.push({ pts, color: stroke.color, width: 0.12 });
      continue;
    }
    const tidy = tidyTerrain(raw);
    if (tidy.length < 2) continue;
    if (isClosedStroke(tidy)) {
      const ring = dedupe(tidy.slice(0, -1));
      if (ring.length >= 3 && !selfIntersects(ring, true) && Math.abs(signedArea(ring)) > 0.05) {
        solids.push({ pts: ensureCCW(ring), color: stroke.color });
        continue;
      }
    }
    wires.push({ pts: tidy, color: stroke.color });
  }
  return {
    id: doc.id || "custom",
    name: doc.name || "Ohne Titel",
    hint: "Eigenes Blatt. M bringt dich zurück.",
    ball: doc.ball || [6, 2],
    stars: doc.stars && doc.stars.length ? doc.stars : [[24, 2]],
    solids, wires, decor,
    pins: doc.pins || [],
    rockets: doc.rockets || [],
    custom: true,
  };
}

function saveEditor() {
  if (!editorDoc) return;
  editorDoc.name = namebox.value || "Ohne Titel";
  if (!editorDoc.id) editorDoc.id = "c" + Date.now();
  const all = customs();
  all[editorDoc.id] = editorDoc;
  saveJSON("crayon-customs", all);
}

function renderEditor() {
  if (!editorDoc) return;
  if (strokeSnaps()) drawGeoGrid();
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (const stroke of editorDoc.strokes) {
    const pts = stroke.points.map(([x, y]) => ({ x, y }));
    if (stroke.kind === "terrain" && isClosedStroke(pts)) crayonFill(pts, stroke.color);
    crayonPath(pts, stroke.color, stroke.kind === "decor" ? 0.1 : 0.16);
  }
  ctx.restore();
  const b = editorDoc.ball;
  const bs = worldToScreen(b[0], b[1]);
  ctx.fillStyle = MAT.steel;
  ctx.beginPath();
  ctx.arc(bs.x, bs.y, BALL_R * camScale(), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = MAT.steelDark;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const star of editorDoc.stars) {
    const s = worldToScreen(star[0], star[1]);
    ctx.fillStyle = "#f2c14b";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const pin of editorDoc.pins) {
    const s = worldToScreen(pin[0], pin[1]);
    ctx.strokeStyle = "#24324a";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const rocket of editorDoc.rockets) {
    const s = worldToScreen(rocket.x, rocket.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-rocket.a);
    ctx.fillStyle = "#d94b3a";
    ctx.fillRect(-18, -8, 36, 16);
    ctx.restore();
  }
  if (pointer && pointer.pts) crayonPath(pointer.pts, MAT.ink, pointer.pts.some((p) => p.thick) ? "live" : THICK);
  label("Editor", 48, 64, 28);
  const tools = [
    ["terrain", "Gelände"],
    ["decor", "Deko"],
    ["ball", "Kugel"],
    ["star", "Stern"],
    ["rocket", "Rakete"],
    ["pin", "Nagel"],
    ["erase", "Weg"],
  ];
  tools.forEach((tool, i) => {
    button(24 + i * 112, viewH - 78, 104, 44, tool[1], () => { editorTool = tool[0]; }, { on: editorTool === tool[0], size: 16 });
  });
  button(viewW - 360, 70, 100, 42, "Test", () => {
    saveEditor();
    returnMode = "editor";
    namebox.style.display = "none";
    buildLevel(levelFromDoc(editorDoc));
  }, { size: 16 });
  button(viewW - 250, 70, 110, 42, "Speichern", saveEditor, { size: 16 });
  button(viewW - 130, 70, 100, 42, "Karte", showMap, { size: 16 });
}

function render() {
  ui = [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  if (paper) {
    const pat = ctx.createPattern(paper, "repeat");
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, viewW, viewH);
  } else {
    ctx.fillStyle = "#f4e6c6";
    ctx.fillRect(0, 0, viewW, viewH);
  }
  ctx.fillStyle = "rgba(90,60,20,0.05)";
  ctx.fillRect(0, 0, viewW, viewH);
  if (mode === "map") renderMap();
  else if (mode === "help") renderHelp();
  else if (mode === "editor") renderEditor();
  else {
    renderPlay();
    drawHUD();
    drawConfetti();
  }
}

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
  const from = trail[0];
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
      ? { body: playDrag.body, at: playDrag.body.getWorldPoint(V(playDrag.local.x, playDrag.local.y)) }
      : null;
    endDrag();
    if (held && mode === "play") tryAnchorDragEnd(held.body, { x: held.at.x, y: held.at.y }, current.trail);
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

    buildLevel(LEVELS["ein-klotz"]);
    const pusher = makeBox({ x: 3.1, y: 2.3, hw: 0.4, hh: 0.4, color: "#d94b3a" });
    for (let i = 0; i < 40; i++) step(1 / 60);
    const shoveX0 = ball.getPosition().x;
    beginDrag(pusher.getPosition().x, pusher.getPosition().y);
    for (let i = 0; i < 120; i++) {
      const bp = ball.getPosition();
      moveDrag(bp.x, bp.y);
      step(1 / 60);
    }
    lines.push("INFO shove ball " + ball.getPosition().x.toFixed(2) + " box " + pusher.getPosition().x.toFixed(2) + " trick " + stats.dragTrick);
    check("a dragged body can shove the ball", ball.getPosition().x > shoveX0 + 0.35);
    check("dragging a body into the ball is a trick", stats.dragTrick);
    for (const star of stars) star.got = true;
    step(1 / 60);
    check("a trick still solves the level", won);
    check("a trick skips confetti", confetti.length === 0);
    endDrag();

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

    {
      // Verankern: kurzer gerader Zug Boden -> Körper, Ketten nur vom Boden aus.
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
      const ancFreeDirect = anchorBody(ancD, ancC.body, { x: 29.6, y: ancTopC - 0.1 }, { x: 29.6, y: ancTopC + 0.2 });
      const ancFreeGesture = tryAnchorGesture([{ x: 29.6, y: ancTopC - 0.15 }, { x: 29.6, y: ancTopC + 0.25 }]);
      check("chain between two free bodies is refused", !ancFreeDirect && !ancFreeGesture && ancD.body.isDynamic() && ancC.body.isDynamic());

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

    buildLevel(LEVELS["ein-klotz"]);
    const nailMot = rememberPin(16, 8, ground, true);
    const nailMotBox = ancBox(14, 7.2, 4, 0.8, "#8d5a34");
    for (let i = 0; i < 60; i++) step(1 / 60);
    const nailMotScr = worldToScreen(pinWorld(nailMot).x, pinWorld(nailMot).y);
    onPointerDown({ button: 0, clientX: nailMotScr.x, clientY: nailMotScr.y, pointerId: 61 });
    onPointerUp({ button: 0, clientX: nailMotScr.x, clientY: nailMotScr.y, pointerId: 61 });
    check("clicking a nail cycles to left turn", nailMot.motor === 1 && !playDrag && nailMot.joints.some(Boolean));
    for (let i = 0; i < 180; i++) step(1 / 60);
    const nailWccw = nailMotBox.body.getAngularVelocity();
    check("left motor reaches about +90 deg/s", Math.abs(nailWccw - Math.PI / 2) < 0.35 && !stats.dragTrick);
    onPointerDown({ button: 0, clientX: nailMotScr.x, clientY: nailMotScr.y, pointerId: 62 });
    onPointerUp({ button: 0, clientX: nailMotScr.x, clientY: nailMotScr.y, pointerId: 62 });
    check("second click switches to right turn", nailMot.motor === -1);
    for (let i = 0; i < 180; i++) step(1 / 60);
    const nailWcw = nailMotBox.body.getAngularVelocity();
    check("right motor reaches about -90 deg/s", Math.abs(nailWcw + Math.PI / 2) < 0.35);
    onPointerDown({ button: 0, clientX: nailMotScr.x, clientY: nailMotScr.y, pointerId: 63 });
    onPointerUp({ button: 0, clientX: nailMotScr.x, clientY: nailMotScr.y, pointerId: 63 });
    check("third click turns the motor off", nailMot.motor === 0 && nailMot.joints.every((j) => !j || !j.isMotorEnabled()));
    for (let i = 0; i < 180; i++) step(1 / 60);
    const nailWoff = nailMotBox.body.getAngularVelocity();
    check("an off nail joint is not driven", Math.abs(nailWoff) < 1.0);

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
  } catch (err) {
    lines.push("FAIL exception " + (err && err.stack ? err.stack : err));
  }
  const fail = lines.some((line) => line.startsWith("FAIL"));
  testlog.style.display = "block";
  testlog.textContent = lines.join("\n");
  document.title = fail ? "FAIL" : "PASS";
}



window.__crayon = {
  start: (id) => buildLevel(LEVELS[id]),
  stroke: (pts) => commitStroke(pts),
  erase: eraseAt,
  step: (sec) => { for (let t = 0; t < sec; t += 1 / 60) step(1 / 60); },
  ball: () => ball && ball.getPosition(),
  levels: () => Object.keys(LEVELS),
};

boot();
