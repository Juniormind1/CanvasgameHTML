#!/usr/bin/env python3
"""Szenenzettel dekodieren oder als Headless-Screenshot öffnen.

Aufruf:
  python3 tools/scene.py [decode] ZETTEL [AUSGABE.json]
  python3 tools/scene.py shot ZETTEL [AUSGABE.png] [--pause]

Der Zettel ist ein Text mit Präfix CGZ1: (deflate-raw + base64url)
oder CGJ1: (unkomprimiertes JSON + base64url), oder rohes JSON.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CHROME_CANDIDATES = [
    os.environ.get("CHROME_HEADLESS"),
    "/workspace/cg_probe/browsers/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell",
    "chrome-headless-shell",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
]


def b64url_decode(text: str) -> bytes:
    pad = "=" * ((4 - len(text) % 4) % 4)
    return base64.b64decode(text.replace("-", "+").replace("_", "/") + pad)


def decode_scene_text(text: str) -> dict:
    raw = text.strip()
    if not raw:
        raise ValueError("Kein Zettel-Text.")
    if raw.startswith("CGZ1:"):
        data = zlib.decompress(b64url_decode(raw[5:]), -15)
        return json.loads(data.decode("utf-8"))
    if raw.startswith("CGJ1:"):
        data = b64url_decode(raw[5:])
        return json.loads(data.decode("utf-8"))
    if raw.startswith("{"):
        return json.loads(raw)
    raise ValueError("Unbekanntes Zettel-Format.")


def read_text_arg(src: str) -> str:
    path = Path(src)
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return src


def cmd_decode(args: argparse.Namespace) -> int:
    data = decode_scene_text(read_text_arg(args.zettel))
    pretty = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        Path(args.output).write_text(pretty, encoding="utf-8")
        print(args.output)
    else:
        sys.stdout.write(pretty)
    return 0


def find_chrome() -> str:
    for cand in CHROME_CANDIDATES:
        if not cand:
            continue
        path = Path(cand)
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
        found = shutil_which(cand)
        if found:
            return found
    raise SystemExit("Kein chrome-headless-shell oder Chrome gefunden.")


def shutil_which(name: str) -> str | None:
    from shutil import which
    return which(name)


def cmd_shot(args: argparse.Namespace) -> int:
    text = read_text_arg(args.zettel).strip()
    decode_scene_text(text)  # früh prüfen
    html = (REPO / "index.html").read_text(encoding="utf-8")
    # Langer Zettel passt oft nicht in die URL, deshalb als JS-Variable einbetten.
    payload = json.dumps(text)
    snippet = (
        "<script>window.__CRAYON_SCENE=" + payload
        + ";window.__CRAYON_SCENE_PAUSE=" + ("true" if args.pause else "false")
        + ";</script>\n"
    )
    marker = "<canvas id=\"view\"></canvas>"
    if marker not in html:
        raise SystemExit("index.html hat nicht das erwartete Canvas.")
    html = html.replace(marker, marker + "\n" + snippet, 1)
    out = Path(args.output or "zettel.png").resolve()
    chrome = args.chrome or find_chrome()
    with tempfile.TemporaryDirectory(prefix="crayon-scene-") as tmp:
        tmp_path = Path(tmp)
        page = tmp_path / "scene.html"
        page.write_text(html, encoding="utf-8")
        profile = tmp_path / "profile"
        profile.mkdir()
        cmd = [
            chrome,
            "--no-sandbox",
            "--disable-gpu",
            "--hide-scrollbars",
            "--window-size=1280,800",
            "--user-data-dir=" + str(profile),
            "--virtual-time-budget=4000",
            "--screenshot=" + str(out),
            page.as_uri() + "?shot=1" + ("&pause=1" if args.pause else ""),
        ]
        proc = subprocess.run(cmd, capture_output=True)
        if not out.is_file() or out.stat().st_size < 100:
            err = (proc.stderr or proc.stdout or b"").decode("utf-8", "replace")[:2000]
            raise SystemExit("Screenshot fehlgeschlagen.\n" + err)
    print(out)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Szenenzettel dekodieren oder als Screenshot öffnen.")
    sub = parser.add_subparsers(dest="cmd")

    p_dec = sub.add_parser("decode", help="Zettel als lesbares JSON ausgeben")
    p_dec.add_argument("zettel", help="Datei oder Zettel-Text")
    p_dec.add_argument("output", nargs="?", help="optionale JSON-Datei")

    p_shot = sub.add_parser("shot", help="Zettel in Headless-Chrome als Bild speichern")
    p_shot.add_argument("zettel", help="Datei oder Zettel-Text")
    p_shot.add_argument("output", nargs="?", help="PNG-Datei (Vorgabe: zettel.png)")
    p_shot.add_argument("--pause", action="store_true", help="Simulation anhalten (wie ?pause=1)")
    p_shot.add_argument("--chrome", help="Pfad zu chrome-headless-shell oder Chrome")

    args, rest = parser.parse_known_args()
    if args.cmd is None:
        # Kurzform: python3 tools/scene.py ZETTEL [AUSGABE.json]
        if not rest and len(sys.argv) == 1:
            parser.print_help()
            return 2
        # Wenn das erste Argument eine Datei oder ein Zettel ist, decode.
        class Ns:
            pass
        ns = argparse.Namespace(zettel=sys.argv[1] if len(sys.argv) > 1 else "", output=sys.argv[2] if len(sys.argv) > 2 else None)
        if not ns.zettel:
            parser.print_help()
            return 2
        return cmd_decode(ns)
    if args.cmd == "decode":
        return cmd_decode(args)
    if args.cmd == "shot":
        return cmd_shot(args)
    parser.print_help()
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("Fehler:", exc, file=sys.stderr)
        sys.exit(1)
