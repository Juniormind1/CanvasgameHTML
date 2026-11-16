# AGENTS.md – Hinweise für Assistenten und Agenten

## Design-Grundsatz (vom Nutzer festgelegt, 2026-11-16)

- **Fokus: Mechanik verfeinern.** Neue Features nur, wenn der Nutzer sie ausdrücklich will.
- **Intuitive UX ohne Klimbim.** Keine Werkzeugleisten oder Paletten für Federn, Magneten, Motoren, Portale o. Ä.
- **Bedienung nur über intuitive Mausgesten.** Was der Spieler zeichnet oder anfasst, soll sich von selbst erklären.
- **Abwechslung kommt aus gutem Leveldesign**, nicht aus immer mehr Werkzeugen oder Objekttypen.
- Vorschläge für neue Bedienelemente (Buttons, Menüs, Modi) vorher mit dem Nutzer klären.

## Gesten im Spiel

- **Zeichnen:** Zug auf freier Fläche oder vom Boden aus. Kurze Striche vom Boden ins Leere bleiben Striche.
- **Greifen:** Druck auf einen beweglichen Körper fasst ihn sofort an.
- **Verankern:** kurzer, fast gerader Zug (höchstens 1,5 m) vom Boden oder einem verankerten Körper, der *in* einem festen Körper endet (keine Kugeln, keine Drähte). Der Körper muss die Basis berühren und wird statisch. Umgekehrt: Körper greifen und Maus auf dem Boden loslassen. Ketten nur vom Boden aus. Trifft die Geste einen Körper, der nicht verankert werden kann (z. B. weil er die Basis nicht berührt), entsteht kein Strich; der Körper wird stattdessen gegriffen und folgt der Maus.
- **Lösen:** Rechtsklick auf den Verbindungsstrich (Körperfarbe) oder dieselbe Geste noch einmal. Alles, was daran hängt, wird mitgelöst. Rechtsklick auf einen verankerten Körper selbst löscht ihn nicht – erst muss die Verbindung gelöst werden, danach löscht Rechtsklick den Körper wie gewohnt.
- **Kreis:** Mit Geodreieck wird eine geschlossene Form mit mindestens fünf Ecken und ohne rechten Winkel zum Kreis. Ein Dreieck oder Viereck bleibt ein Vieleck, auch ohne rechten Winkel. Ohne Geodreieck bei erkennbarer Rundheit: keine Ecke über 45° auf kurzer Strecke, Radius-Schwankung höchstens 26 %, Bounding-Box mindestens 0,62 so breit wie hoch, der Zug darf bis 0,7 m offen bleiben. Ein Felsbrocken mit klaren Ecken, ein Rechteck oder ein Dreieck bleibt ein Vieleck. Schwellwerte stehen als `CIRCLE_*`-Konstanten in `src/game.js`.
- **Verankern, Farbe:** Ein verankerter Körper nimmt die Farbe des Bodens an, an dem er direkt oder über die Kette hängt. Der Verbindungsstrich bleibt in der ursprünglichen Gegenstandsfarbe. Nach dem Lösen bekommen der Körper und seine Abhängigen ihre eigene Farbe zurück.
- **Nagel-Zug:** Ein an einem Nagel befestigter Körper bleibt beim Ziehen am Nagel und dreht sich nur um ihn. Sitzt er an zwei Nägeln (Schloss), bewegt er sich nicht.
- **Nagel-Motor:** Ein kurzer Linksklick auf einen Nagel schaltet zyklisch: aus (freier Drehpunkt) → links (gegen den Uhrzeigersinn) → rechts (im Uhrzeigersinn) → aus. Die Drehzahl ist 90°/s, also 4 s pro Umdrehung. Der Zustand ist als Pfeil am Nagel sichtbar. Der Motor zählt nicht als Tricksen. Schwellwerte stehen als `NAIL_*`-Konstanten in `src/game.js`.
- **Abprall:** Eine Kugel prallt von Flächen und festen Körpern gedämpft ab (Restitution `BALL_RESTITUTION`, 0,4). Kugel gegen Kugel bleibt fast elastisch. Drähte bleiben unelastisch, damit Stege und Rampen befahrbar bleiben. Unter `VELOCITY_THRESHOLD` (2,2 m/s, passend zu g=24) bleibt der Stoß unelastisch, damit die Kugel auf dem Boden zur Ruhe kommt und nicht zittert.
- Schwellwerte fürs Verankern stehen als `ANCHOR_*`-Konstanten in `src/game.js`.

## Quellen und Build

- `src/game.js` ist die einzige Quelle für das Spiel.
- `src/planck.min.js` ist Planck.js 1.4.2 (Kontaktlöser).
- `index.html` wird mit `py -3 src/assemble.py` (Linux: `python3 src/assemble.py`) erzeugt – nie von Hand ändern.
- `src/readlog.py PFAD-ZUM-DUMP` liest ein Testlog.

## Tests

- `index.html?test=1` setzt `document.title` auf PASS oder FAIL, das Log steht in `#testlog`.
- Headless-Chrome mit frischem `--user-data-dir` und `--virtual-time-budget=25000`; Syntaxfehler sieht man nur mit `--enable-logging`.
- Im Test-`try` keine bestehenden `const` neu deklarieren (z. B. `ballX0`, `mid`, `rope`, `lower`, `shapesBefore`).
- Physik immer auch mit ungleichen Frame-Zeiten prüfen; das Spiel rechnet in festen 1/60-s-Schritten.

## Git

- Commits in logischen Einheiten, Commit-Messages als UTF-8 ohne BOM, kein amend, kein force-push.
- Erst pushen, wenn der Test TITLE PASS zeigt.
