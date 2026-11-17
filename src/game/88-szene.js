// Szenenzettel: vollständiger Spielstand als Text (Export/Import).
// Format: JSON (Feld v=1), dann deflate-raw falls verfügbar, sonst unkomprimiert,
// als base64url mit Präfix CGZ1: (komprimiert) oder CGJ1: (roh).
// Planck-interne Warmstart-Impulse und Kontaktgraphen werden nicht
// mitgeschrieben; Position und Geschwindigkeit schon. Deshalb trifft
// der unmittelbare Zustand zu, Bahnen nach Kontakt können leicht abweichen.

const SCENE_PREFIX_Z = "CGZ1:";
const SCENE_PREFIX_J = "CGJ1:";
const SCENE_SIDE_WALLS = [
  [{ x: -0.5, y: -2 }, { x: 0.4, y: -2 }, { x: 0.4, y: 18 }, { x: -0.5, y: 18 }],
  [{ x: 31.6, y: -2 }, { x: 32.5, y: -2 }, { x: 32.5, y: 18 }, { x: 31.6, y: 18 }],
];

function scenePt(p) {
  if (!p) return { x: 0, y: 0 };
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

function clonePts(pts) {
  return (pts || []).map((p) => scenePt(p));
}

function ptsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = scenePt(a[i]);
    const q = scenePt(b[i]);
    if (Math.abs(p.x - q.x) > 1e-8 || Math.abs(p.y - q.y) > 1e-8) return false;
  }
  return true;
}

function isSideWallPts(pts) {
  return SCENE_SIDE_WALLS.some((w) => ptsEqual(w, pts));
}

