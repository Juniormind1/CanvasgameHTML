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
let scenePaused = false;

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

