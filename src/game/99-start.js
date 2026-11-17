window.__crayon = {
  start: (id) => buildLevel(LEVELS[id]),
  stroke: (pts) => commitStroke(pts),
  erase: eraseAt,
  step: (sec) => { for (let t = 0; t < sec; t += 1 / 60) step(1 / 60); },
  ball: () => ball && ball.getPosition(),
  levels: () => Object.keys(LEVELS),
  captureScene,
  encodeScene: encodeSceneTextSync,
  encodeSceneAsync: encodeSceneText,
  decodeScene: decodeSceneTextSync,
  decodeSceneAsync: decodeSceneText,
  applyScene,
  loadScene: loadSceneFromTextSync,
  loadSceneAsync: loadSceneFromText,
};

boot();
