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
    "Ein Klick in die Fläche eines Körpers oder auf den Boden setzt einen Nagel (ein winziger Kreis geht auch). Ein Seil daran hält fest. Weitere Klicks auf einen schlichten Nagel ändern nichts.",
    "Kringel um einen Nagel: er wird Motornagel und dreht in Kringelrichtung. Rechtsrum spult ein Seil am Nagel auf, linksrum ab. Ein Klick auf einen Motornagel schaltet links, rechts, Stillstand.",
    "Ein Seil von Nagel zu Nagel, das über einen Bodennagel gezogen wird, läuft über ihn. Ein schlichter Nagel bremst es deutlich, ein stehender Motornagel ist eine Umlenkrolle ohne Reibung, ein laufender treibt das Seil an.",
    "Zwei Nägel in derselben Fläche machen sie starr.",
    "Vom Nagel weg ziehen: Seil, so lang wie der Strich, fest am Nagel. Endet der Zug auf einem anderen Nagel, hängt es dort; sonst bleibt das Ende frei. Eine Spitze unter 15°, die senkrecht trifft, zerschneidet es.",
    "Am Rand eines Gegenstands fasst du ihn und ziehst ihn. Lässt du ihn über einem Nagel los, heftet er sich dort drehbar fest; mehrere Nägel halten ihn gleichzeitig. In der Fläche wird gezeichnet; ein Klick oder ein kleiner Kreis setzt einen Nagel. Ein längerer Zug aus der Mitte greift nachträglich.",
    "Ein kurzer gerader Strich von einem Gegenstand in einen anderen, der ihn berührt, macht beide zu einem Stück. Vom Boden aus wird das Stück fest. Rechtsklick auf den Strich löst.",
    "Nägel werden nicht verschoben. Einen selbst gesetzten Nagel zieht man mit Rechtsklick oder einem schnellen Doppeltipp auf ihn heraus.",
    "Den Ball mit einem gerade gezogenen Gegenstand stoßen löst das Level, aber ohne Konfetti.",
    "Auf der Karte hängt ein Kugelstoßpendel. Zieh eine äußere Kugel zur Seite und lass los.",
    "Klick auf die Spielkugel: kleiner Schubs. Rechtsklick radiert das Deine; ein Doppeltipp radiert nur Nägel und Seile.",
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

