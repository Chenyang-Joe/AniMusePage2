#!/usr/bin/env python3
"""Crop a PDF's white margins by shrinking its page box. Vector output, stdlib only.

`pdfcrop` is not installed here and rasterising would defeat the point -- the
figure has to stay vector to go back into the paper. So: render the page once to
find where the ink actually is, map those pixels back into PDF units, and rewrite
the page box to match.

The rewrite is done in place and padded to the original byte length, so every
offset the xref table records stays valid and the file never has to be rebuilt.

    python3 tools/croppdf.py in.pdf out.pdf [margin_pt]
"""
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_opt import *  # noqa: F401,F403  (keeps the tools dir importable as one set)
from figures import read_png

BOX = re.compile(rb"/(MediaBox|CropBox)\s*\[\s*([\d.\s+-]{1,60}?)\s*\]")


XREF_ENTRY = re.compile(rb"(\d{10}) (\d{5}) ([nf])")


def splice(data, start, end, body):
    """Replace a byte range, then repair the offsets the change invalidated.

    Padding the replacement to the original length is the cheap trick and it is
    what `figures.widen_page_boxes` does, but a crop box needs more digits than
    the full-page box it replaces, so the file has to grow. These PDFs carry a
    classic uncompressed xref table, which means the repair is mechanical: every
    recorded offset past the edit moves by the same delta, and so does
    `startxref`. The entries are fixed-width and zero-padded, so rewriting them
    does not change the length again.
    """
    if len(body) <= end - start:
        data = bytearray(data)
        data[start:end] = body + b" " * (end - start - len(body))
        return bytes(data)

    delta = len(body) - (end - start)
    out = bytearray(data[:start] + body + data[end:])

    fixed = 0
    for m in list(XREF_ENTRY.finditer(bytes(out))):
        off = int(m.group(1))
        if m.group(3) == b"f" or off <= start:
            continue
        out[m.start():m.start() + 10] = f"{off + delta:010d}".encode()
        fixed += 1

    sx = re.search(rb"startxref\s*\n(\d+)", bytes(out))
    if not sx:
        raise RuntimeError("no startxref to repair")
    val = int(sx.group(1))
    if val > start:
        new_val = str(val + delta).encode()
        if len(new_val) != len(sx.group(1)):
            raise RuntimeError("startxref changed width; would need a full rebuild")
        out[sx.start(1):sx.end(1)] = new_val
    print(f"  grew by {delta} bytes; repaired {fixed} xref offsets")
    return bytes(out)


def ink_bbox(png, thresh=247):
    """Pixel bounds of everything that is not near-white."""
    w, h, ch, rows = read_png(png)

    def inked(px):
        if ch == 4 and px[3] < 8:
            return False
        return min(px[:min(3, ch)]) < thresh

    ys = [y for y in range(h) if any(inked(rows[y][x * ch:(x + 1) * ch]) for x in range(w))]
    if not ys:
        raise RuntimeError("page is blank")
    xs = [x for x in range(w)
          if any(inked(r[x * ch:(x + 1) * ch]) for r in rows[ys[0]:ys[-1] + 1])]
    return xs[0], ys[0], xs[-1], ys[-1], w, h


def crop(src, dst, margin=2.0, size=2000):
    data = bytearray(open(src, "rb").read())
    boxes = list(BOX.finditer(bytes(data)))
    if not boxes:
        raise RuntimeError("no page box found (it may be inside an object stream)")
    page = [float(v) for v in boxes[0].group(2).split()]
    pw, ph = page[2] - page[0], page[3] - page[1]

    with tempfile.TemporaryDirectory() as d:
        tmp = os.path.join(d, os.path.basename(src))
        open(tmp, "wb").write(bytes(data))
        subprocess.run(["qlmanage", "-t", "-s", str(size), "-o", d, tmp],
                       capture_output=True, check=False)
        png = tmp + ".png"
        if not os.path.exists(png):
            raise RuntimeError("qlmanage produced nothing")
        x0, y0, x1, y1, w, h = ink_bbox(png)

    # The renderer must have drawn the page and nothing else, or the mapping
    # below is meaningless.
    if abs((w / h) - (pw / ph)) > 0.02 * (pw / ph):
        raise RuntimeError(f"rendered aspect {w}x{h} does not match page {pw}x{ph}")

    sx, sy = pw / w, ph / h
    # PDF y counts up from the bottom, the image counts down from the top.
    left = page[0] + x0 * sx - margin
    right = page[0] + (x1 + 1) * sx + margin
    bottom = page[1] + (h - 1 - y1) * sy - margin
    top = page[1] + (h - y0) * sy + margin
    new = [max(page[0], left), max(page[1], bottom), min(page[2], right), min(page[3], top)]

    body = b"/" + boxes[0].group(1) + b"[" + b" ".join(f"{v:.0f}".encode() for v in new) + b"]"
    out = splice(data, boxes[0].start(), boxes[0].end(), body)
    open(dst, "wb").write(out)
    print(f"  {os.path.basename(src)}  page {pw:.0f}x{ph:.0f} pt -> "
          f"{new[2]-new[0]:.0f}x{new[3]-new[1]:.0f} pt")


if __name__ == "__main__":
    a = sys.argv[1:]
    crop(a[0], a[1], margin=float(a[2]) if len(a) > 2 else 2.0)
