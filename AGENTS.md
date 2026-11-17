# AGENTS.md – Hinweise für Assistenten und Agenten

## Design-Grundsatz (vom Nutzer festgelegt, 2026-11-16)

- **Fokus: Mechanik verfeinern.** Neue Features nur, wenn der Nutzer sie ausdrücklich will.
- **Intuitive UX ohne Klimbim.** Keine Werkzeugleisten oder Paletten für Federn, Magneten, Motoren, Portale o. Ä.
- **Bedienung nur über intuitive Mausgesten.** Was der Spieler zeichnet oder anfasst, soll sich von selbst erklären.
- **Abwechslung kommt aus gutem Leveldesign**, nicht aus immer mehr Werkzeugen oder Objekttypen.
- Vorschläge für neue Bedienelemente (Buttons, Menüs, Modi) vorher mit dem Nutzer klären.
- **Ausnahme Parameter-Bildschirm:** Nur über den Entwicklungs-Link `?tune=1`. Im normalen Spiel gibt es keine Werkzeugleiste. Der Schirm hat Schieberegler für Kreis-, Ellipsen-, Vieleck- und Dreieckerkennung (unter anderem `CIRCLE_MAX_CV`, `ELLIPSE_MAX_CV`, Kreisgrenze `b/a`, Zusatzabstand der Radien `ELLIPSE_EXTRA_GAP`, Ecken- und Aufräumwerte) sowie für das Seilschneiden (Spitzenwinkel, Senkrecht-Toleranz, Mindesttempo). Änderungen gelten nur in diesem Modus und werden in `localStorage` gemerkt; ohne `?tune=1` gelten immer die Konstanten in `src/game.js`. Zurücksetzen stellt die Vorgaben wieder her, Kopieren liefert die aktuellen Werte plus die Messung des letzten Zugs als JSON.

## Gesten im Spiel

