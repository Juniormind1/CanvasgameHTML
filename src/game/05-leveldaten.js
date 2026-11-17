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