function bytesToB64url(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(text) {
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8Bytes(str) {
  return new TextEncoder().encode(str);
}

function utf8String(bytes) {
  return new TextDecoder().decode(bytes);
}

function fixtureGroup(f) {
  if (f.getFilterData) {
    const d = f.getFilterData();
    if (d && d.groupIndex != null) return d.groupIndex;
  }
  if (typeof f.getFilterGroupIndex === "function") return f.getFilterGroupIndex();
  if (f.m_filter && f.m_filter.groupIndex != null) return f.m_filter.groupIndex;
  return 0;
}

function exportFixtures(body) {
  const list = [];
  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    const sh = f.getShape();
    const rec = {
      density: f.getDensity(),
      friction: f.getFriction(),
      restitution: f.getRestitution(),
      sensor: !!f.isSensor(),
      group: fixtureGroup(f),
    };
    if (sh.m_type === "circle") {
      const p = sh.m_p || { x: 0, y: 0 };
      rec.shape = "circle";
      rec.x = p.x;
      rec.y = p.y;
      rec.r = sh.m_radius;
    } else if (sh.m_vertices && sh.m_count) {
      rec.shape = "polygon";
      rec.verts = [];
      for (let i = 0; i < sh.m_count; i++) {
        const v = sh.m_vertices[i];
        rec.verts.push({ x: v.x, y: v.y });
      }
    } else continue;
    list.push(rec);
  }
  return list;
}

function addExportedFixtures(body, fixtures) {
  let made = 0;
  for (const fx of fixtures || []) {
    const opt = {
      density: fx.density,
      friction: fx.friction,
      restitution: fx.restitution,
      isSensor: !!fx.sensor,
      filterGroupIndex: fx.group || 0,
    };
    if (fx.shape === "circle") {
      body.createFixture(new planck.Circle(V(fx.x || 0, fx.y || 0), fx.r), opt);
      made++;
    } else if (fx.shape === "polygon" && fx.verts && fx.verts.length >= 3) {
      if (makePolygonFixture(body, fx.verts, opt)) made++;
    }
  }
  return made;
}

function jointTypeName(j) {
  if (!j) return "";
  if (typeof j.getType === "function") return j.getType();
  const name = (j.constructor && j.constructor.name) || "";
  return String(name).toLowerCase();
}

function isMouseJoint(j) {
  const t = jointTypeName(j);
  return t === "mouse-joint" || t === "mousejoint";
}

function serializeLevelDef(def) {
  if (!def) return null;
  try {
    return JSON.parse(JSON.stringify({
      id: def.id || null,
      name: def.name || "",
      hint: def.hint || "",
      ball: def.ball,
      stars: def.stars,
      solids: def.solids,
      wires: def.wires,
      decor: def.decor,
      boxes: def.boxes,
      pins: def.pins,
      rockets: def.rockets,
      sandbox: !!def.sandbox,
      custom: !!def.custom,
    }));
  } catch (err) {
    return { id: def.id || null, name: def.name || "", ball: def.ball, stars: def.stars, solids: def.solids, wires: def.wires, decor: def.decor, sandbox: !!def.sandbox, custom: !!def.custom };
  }
}

function exportTerrainExtra(def) {
  const extra = { solids: [], wires: [], decor: [] };
  const knownSolids = (def && def.solids) || [];
  const knownWires = (def && def.wires) || [];
  const knownDecor = (def && def.decor) || [];
  for (const s of scenery) {
    if (s.kind === "poly" && s.pts) {
      if (isSideWallPts(s.pts)) continue;
      if (knownSolids.some((k) => ptsEqual(k.pts, s.pts))) continue;
      extra.solids.push({ pts: clonePts(s.pts), color: s.color });
    } else if (s.kind === "line" && s.pts) {
      if (knownWires.some((k) => ptsEqual(k.pts, s.pts))) continue;
      if (knownDecor.some((k) => ptsEqual(k.pts, s.pts))) continue;
      const inGeo = geometry.some((g) => !g.closed && ptsEqual(g.pts, s.pts));
      if (inGeo) extra.wires.push({ pts: clonePts(s.pts), color: s.color });
      else extra.decor.push({ pts: clonePts(s.pts), color: s.color, width: s.width || 0.12 });
    }
  }
  return extra;
}

function applyTerrainExtra(extra) {
  if (!extra) return;
  for (const s of extra.solids || []) addStaticSolid(s.pts, s.color);
  for (const w of extra.wires || []) addStaticWire(w.pts, w.color);
  for (const d of extra.decor || []) scenery.push({ kind: "line", pts: d.pts, color: d.color, width: d.width || 0.12 });
}

function exportOutline(outline) {
  if (!outline) return null;
  return {
    local: clonePts(outline.local),
    closed: !!outline.closed,
    color: outline.color || null,
    width: outline.width,
  };
}

function exportBodyState(body, id, role) {
  const meta = bodyMeta.get(body) || {};
  const p = body.getPosition();
  const lv = body.getLinearVelocity ? body.getLinearVelocity() : { x: 0, y: 0 };
  const rec = {
    id,
    role,
    kind: meta.kind || role,
    type: body.isStatic() ? "static" : "dynamic",
    x: p.x,
    y: p.y,
    angle: body.getAngle(),
    vx: lv.x || 0,
    vy: lv.y || 0,
    w: body.getAngularVelocity ? body.getAngularVelocity() : 0,
    bullet: !!body.isBullet(),
    ld: body.getLinearDamping(),
    ad: body.getAngularDamping(),
    fr: !!body.isFixedRotation(),
    awake: !!body.isAwake(),
    fixtures: exportFixtures(body),
  };
  if (meta.outline) rec.outline = exportOutline(meta.outline);
  if (meta.circles) rec.circles = meta.circles.map((c) => ({ x: c.x, y: c.y, r: c.r }));
  if (meta.ellipse) rec.ellipse = { a: meta.ellipse.a, b: meta.ellipse.b, angle: meta.ellipse.angle };
  if (meta.thick) rec.thick = meta.thick;
  if (meta.round) rec.round = true;
  if (meta.quadKind) rec.quadKind = meta.quadKind;
  if (meta.tag) rec.tag = meta.tag;
  if (meta.ropeId) rec.ropeId = meta.ropeId;
  return rec;
}

function poseBody(body, rec) {
  if (!body || !rec) return;
  body.setTransform(V(rec.x, rec.y), rec.angle || 0);
  if (body.setLinearVelocity) body.setLinearVelocity(V(rec.vx || 0, rec.vy || 0));
  if (body.setAngularVelocity) body.setAngularVelocity(rec.w || 0);
  if (rec.bullet) body.setBullet(true);
  if (rec.fr) body.setFixedRotation(true);
  if (typeof rec.ld === "number") body.setLinearDamping(rec.ld);
  if (typeof rec.ad === "number") body.setAngularDamping(rec.ad);
  body.setAwake(rec.awake !== false);
}

function createRestoredBody(rec, asDynamic) {
  const typ = asDynamic || rec.anchor || rec.type !== "static" ? "dynamic" : "static";
  const body = world.createBody({
    type: typ,
    position: V(rec.x, rec.y),
    angle: rec.angle || 0,
    bullet: !!rec.bullet,
    fixedRotation: !!rec.fr,
    linearDamping: rec.ld == null ? 0 : rec.ld,
    angularDamping: rec.ad == null ? 0 : rec.ad,
  });
  addExportedFixtures(body, rec.fixtures);
  poseBody(body, rec);
  return body;
}

function drawingForBody(body) {
  return drawings.find((d) => d.body === body) || null;
}

function captureScene() {
  if (!world || mode !== "play") return null;
  endDrag();
  const idOf = new Map();
  let nextId = 1;
  idOf.set(ground, 0);
  function addId(body) {
    if (!body || idOf.has(body)) return idOf.get(body);
    const id = nextId++;
    idOf.set(body, id);
    return id;
  }
  addId(ball);
  for (const d of drawings) {
    if (d.kind === "rope") {
      for (const b of d.bodies || []) addId(b);
    } else addId(d.body);
  }
  for (const r of rockets) addId(r.body);
  for (const s of stars) addId(s.body);
  for (let b = world.getBodyList(); b; b = b.getNext()) addId(b);

  const bodies = [];
  function pushBody(body, role, extra) {
    if (!body || !idOf.has(body) || body === ground) return;
    const rec = exportBodyState(body, idOf.get(body), role);
    if (extra) Object.assign(rec, extra);
    bodies.push(rec);
  }

  if (ball) {
    const recExtra = { role: "ball", kind: "ball" };
    if (ball._cool) recExtra.cool = ball._cool;
    pushBody(ball, "ball", recExtra);
  }
  for (const d of drawings) {
    if (d.kind === "rope") {
      for (const b of d.bodies || []) {
        const meta = bodyMeta.get(b) || {};
        pushBody(b, "rope-bead", { drawKind: "rope", ropeId: d.ropeId || meta.ropeId, color: d.color || MAT.hemp });
      }
      continue;
    }
    const extra = {
      drawKind: d.kind,
      color: d.color || null,
    };
    if (d.preset) extra.preset = true;
    if (d.r) extra.r = d.r;
    if (d.a) extra.ea = d.a;
    if (d.b) extra.eb = d.b;
    pushBody(d.body, d.kind || "solid", extra);
  }
  for (const r of rockets) {
    const rec = r.body ? exportBodyState(r.body, idOf.get(r.body), "rocket") : { id: r.body ? idOf.get(r.body) : nextId++, role: "rocket", kind: "rocket" };
    rec.drawKind = "rocket";
    rec.color = "#d94b3a";
    rec.homeX = r.x;
    rec.homeY = r.y;
    rec.homeA = r.a || 0;
    rec.mode = r.mode;
    rec.timer = r.timer;
    rec.wait = r.wait;
    rec.armed = !!r.armed;
    if (!r.body) rec.gone = true;
    bodies.push(rec);
  }
  for (const s of stars) {
    if (!s.body) continue;
    const rec = exportBodyState(s.body, idOf.get(s.body), "star");
    rec.got = !!s.got;
    bodies.push(rec);
  }
  const seen = new Set(bodies.map((b) => b.id));
  seen.add(0);
  for (const [body, id] of idOf) {
    if (seen.has(id) || body === ground) continue;
    pushBody(body, "other", {});
  }

  const pinList = [];
  const pinIdOf = new Map();
  pins.forEach((pin, i) => {
    const id = i + 1;
    pinIdOf.set(pin, id);
    const wp = pinWorld(pin);
    const held = [];
    for (const j of pin.joints || []) {
      if (!j) continue;
      const a = j.getBodyA();
      const b = j.getBodyB();
      const other = a === pin.body ? b : b === pin.body ? a : null;
      if (!other || !idOf.has(other)) continue;
      if (bodyMeta.get(other) && bodyMeta.get(other).kind === "rope") continue;
      const loc = other.getLocalPoint(V(wp.x, wp.y));
      held.push({ body: idOf.get(other), local: { x: loc.x, y: loc.y } });
    }
    pinList.push({
      id,
      host: idOf.has(pin.body) ? idOf.get(pin.body) : 0,
      local: { x: pin.local.x, y: pin.local.y },
      x: wp.x,
      y: wp.y,
      userMade: !!pin.userMade,
      motor: pin.motor || 0,
      held,
    });
  });

  const ropes = [];
  for (const d of drawings) {
    if (d.kind !== "rope") continue;
    const beads = (d.bodies || []).map((b) => idOf.get(b)).filter((id) => id != null);
    const segs = (d.segJoints || []).map((j) => ({
      length: j && j.length != null ? j.length : (j && j.dist && typeof j.dist.getLength === "function" ? j.dist.getLength() : ROPE_SPACING),
    }));
    ropes.push({
      ropeId: d.ropeId,
      color: d.color || MAT.hemp,
      restLength: d.restLength,
      beads,
      segs,
      pinA: d.pinA && pinIdOf.has(d.pinA) ? pinIdOf.get(d.pinA) : null,
      pinB: d.pinB && pinIdOf.has(d.pinB) ? pinIdOf.get(d.pinB) : null,
      fixedPins: !!d.fixedPins,
    });
  }

  const joints = [];
  for (let j = world.getJointList(); j; j = j.getNext()) {
    if (isMouseJoint(j)) continue;
    const a = idOf.get(j.getBodyA());
    const b = idOf.get(j.getBodyB());
    if (a == null || b == null) continue;
    const rec = { type: jointTypeName(j), a, b };
    if (typeof j.getLocalAnchorA === "function") {
      const la = j.getLocalAnchorA();
      const lb = j.getLocalAnchorB();
      rec.localA = { x: la.x, y: la.y };
      rec.localB = { x: lb.x, y: lb.y };
    }
    if (typeof j.getLength === "function") rec.length = j.getLength();
    if (typeof j.getMaxLength === "function") rec.maxLength = j.getMaxLength();
    joints.push(rec);
  }

  const anchorList = anchors.map((link) => ({
    body: idOf.get(link.body),
    base: idOf.has(link.base) ? idOf.get(link.base) : 0,
    a: scenePt(link.a),
    b: scenePt(link.b),
    color: link.color || null,
    savedColor: link.savedColor || null,
  })).filter((a) => a.body != null);

  return {
    v: 1,
    levelId: levelDef && levelDef.id ? levelDef.id : null,
    mode,
    geoSnap: !!geoSnap,
    tune: Object.assign({}, tuneVals || {}),
    cam: { cx: cam.cx, cy: cam.cy, zoom: cam.zoom },
    simTime,
    stats: Object.assign({}, stats),
    won: !!won,
    medals: Object.assign({}, medals),
    ropeSeq,
    level: serializeLevelDef(levelDef),
    terrainExtra: exportTerrainExtra(levelDef),
    bodies,
    pins: pinList,
    ropes,
    joints,
    anchors: anchorList,
  };
}

function validateScene(data) {
  if (!data || typeof data !== "object") return "Zettel ist leer.";
  if (data.v !== 1) return "Unbekannte Zettel-Version.";
  if (!Array.isArray(data.bodies)) return "Im Zettel fehlen die Körper.";
  return null;
}

function encodeSceneTextSync(data) {
  return SCENE_PREFIX_J + bytesToB64url(utf8Bytes(JSON.stringify(data)));
}

async function encodeSceneText(data) {
  const bytes = utf8Bytes(JSON.stringify(data));
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const buf = await new Response(stream).arrayBuffer();
      return SCENE_PREFIX_Z + bytesToB64url(new Uint8Array(buf));
    } catch (err) { /* unkomprimiert */ }
  }
  return encodeSceneTextSync(data);
}

