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

