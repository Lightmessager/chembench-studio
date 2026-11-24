"""Build Chembench Studio's offline HTML and platform distributions (stdlib only)."""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import plistlib
import re
import shutil
import struct
import subprocess
import tempfile
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
RELEASE = ROOT / "release"


def bundle_html():
    sample = (ROOT / "examples/phenol.gjf").read_bytes().decode("utf-8")
    (WEB / "sample.js").write_text("globalThis.CHEMBENCH_SAMPLE = " + json.dumps(sample) + ";", encoding="utf-8")
    html = (WEB / "index.html").read_text(encoding="utf-8")
    license_notice = (ROOT / "LICENSE").read_text(encoding="utf-8")
    html = html.replace("<head>", "<head>\n<!--\n" + license_notice + "\n-->\n", 1)
    html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + (WEB / "style.css").read_text(encoding="utf-8") + "\n</style>")

    def inline(match):
        js = (WEB / match[1]).read_text(encoding="utf-8")
        return "<script>\n" + re.sub(r"</script", r"<\\/script", js, flags=re.I) + "\n</script>"

    return re.sub(r'<script src="([\w.-]+)"></script>', inline, html).encode("utf-8")


def brand_icon(size):
    """Render the cube mark into PNG for the platform icon containers."""
    points = [(32, 20), (46, 28), (46, 44), (32, 52), (18, 44), (18, 28)]
    segments = list(zip(points, points[1:] + points[:1])) + [((32, 36), p) for p in [(46, 28), (18, 28), (32, 52)]] + [((25, 24), (39, 32))]
    scaled = [(x1, y1-4, x2-x1, y2-y1) for (x1, y1), (x2, y2) in segments]
    pix = bytearray()
    for iy in range(size):
        pix.append(0)
        for ix in range(size):
            x, y = (ix+.5)*64/size, (iy+.5)*64/size
            radius = math.hypot(max(14-x, x-50, 0), max(14-y, y-50, 0))
            alpha = min(1, max(0, (12-radius)*size/64 + .5))
            dist = 10
            for sx, sy, dx, dy in scaled:
                t = min(1, max(0, ((x-sx)*dx + (y-sy)*dy)/(dx*dx + dy*dy)))
                dist = min(dist, math.hypot(x-sx-t*dx, y-sy-t*dy))
            stroke = min(1, max(0, (1.45-dist)*size/64+.5))
            col = (24+25*y/64, 130-35*y/64, 162+28*y/64)
            pix.extend([*(round(c+(255-c)*stroke) for c in col), round(255*alpha)])
    def chunk(key, data):
        return struct.pack(">I", len(data)) + key + data + struct.pack(">I", zlib.crc32(key+data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", size,size,8,6,0,0,0)) + chunk(b"IDAT", zlib.compress(pix,9)) + chunk(b"IEND", b"")


def put(z, name, content, mode=0o644):
    info = zipfile.ZipInfo(name)
    info.create_system = 3
    info.external_attr = (0o100000 | mode) << 16
    z.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED)


def include_guides(z):
    for name in ("LICENSE", "README.md", "README.zh-CN.md"):
        put(z, name, (ROOT / name).read_bytes())
    for screenshot in sorted(RELEASE.glob("*.png")):
        put(z, "release/" + screenshot.name, screenshot.read_bytes())
    for name in ("examples", "docs"):
        for f in sorted((ROOT / name).glob("*")):
            if f.is_file():
                put(z, f.relative_to(ROOT).as_posix(), f.read_bytes())


def build_mac(html, png):
    info = {"CFBundleName":"Chembench Studio", "CFBundleDisplayName":"Chembench Studio",
            "CFBundleIdentifier":"local.chembench.studio", "CFBundleExecutable":"ChembenchStudio",
            "CFBundlePackageType":"APPL", "CFBundleVersion":"1", "CFBundleShortVersionString":"1.0",
            "CFBundleInfoDictionaryVersion":"6.0", "CFBundleIconFile":"Studio.icns"}
    icon = b"ic08"+struct.pack(">I",len(png)+8)+png
    runner = '#!/bin/sh\nset -eu\ncontents=$(cd -P "$(dirname "$0")/.." && pwd)\nexec /usr/bin/open "$contents/Resources/Studio.html"\n'
    root = "Chembench Studio.app/Contents/"
    with zipfile.ZipFile(RELEASE / "Chembench-Studio-macOS.zip", "w") as z:
        put(z, root+"Info.plist", plistlib.dumps(info))
        put(z, root+"MacOS/ChembenchStudio", runner.encode(), 0o755)
        put(z, root+"Resources/Studio.html", html)
        put(z, root+"Resources/Studio.icns", b"icns"+struct.pack(">I",len(icon)+8)+icon)
        include_guides(z)


def build_windows(html, png):
    csc = shutil.which("csc") or str(Path(os.environ.get("WINDIR", "C:/Windows")) / "Microsoft.NET/Framework64/v4.0.30319/csc.exe")
    with tempfile.TemporaryDirectory(prefix="chembench-build-") as scratch:
        tmp = Path(scratch)
        (tmp / "Studio.html").write_bytes(html)
        (tmp / "studio.ico").write_bytes(struct.pack("<HHHBBBBHHII",0,1,1,0,0,0,0,1,32,len(png),22) + png)
        exe = tmp / "Chembench Studio.exe"
        subprocess.run([csc, "/nologo", "/target:winexe", "/platform:anycpu", "/optimize+",
                        "/r:System.Windows.Forms.dll", "/win32icon:studio.ico", "/resource:Studio.html,Studio.html",
                        "/out:"+str(exe), str(ROOT / "tools/Launcher.cs")], cwd=tmp, check=True)
        with zipfile.ZipFile(RELEASE / "Chembench-Studio-Windows.zip", "w") as z:
            put(z, exe.name, exe.read_bytes(), 0o755)
            include_guides(z)


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--target", choices=["windows","mac","html","all"], default="all" if os.name=="nt" else "mac")
    target = args.parse_args().target
    RELEASE.mkdir(exist_ok=True)
    html = bundle_html()
    (RELEASE / "Chembench-Studio.html").write_bytes(html)
    if target != "html":
        png = brand_icon(256)
        if target in ["mac","all"]:
            build_mac(html,png)
        if target in ["windows","all"]:
            build_windows(html,png)
    print("Build completed in", RELEASE)


if __name__ == "__main__":
    main()