function decodeSceneTextSync(text) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, error: "Kein Zettel-Text." };
  try {
    if (raw.startsWith(SCENE_PREFIX_J)) {
      const data = JSON.parse(utf8String(b64urlToBytes(raw.slice(SCENE_PREFIX_J.length))));
      const err = validateScene(data);
      return err ? { ok: false, error: err } : { ok: true, data };
    }
    if (raw.startsWith("{")) {
      const data = JSON.parse(raw);
      const err = validateScene(data);
      return err ? { ok: false, error: err } : { ok: true, data };
    }
    if (raw.startsWith(SCENE_PREFIX_Z)) return { ok: false, error: "compressed", compressed: raw };
  } catch (err) {
    return { ok: false, error: "Zettel ist beschädigt." };
  }
  return { ok: false, error: "Unbekanntes Zettel-Format." };
}

async function decodeSceneText(text) {
  const sync = decodeSceneTextSync(text);
  if (sync.ok || !sync.compressed) {
    if (sync.error === "compressed") {
      return { ok: false, error: "Dieser Zettel ist komprimiert und lässt sich hier nicht öffnen." };
    }
    return sync;
  }
  if (typeof DecompressionStream === "undefined") {
    return { ok: false, error: "Dieser Zettel ist komprimiert und lässt sich hier nicht öffnen." };
  }
  try {
    const bytes = b64urlToBytes(sync.compressed.slice(SCENE_PREFIX_Z.length));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const buf = await new Response(stream).arrayBuffer();
    const data = JSON.parse(utf8String(new Uint8Array(buf)));
    const err = validateScene(data);
    return err ? { ok: false, error: err } : { ok: true, data };
  } catch (err) {
    return { ok: false, error: "Zettel ist beschädigt." };
  }
}

