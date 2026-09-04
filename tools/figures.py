#!/usr/bin/env python3
"""Render the paper's figures to web JPEGs. Pure stdlib + macOS `qlmanage`/`sips`.

Two wrinkles the obvious `sips file.pdf --out file.jpg` gets wrong:

  1. Several figures carry a page box that is a tight crop of the 960x540 slide,
     and it cuts real content -- eval.pdf loses its row labels down the left and
     its whole GroundTruth row off the bottom. We widen any such box to the full
     slide before rendering.

  2. That leaves large white margins, so we trim them back off afterwards. PNG
     decoding is a dozen lines of zlib plus the five filter types, which is
     cheaper than depending on Pillow.
"""
import os
import re
import struct
import subprocess
import sys
import tempfile
import zlib

SLIDE = (960.0, 540.0)


def widen_page_boxes(src, dst):
    """Replace tight page boxes with the full slide, in place, byte-for-byte.

    The replacement is padded to the original length so every offset the xref
    table records stays valid and we never have to rebuild it.
    """
    data = bytearray(open(src, "rb").read())
    n = 0
    for m in re.finditer(rb"/(MediaBox|CropBox)\s*\[([^\]]{0,80})\]", bytes(data)):
        nums = m.group(2).split()
        if len(nums) != 4:
            continue
        try:
            vals = [float(x) for x in nums]
        except ValueError:
            continue
        if vals == [0.0, 0.0, SLIDE[0], SLIDE[1]]:
            continue
        if vals[2] <= SLIDE[0] + 0.5 and vals[3] <= SLIDE[1] + 0.5:
            new = b"/" + m.group(1) + b"[0 0 960 540]"
            if len(new) <= len(m.group(0)):
                data[m.start():m.end()] = new + b" " * (len(m.group(0)) - len(new))
                n += 1
    open(dst, "wb").write(bytes(data))
    return n


def read_png(path):
    """Minimal non-interlaced PNG reader. Returns (w, h, channels, rows)."""
    raw = open(path, "rb").read()
    assert raw[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos, idat, w = 8, bytearray(), None
    while pos < len(raw):
        ln, typ = struct.unpack(">I4s", raw[pos:pos + 8])
        body = raw[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            w, h, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            assert depth == 8 and interlace == 0, "unsupported PNG"
            ch = {0: 1, 2: 3, 4: 2, 6: 4}[color]
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
        pos += 12 + ln

    data = zlib.decompress(bytes(idat))
    stride = w * ch
    rows, prev = [], bytearray(stride)
    p = 0
    for _ in range(h):
        f = data[p]
        line = bytearray(data[p + 1:p + 1 + stride])
        p += 1 + stride
        for i in range(stride):
            a = line[i - ch] if i >= ch else 0
            b = prev[i]
            c = prev[i - ch] if i >= ch else 0
            if f == 1:
                line[i] = (line[i] + a) & 0xFF
            elif f == 2:
                line[i] = (line[i] + b) & 0xFF
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        rows.append(line)
        prev = line
    return w, h, ch, rows


def write_png(path, w, h, ch, rows):
    out = bytearray()
    for r in rows:
        out += b"\x00" + r
    color = {1: 0, 2: 4, 3: 2, 4: 6}[ch]

    def chunk(typ, body):
        return struct.pack(">I", len(body)) + typ + body + struct.pack(">I", zlib.crc32(typ + body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, color, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(out), 6))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)


def trim(path, pad=14, thresh=247):
    """Crop uniform near-white margins, leaving `pad` pixels of breathing room."""
    w, h, ch, rows = read_png(path)

    def row_has_ink(r):
        for i in range(0, len(r), ch):
            if ch == 4 and r[i + 3] < 8:
                continue
            if min(r[i:i + min(3, ch)]) < thresh:
                return True
        return False

    def col_has_ink(x):
        o = x * ch
        for r in rows:
            if ch == 4 and r[o + 3] < 8:
                continue
            if min(r[o:o + min(3, ch)]) < thresh:
                return True
        return False

    ys = [y for y in range(h) if row_has_ink(rows[y])]
    xs = [x for x in range(w) if col_has_ink(x)]
    if not ys or not xs:
        return
    y0, y1 = max(0, ys[0] - pad), min(h - 1, ys[-1] + pad)
    x0, x1 = max(0, xs[0] - pad), min(w - 1, xs[-1] + pad)
    if (x1 - x0 + 1, y1 - y0 + 1) == (w, h):
        return
    write_png(path, x1 - x0 + 1, y1 - y0 + 1,
              ch, [r[x0 * ch:(x1 + 1) * ch] for r in rows[y0:y1 + 1]])


def render(src, dst, size=1800, quality=82, max_dim=1600):
    with tempfile.TemporaryDirectory() as d:
        pdf = os.path.join(d, os.path.basename(src))
        if src.lower().endswith(".pdf"):
            widen_page_boxes(src, pdf)
            subprocess.run(["qlmanage", "-t", "-s", str(size), "-o", d, pdf],
                           capture_output=True, check=False)
            png = pdf + ".png"
            if not os.path.exists(png):
                raise RuntimeError(f"qlmanage produced nothing for {src}")
        else:
            png = os.path.join(d, "src.png")
            subprocess.run(["sips", "-s", "format", "png", src, "--out", png],
                           capture_output=True, check=True)
        trim(png)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(quality),
                        "-Z", str(max_dim), png, "--out", dst], capture_output=True, check=True)
    print(f"  {os.path.basename(dst):16s} {os.path.getsize(dst)/1e3:5.0f} KB")


FIGURES = [
    ("new_teaser.png", "teaser.jpg"),
    ("main.pdf",       "pipeline.jpg"),
    ("eval.pdf",       "eval.jpg"),
    ("teaser.pdf",     "gallery.jpg"),
    ("inpaint.pdf",    "inpaint.jpg"),
    ("figure2.pdf",    "figure2.jpg"),
]

if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fig = os.path.join(root, "data",
                       "Text_Driven_Motion_Generation_via_Semantic_Gaussian_Bones_V1", "figures")
    out = os.path.join(root, "assets", "img")
    os.makedirs(out, exist_ok=True)
    for src, dst in FIGURES:
        render(os.path.join(fig, src), os.path.join(out, dst))