- **Zeichnen:** Zug auf freier Fläche oder vom Boden aus. Kurze Striche vom Boden ins Leere bleiben Striche.
- **Greifen:** Druck auf einen beweglichen Körper fasst ihn sofort an.
- **Verankern:** kurzer, fast gerader Zug (höchstens 1,5 m) vom Boden oder einem verankerten Körper, der *in* einem festen Körper endet (keine Kugeln, keine Drähte). Der Körper muss die Basis berühren und wird statisch. Umgekehrt: Körper greifen und Maus auf dem Boden loslassen. Ketten nur vom Boden aus. Trifft die Geste einen Körper, der nicht verankert werden kann (z. B. weil er die Basis nicht berührt), entsteht kein Strich; der Körper wird stattdessen gegriffen und folgt der Maus.
- **Lösen:** Rechtsklick auf den Verbindungsstrich (Körperfarbe) oder dieselbe Geste noch einmal. Alles, was daran hängt, wird mitgelöst. Rechtsklick auf einen verankerten Körper selbst löscht ihn nicht – erst muss die Verbindung gelöst werden, danach löscht Rechtsklick den Körper wie gewohnt.
- **Kreis:** Die Umrandung wird nach Bogenlänge gleichmäßig abgetastet (64 Punkte), der Mittelpunkt ist der Flächenschwerpunkt. Hauptkriterium: die relative Radiusstreuung `std(r)/mean(r)` darf höchstens `CIRCLE_MAX_CV` (12 %) betragen. Ohne Geodreieck bleibt zusätzlich die Eckenregel (keine Ecke über 45° auf kurzer Strecke), damit Felsbrocken und gleichmäßige Vielecke eckig bleiben. Der Zug darf bis 0,7 m offen bleiben.
- **Geodreieck:** Während des Zeichnens rastet der Stift nicht ein; die Vorschau zeigt den Rohzug. Erst nach dem Loslassen prüft das Spiel auf den Rohpunkten, ob eine Ellipse oder ein Kreis vorliegt. Wenn nicht, wird die fertige Form auf das Raster eingerastet (Geraden, rechte Winkel). Dreiecke und Vierecke nach dieser Aufräumung bleiben Vielecke, auch nicht-rechtwinklige Dreiecke.
- **Ellipse (nur mit Geodreieck):** Die Kreiserkennung wird zur Ellipsenerkennung erweitert und prüft den Rohzug (noch ohne Raster-Snap). Aus der Kovarianz der abgetasteten Umrandung kommen die Hauptachsen `a`, `b` und der Drehwinkel. Das Residuum ist die relative Streuung der Punkte vom Ellipsenrand (CV-artig) und darf höchstens `ELLIPSE_MAX_CV` (12 %) betragen. Eine Ellipse entsteht erst, wenn `a - b > (1 - ELLIPSE_CIRCLE_RATIO) * a + ELLIPSE_EXTRA_GAP` (Vorgabe: eine Rasterweite, 0,5 m); sonst ein Kreis mit `r = (a+b)/2`. `ELLIPSE_CIRCLE_RATIO` bleibt 0,85. Planck hat keine Ellipse, deshalb ist die Physik ein konvexes Polygon (bei mehr als `maxPolygonVertices` Ecken mehrere konvexe Fixtures, wie bei anderen Körpern); gezeichnet wird glatt als Ellipse. 3- und 4-Ecke nach dem Einrasten bleiben Vielecke. Ohne Geodreieck gibt es nur Kreise, Felsbrocken bleiben möglich. Schwellwerte stehen als `CIRCLE_*`- und `ELLIPSE_*`-Konstanten in `src/game.js`.
- **Farbe folgt dem Material.** Der Spieler wählt keine Farbe: keine Palette, kein Mausrad und keine Tasten 1–8 für Farben. Die Art des gezeichneten Gegenstands bestimmt die Farbe (`MAT.*` in `src/game.js`): Kugeln und Ellipsen sind Stahl (`#8b939e`), Klötze, Felsen und Kisten Holz (`#8d5a34`), Drähte dunkles Holz (`#5c4632`), Seile Hanf (`#c9a56a`). Boden und feste Levelteile behalten ihre eigene Farbe. Nägel, Sterne und Raketen bleiben unverändert.
- **Stahlglanz:** Kugeln und Ellipsen bekommen nur einen Glanzpunkt, ohne Raytracing. Das Highlight sitzt fest oben links in Weltkoordinaten (Lichtquelle) und dreht nicht mit. Die Rotation bleibt an einer dezenten Markierung erkennbar; die Spielkugel hat zusätzlich einen kleinen rostroten Bogen.
- **Verankern, Farbe:** Ein verankerter Körper nimmt die Farbe des Bodens an, an dem er direkt oder über die Kette hängt. Der Verbindungsstrich bleibt in der ursprünglichen Gegenstandsfarbe. Nach dem Lösen bekommen der Körper und seine Abhängigen ihre eigene Farbe zurück.
- **Nagel-Zug:** Ein an einem Nagel befestigter Körper bleibt beim Ziehen am Nagel und dreht sich nur um ihn. Sitzt er an zwei Nägeln (Schloss), bewegt er sich nicht.
- **Nagel-Motor:** Ein kurzer Linksklick auf einen Nagel schaltet zyklisch: aus (freier Drehpunkt) → links (gegen den Uhrzeigersinn) → rechts (im Uhrzeigersinn) → aus. Die Drehzahl ist 90°/s, also 4 s pro Umdrehung. Der Zustand ist als Pfeil am Nagel sichtbar. Der Motor zählt nicht als Tricksen. Schwellwerte stehen als `NAIL_*`-Konstanten in `src/game.js`.
- **Abprall:** Eine Kugel prallt von Flächen und festen Körpern gedämpft ab (Restitution `BALL_RESTITUTION`, 0,4). Kugel gegen Kugel bleibt fast elastisch. Drähte bleiben unelastisch, damit Stege und Rampen befahrbar bleiben. Unter `VELOCITY_THRESHOLD` (2,2 m/s, passend zu g=24) bleibt der Stoß unelastisch, damit die Kugel auf dem Boden zur Ruhe kommt und nicht zittert.
- **Seil:** Eine Linie von Nagel zu Nagel wird ein Seil, genau so lang wie der gezeichnete Strich inklusive aller Schlenker. Die Kette ist nicht dehnbar (starre `DistanceJoint`s, `RopeJoint`, nach jedem Physikschritt eine Längenkorrektur). Unter Last bleibt die Länge höchstens bei etwa 102 % der gezeichneten Ruhelänge. Eine glatte hängende Kurve ist genau so lang wie ihre Bogenlänge; zusätzliche Raufs und Runters machen das Seil länger.
- **Seil schneiden:** Eine Körperspitze mit Innenwinkel unter 15°, die mit der Spitze voran und ungefähr senkrecht auf ein Seil trifft, zerschneidet es. Die Senkrecht-Toleranz ist 30°, dazu gilt ein Mindesttempo. Der Schnitt erfolgt erst nach `world.step`, nicht im Kontakt-Callback. Beide Hälften bleiben physikalische Hanfseile. Stumpfe Ecken, Kugeln und seitliche oder flache Treffer lassen das Seil heil. Schwellwerte: `ROPE_CUT_ANGLE`, `ROPE_CUT_ALIGN`, `ROPE_CUT_SPEED`.
- **Tribok:** Auf der Titelkarte, im selben Feld wie das Newtonsche Pendel. Oben rechts in der Leiste wechselt ein Klick zwischen „Pendel“ und „Tribok“ (nur Maus, keine Werkzeugleiste). Der Tribok hat eine eigene Welt (`ensureTrebuchet`, `trebWorld`): statisches Holzgestell, drehbarer Wurfarm, schwere Holzkiste als Gegengewicht, Schlinge aus dem undehnbaren Seil mit Stahlkugel. Der Haltepin löst sich kurz nach dem Start oder per Klick auf das Feld; nach dem Wurf spannt ein weiterer Klick neu. Die Kugel verlässt die Schlinge und fliegt davon. Tests rechnen in festen 1/60-s-Schritten.
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