function showSceneMessage(text, isError) {
  let el = document.getElementById("scene-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "scene-toast";
    el.style.cssText = "position:fixed;z-index:8;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;background:rgba(255,252,240,0.96);border:2px solid #5c4632;border-radius:10px;padding:8px 14px;color:#3a2a1c;font:14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(60,40,20,0.18);";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.borderColor = isError ? "#a33" : "#5c4632";
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 4500);
  const st = document.getElementById("tune-scene-status");
  if (st) {
    st.textContent = text;
    st.className = isError ? "err" : "";
  }
}

function fallbackLevelDef(data) {
  if (data.level && (data.level.solids || data.level.ball)) return data.level;
  if (data.levelId && LEVELS[data.levelId]) return serializeLevelDef(LEVELS[data.levelId]);
  return serializeLevelDef(LEVELS.sandbox || LEVELS["ein-klotz"]);
}

function restoreMeta(body, rec) {
  const outline = rec.outline ? {
    local: clonePts(rec.outline.local),
    closed: !!rec.outline.closed,
    color: rec.outline.color || rec.color || MAT.wood,
    width: rec.outline.width == null ? 0.13 : rec.outline.width,
    fixed: false,
  } : null;
  const meta = {
    kind: rec.kind || rec.role || "draw",
    outline,
  };
  if (rec.circles) meta.circles = rec.circles.map((c) => ({ x: c.x, y: c.y, r: c.r }));
  if (rec.ellipse) meta.ellipse = { a: rec.ellipse.a, b: rec.ellipse.b, angle: rec.ellipse.angle };
  if (rec.thick) meta.thick = rec.thick;
  if (rec.round) meta.round = true;
  if (rec.quadKind) meta.quadKind = rec.quadKind;
  if (rec.tag) meta.tag = rec.tag;
  if (rec.ropeId) meta.ropeId = rec.ropeId;
  return track(body, meta);
}

