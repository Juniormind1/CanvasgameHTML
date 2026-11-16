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
- **Verankern:** kurzer, fast gerader Zug (höchstens 1,5 m) vom Boden oder einem verankerten Körper, der *in* einem festen Körper endet (keine Kugeln, keine Drähte). Der Körper muss die Basis berühren und wird statisch. Umgekehrt: Körper greifen und Maus auf dem Boden loslassen. Ketten nur vom Boden aus.
- **Lösen:** Rechtsklick auf den Verbindungsstrich (Körperfarbe) oder dieselbe Geste noch einmal. Alles, was daran hängt, wird mitgelöst.
- Schwellwerte stehen als `ANCHOR_*`-Konstanten in `src/game.js`.

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
