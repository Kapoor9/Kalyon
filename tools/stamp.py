"""Stamp a version on every script, stylesheet and data URL of the website.

Browsers (Safari especially) cache JavaScript modules. Without a version in the URL, a visitor can get a
new index.html together with an old cached app.js, and the two disagree. Run before every publish:
    python tools/stamp.py
"""
import pathlib
import re
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent / "docs"
V = time.strftime("%Y%m%d%H%M")

html = ROOT / "index.html"
s = html.read_text()
s = re.sub(r'((?:href|src)="(?:css|js|vendor)/[^"?]+\.(?:css|js))(?:\?v=[0-9a-z]+)?"', rf'\1?v={V}"', s)
html.write_text(s)

for f in sorted((ROOT / "js").rglob("*.js")):   # includes js/pv/, the Passenger 3D modules
    t = f.read_text()
    t2 = re.sub(r'((?:from|import)\s*\(?\s*"\.\.?/[^"?]+\.js)(?:\?v=[0-9a-z]+)?"', rf'\1?v={V}"', t)
    t2 = re.sub(r'export const VER = "[^"]*";', f'export const VER = "{V}";', t2)
    if t2 != t:
        f.write_text(t2)
print("stamped", V)