function applyScene(data, opt) {
  if (!data) throw new Error("no scene");
  const err = validateScene(data);
  if (err) throw new Error(err);
  endDrag();
  scenePaused = false;
  const def = fallbackLevelDef(data);
  beginPlayWorld(def, { resetCam: false });
  applyTerrainExtra(data.terrainExtra);
  mode = "play";

  const ids = { 0: ground };
  const bodyRec = {};
  for (const rec of data.bodies || []) bodyRec[rec.id] = rec;

  function restoreOne(rec, forceRole) {
    const role = forceRole || rec.role || rec.kind;
    if (role === "star") {
      const star = addStarAt(rec.x, rec.y, rec.got);
      ids[rec.id] = star.body;
      poseBody(star.body, rec);
      return star.body;
    }
    if (role === "rocket") {
      const rocket = makeRocket({ x: rec.homeX != null ? rec.homeX : rec.x, y: rec.homeY != null ? rec.homeY : rec.y, a: rec.homeA || rec.angle || 0 });
      rocket.mode = rec.mode || "idle";
      rocket.timer = rec.timer || 0;
      rocket.wait = rec.wait || 0;
      rocket.armed = !!rec.armed;
      if (rec.gone || rec.mode === "gone") {
        if (rocket.body) {
          bodyMeta.delete(rocket.body);
          world.destroyBody(rocket.body);
          rocket.body = null;
        }
        return null;
      }
      if (rec.mode === "fly" && rocket.body) {
        rocket.body.setDynamic();
        rocket.body.setBullet(true);
      }
      if (rec.fixtures && rec.fixtures.length && rocket.body) {
        // keep makeRocket fixtures; pose is enough
      }
      poseBody(rocket.body, rec);
      ids[rec.id] = rocket.body;
      return rocket.body;
    }
    if (role === "ball") {
      const b = spawnQuestBall(rec.x, rec.y);
      // replace default fixture with exported ones if present
      if (rec.fixtures && rec.fixtures.length) {
        for (let f = b.getFixtureList(); f; ) {
          const n = f.getNext();
          b.destroyFixture(f);
          f = n;
        }
        addExportedFixtures(b, rec.fixtures);
      }
      poseBody(b, rec);
      if (rec.cool) b._cool = rec.cool;
      ids[rec.id] = b;
      return b;
    }
    const wantStatic = rec.type === "static";
    const body = createRestoredBody(rec, true);
    const meta = restoreMeta(body, rec);
    if (role === "rope-bead" || rec.kind === "rope") {
      meta.kind = "rope";
      if (rec.ropeId) meta.ropeId = rec.ropeId;
      ids[rec.id] = body;
      return body;
    }
    const drawKind = rec.drawKind || (role === "wire" ? "wire" : role === "blob" ? "blob" : role === "ellipse" ? "ellipse" : role === "roller" ? "roller" : "solid");
    const draw = { kind: drawKind, body, meta, color: rec.color || (meta.outline && meta.outline.color) || MAT.wood };
    if (rec.preset) draw.preset = true;
    if (rec.r) draw.r = rec.r;
    if (rec.ellipse) {
      draw.a = rec.ellipse.a;
      draw.b = rec.ellipse.b;
      draw.angle = rec.ellipse.angle;
      draw.x = rec.x;
      draw.y = rec.y;
    }
    if (drawKind === "blob" || drawKind === "roller") {
      draw.x = rec.x;
      draw.y = rec.y;
      draw.r = rec.r || (rec.circles && rec.circles[0] && rec.circles[0].r);
    }
    drawings.push(draw);
    if (wantStatic && !body.isStatic()) {
      // Verankerung setzt gleich setStatic; hier nur merken, nicht vorab frieren,
      // außer der Körper ist ohne Anker als statisch gespeichert.
    }
    ids[rec.id] = body;
    return body;
  }

  for (const rec of data.bodies || []) {
    const role = rec.role || rec.kind;
    if (role === "rope-bead" || rec.kind === "rope") continue;
    restoreOne(rec);
  }
  for (const rec of data.bodies || []) {
    const role = rec.role || rec.kind;
    if (role === "rope-bead" || rec.kind === "rope") restoreOne(rec);
  }

  const pinById = {};
  for (const pn of data.pins || []) {
    const host = ids[pn.host];
    if (!host) continue;
    const wp = pn.local
      ? host.getWorldPoint(V(pn.local.x, pn.local.y))
      : V(pn.x, pn.y);
    const pin = rememberPin(wp.x, wp.y, host, !!pn.userMade);
    pin.motor = pn.motor || 0;
    pinById[pn.id] = pin;
  }

  for (const pn of data.pins || []) {
    const pin = pinById[pn.id];
    if (!pin) continue;
    for (const hold of pn.held || []) {
      const other = ids[hold.body];
      if (!other || other === pin.body) continue;
      const wp = pin.body.getWorldPoint(V(pin.local.x, pin.local.y));
      const localB = hold.local ? V(hold.local.x, hold.local.y) : other.getLocalPoint(V(wp.x, wp.y));
      const joint = world.createJoint(new planck.RevoluteJoint({
        bodyA: pin.body,
        bodyB: other,
        localAnchorA: V(pin.local.x, pin.local.y),
        localAnchorB: localB,
        collideConnected: false,
      }));
      pin.joints.push(joint);
    }
    applyNailMotor(pin);
  }

  for (const rp of data.ropes || []) {
    const bodies = (rp.beads || []).map((id) => ids[id]).filter(Boolean);
    if (bodies.length < 2) continue;
    const segJoints = [];
    for (let i = 0; i < bodies.length - 1; i++) {
      const len = (rp.segs && rp.segs[i] && rp.segs[i].length) || ROPE_SPACING;
      segJoints.push(linkRopeSegment(world, bodies[i], bodies[i + 1], len));
    }
    const pinA = rp.pinA != null ? pinById[rp.pinA] || null : null;
    const pinB = rp.pinB != null ? pinById[rp.pinB] || null : null;
    const endJoints = attachRopePins(world, pinA, pinB, bodies);
    let restLength = rp.restLength;
    if (restLength == null) restLength = segJoints.reduce((s, j) => s + (j && j.length ? j.length : 0), 0);
    const spanJoint = (pinA && pinB) ? world.createJoint(new planck.RopeJoint({
      bodyA: bodies[0],
      bodyB: bodies[bodies.length - 1],
      localAnchorA: V(0, 0),
      localAnchorB: V(0, 0),
      maxLength: restLength * ROPE_MAX_STRETCH,
      collideConnected: false,
    })) : null;
    const ropeId = rp.ropeId || ropeSeq++;
    for (const body of bodies) {
      const meta = bodyMeta.get(body);
      if (meta) meta.ropeId = ropeId;
    }
    drawings.push({
      kind: "rope",
      ropeId,
      bodies,
      color: rp.color || MAT.hemp,
      restLength,
      segJoints,
      endJoints,
      spanJoint,
      chordJoint: createRopeChord(world, pinA, pinB, restLength),
      pinA: pinA || null,
      pinB: pinB || null,
      fixedPins: !!rp.fixedPins,
    });
  }

  for (const link of data.anchors || []) {
    const body = ids[link.body];
    const base = link.base == null ? ground : ids[link.base];
    if (!body || !base) continue;
    const draw = drawingForBody(body);
    if (!draw) continue;
    if (playDrag && playDrag.body === body) endDrag();
    if (body.isDynamic()) body.setStatic();
    dragFresh.delete(body);
    anchors.push({
      body,
      base,
      draw,
      a: scenePt(link.a),
      b: scenePt(link.b),
      color: link.color || draw.color,
      savedColor: link.savedColor || draw.color,
    });
    if (link.color) paintDraw(draw, link.color);
  }

  // Übrige statische Körper ohne Anker (sollten selten sein).
  for (const rec of data.bodies || []) {
    if (rec.type !== "static") continue;
    if (rec.role === "star" || rec.role === "rocket" || rec.role === "ball") continue;
    const body = ids[rec.id];
    if (!body || body === ground) continue;
    if (anchors.some((a) => a.body === body)) continue;
    if (body.isDynamic()) body.setStatic();
  }

  if (typeof data.simTime === "number") simTime = data.simTime;
  if (data.stats) stats = Object.assign({}, stats, data.stats);
  won = !!data.won;
  if (data.medals) medals = Object.assign({}, medals, data.medals);
  if (typeof data.ropeSeq === "number" && data.ropeSeq > ropeSeq) ropeSeq = data.ropeSeq;
  else {
    let maxId = ropeSeq;
    for (const d of drawings) {
      if (d.ropeId && d.ropeId >= maxId) maxId = d.ropeId + 1;
    }
    ropeSeq = maxId;
  }
  geoSnap = !!data.geoSnap;
  if (data.cam) {
    if (typeof data.cam.cx === "number") cam.cx = data.cam.cx;
    if (typeof data.cam.cy === "number") cam.cy = data.cam.cy;
    if (typeof data.cam.zoom === "number") cam.zoom = data.cam.zoom;
  }
  if (data.tune && typeof data.tune === "object") {
    if (!tuneVals || !Object.keys(tuneVals).length) tuneVals = tuneDefaults();
    for (const key of Object.keys(data.tune)) {
      if (TUNE_BY_KEY[key]) tuneVals[key] = data.tune[key];
    }
    if (tuneOn) {
      for (const spec of TUNE_SPEC) refreshTuneSlider(spec.key);
    }
  }
  if (playClock) playClock.acc = 0;
  scenePaused = !!(opt && opt.pause);
  namebox.style.display = "none";
  return true;
}

