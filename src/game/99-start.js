window.__crayon = {
  start: (id) => buildLevel(LEVELS[id]),
  stroke: (pts) => commitStroke(pts),
  erase: eraseAt,
  step: (sec) => { for (let t = 0; t < sec; t += 1 / 60) step(1 / 60); },
  ball: () => ball && ball.getPosition(),
  levels: () => Object.keys(LEVELS),
};

boot();
