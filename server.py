"""
Minimal Flask static server for PokerTracker (ES modules + Supabase need http://).

Usage:
  pip install -r requirements.txt
  python server.py
  python server.py --port 3000
"""

from __future__ import annotations

import argparse
from pathlib import Path

from flask import Flask, abort, send_from_directory

ROOT = Path(__file__).resolve().parent

app = Flask(__name__)


def _safe_send(rel: str):
    rel = rel.replace("\\", "/").lstrip("/")
    target = (ROOT / rel).resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        abort(404)
    if not target.is_file():
        abort(404)
    return send_from_directory(ROOT, rel)


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:rel>")
def static_files(rel):
    return _safe_send(rel)


def main():
    parser = argparse.ArgumentParser(description="Serve PokerTracker over HTTP.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080, help="Port (default 8080)")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}/"
    print(f"PokerTracker: {url}")
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