async function loadSceneFromText(text, opt) {
  const decoded = await decodeSceneText(text);
  if (!decoded.ok) return decoded;
  try {
    applyScene(decoded.data, opt || {});
    return { ok: true };
  } catch (err) {
    try { showMap(); } catch (err2) { /* ignorieren */ }
    return { ok: false, error: "Zettel konnte nicht geladen werden." };
  }
}

function loadSceneFromTextSync(text, opt) {
  const decoded = decodeSceneTextSync(text);
  if (!decoded.ok) {
    if (decoded.compressed) return { ok: false, error: "Dieser Zettel ist komprimiert; bitte über das Tune-Panel laden." };
    return decoded;
  }
  try {
    applyScene(decoded.data, opt || {});
    return { ok: true };
  } catch (err) {
    try { showMap(); } catch (err2) { /* ignorieren */ }
    return { ok: false, error: "Zettel konnte nicht geladen werden." };
  }
}

async function copySceneToClipboard() {
  const data = captureScene();
  if (!data) {
    showSceneMessage("Kein Spielstand. Öffne zuerst ein Level.", true);
    return { ok: false };
  }
  const text = await encodeSceneText(data);
  const area = document.getElementById("tune-scene-text");
  const markFallback = () => {
    if (!area) {
      window.prompt("Zettel kopieren:", text);
      return false;
    }
    area.value = text;
    area.focus();
    area.select();
    try {
      if (document.execCommand && document.execCommand("copy")) return true;
    } catch (err) { /* markiert lassen */ }
    return false;
  };
  let copied = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (err) {
      copied = markFallback();
    }
  } else copied = markFallback();
  const msg = (copied ? "kopiert" : "Text markiert — bitte kopieren") + " (" + text.length + " Zeichen)";
  showSceneMessage(msg, false);
  const copyBtn = document.getElementById("tune-scene-copy");
  if (copyBtn) {
    const old = copyBtn.textContent;
    copyBtn.textContent = msg;
    setTimeout(() => { copyBtn.textContent = old; }, 1600);
  }
  return { ok: true, text, copied };
}

