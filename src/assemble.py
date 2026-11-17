from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parent
planck = (root / "planck.min.js").read_text(encoding="utf-8")
# Spielquelle: alle src/game/*.js in Dateinamen-Reihenfolge (00-, 05-, …, 99-).
# Die Verkettung bleibt im globalen Scope und entspricht der früheren src/game.js.
parts = sorted((root / "game").glob("*.js"))
if not parts:
    raise SystemExit("keine Dateien in src/game/")
game = "".join(p.read_text(encoding="utf-8") for p in parts)
html = """<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crayon</title>
<style>
html, body { margin: 0; height: 100%; background: #f4e6c6; overflow: hidden; touch-action: none; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; }
#namebox {
  display: none; position: fixed; z-index: 2;
  font: 22px "Segoe Print", "Comic Sans MS", cursive;
  background: rgba(255,252,240,.85); border: 2px solid #5c4632; border-radius: 10px; padding: 4px 10px; color: #3a2a1c;
}
#testlog {
  display: none; position: fixed; z-index: 3; left: 8px; bottom: 8px; max-width: 92vw;
  white-space: pre-wrap; background: rgba(255,255,255,.92); color: #222; font: 12px monospace; padding: 8px;
}
</style>
</head>
<body>
<canvas id="view"></canvas>
<input id="namebox" maxlength="40" aria-label="Levelname">
<pre id="testlog"></pre>
<script>
""" + planck + """
</script>
<script>
""" + game + """
</script>
</body>
</html>
"""
out = repo / "index.html"
out.write_text(html, encoding="utf-8")
print(out.stat().st_size)
