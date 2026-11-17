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