async function loadSceneFromPanel() {
  const area = document.getElementById("tune-scene-text");
  const text = area ? area.value : "";
  const res = await loadSceneFromText(text, {});
  if (!res.ok) showSceneMessage(res.error || "Zettel konnte nicht geladen werden.", true);
  else showSceneMessage("Zettel geladen.", false);
  return res;
}

function mountSceneTuneControls(bodyEl) {
  if (!bodyEl || document.getElementById("tune-scene")) return;
  const box = document.createElement("div");
  box.id = "tune-scene";
  const h = document.createElement("h3");
  h.textContent = "Zettel";
  const hint = document.createElement("div");
  hint.id = "tune-scene-hint";
  hint.textContent = "Spielstand als Text kopieren und später wieder einfügen.";
  const actions = document.createElement("div");
  actions.id = "tune-scene-actions";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.id = "tune-scene-copy";
  copyBtn.textContent = "Zettel kopieren";
  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.id = "tune-scene-load";
  loadBtn.textContent = "Laden";
  actions.appendChild(copyBtn);
  actions.appendChild(loadBtn);
  const area = document.createElement("textarea");
  area.id = "tune-scene-text";
  area.rows = 4;
  area.placeholder = "Zettel einfügen";
  area.setAttribute("aria-label", "Zettel einfügen");
  const status = document.createElement("div");
  status.id = "tune-scene-status";
  box.appendChild(h);
  box.appendChild(hint);
  box.appendChild(actions);
  box.appendChild(area);
  box.appendChild(status);
  const readout = document.getElementById("tune-readout");
  if (readout && readout.parentNode === bodyEl) bodyEl.insertBefore(box, readout.nextSibling);
  else bodyEl.insertBefore(box, bodyEl.firstChild);
  copyBtn.addEventListener("click", () => { copySceneToClipboard(); });
  loadBtn.addEventListener("click", () => { loadSceneFromPanel(); });
}
