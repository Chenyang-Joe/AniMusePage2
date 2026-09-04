#!/usr/bin/env python3
"""Shrink the AniMuse GLBs for the web. Pure stdlib + macOS `sips` — no node, no numpy.

Four transforms, none of them visible at web viewing sizes:

  1. Prune orphaned bufferViews. Several exports (data/editing especially) still
     carry the buffer bytes of morph targets that were dropped from the JSON --
     23 MB of the grizzly's 25 MB is unreachable data.

  2. Textures: PNG -> JPEG, downscaled. The exporter writes 2048^2 PNGs of albedo.

  3. Geometry: POSITION and every morph-target POSITION go from float32 to
     normalized int16 under KHR_mesh_quantization (three.js reads it natively).
     Morph targets dominate these files -- a 60-frame textured mesh stores 60 full
     copies of the vertex set -- so halving them is most of the win.

     Both attributes must share one scale, since a morphed vertex is
     POSITION + sum(w_i * delta_i) and the node scale multiplies the sum. We take
     S = max |value| over both, divide through, and multiply the mesh node's scale
     by S to undo it at render time. Node translation is left alone so the
     per-frame translation track some files carry keeps working.

  4. Frames: the exporter bakes one morph target per frame and switches between
     them with a STEP-interpolated one-hot weight track. Dropping every other
     target and switching to LINEAR keeps the same clip duration and reads
     smoother than the 10 fps original, at half the bytes.

Usage:
    python3 tools/glb_opt.py <in.glb> <out.glb> [--no-jpeg] [--no-quant]
                             [--max-tex=N] [--max-frames=N] [--quality=N]
"""
import json
import os
import struct
import subprocess
import sys
import tempfile
from array import array

ALIGN = 4
FLOAT, SHORT = 5126, 5122
GLB_MAGIC, CHUNK_JSON, CHUNK_BIN = 0x46546C67, 0x4E4F534A, 0x004E4942


def _pad(n, a=ALIGN):
    return (a - n % a) % a


def read_glb(path):
    with open(path, "rb") as f:
        magic, _, _ = struct.unpack("<III", f.read(12))
        assert magic == GLB_MAGIC, f"not a GLB: {path}"
        j = None
        bin_ = b""
        while True:
            hdr = f.read(8)
            if len(hdr) < 8:
                break
            clen, ctype = struct.unpack("<II", hdr)
            data = f.read(clen)
            if ctype == CHUNK_JSON:
                j = json.loads(data.decode("utf-8"))
            elif ctype == CHUNK_BIN:
                bin_ = data
    return j, bin_


def write_glb(path, j, bin_):
    js = json.dumps(j, separators=(",", ":")).encode("utf-8")
    js += b" " * _pad(len(js))
    bn = bin_ + b"\x00" * _pad(len(bin_))
    total = 12 + 8 + len(js) + (8 + len(bn) if bn else 0)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", GLB_MAGIC, 2, total))
        f.write(struct.pack("<II", len(js), CHUNK_JSON))
        f.write(js)
        if bn:
            f.write(struct.pack("<II", len(bn), CHUNK_BIN))
            f.write(bn)


def png_to_jpeg(raw, quality, max_dim):
    """Round-trip one embedded image through `sips`. None if it didn't shrink."""
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "i.png"), os.path.join(d, "o.jpg")
        with open(src, "wb") as f:
            f.write(raw)
        cmd = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(quality)]
        if max_dim:
            cmd += ["-Z", str(max_dim)]
        cmd += [src, "--out", dst]
        if subprocess.run(cmd, capture_output=True).returncode != 0:
            return None
        out = open(dst, "rb").read()
    return out if len(out) < len(raw) else None


class Glb:
    """A GLB held as JSON plus one bytes object per bufferView, so edits are local."""

    def __init__(self, path):
        j, bin_ = read_glb(path)
        self.j = j
        self.views = []
        for bv in j.get("bufferViews", []):
            o = bv.get("byteOffset", 0)
            self.views.append(bin_[o:o + bv["byteLength"]])

    def acc_bytes(self, ai):
        a = self.j["accessors"][ai]
        n = a["count"] * {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
        size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[a["componentType"]]
        o = a.get("byteOffset", 0)
        return self.views[a["bufferView"]][o:o + n * size], n

    def read_floats(self, ai):
        raw, n = self.acc_bytes(ai)
        x = array("f")
        x.frombytes(raw)
        return x

    def new_view(self, data):
        self.views.append(data)
        self.j.setdefault("bufferViews", []).append({"byteOffset": 0, "byteLength": len(data)})
        return len(self.views) - 1

    def morph_targets(self):
        for mesh in self.j.get("meshes", []):
            for prim in mesh.get("primitives", []):
                if prim.get("targets"):
                    yield mesh, prim

    # -- transforms -------------------------------------------------------

    def jpeg_textures(self, quality, max_dim):
        for img in self.j.get("images", []):
            if img.get("mimeType") != "image/png" or "bufferView" not in img:
                continue
            new = png_to_jpeg(self.views[img["bufferView"]], quality, max_dim)
            if new:
                self.views[img["bufferView"]] = new
                img["mimeType"] = "image/jpeg"

    def decimate_frames(self, max_frames):
        """Halve (or third, ...) the baked per-frame morph targets.

        Only touches files whose weight track is the one-hot STEP switch the
        exporter writes; anything else is left alone rather than guessed at.
        """
        for mesh, prim in self.morph_targets():
            n_t = len(prim["targets"])
            if n_t <= max_frames:
                continue
            mesh_i = self.j["meshes"].index(mesh)
            chan = None
            for anim in self.j.get("animations", []):
                for ch in anim["channels"]:
                    node = self.j["nodes"][ch["target"]["node"]]
                    if ch["target"]["path"] == "weights" and node.get("mesh") == mesh_i:
                        chan = (anim, ch)
            if chan is None:
                continue
            anim, ch = chan
            samp = anim["samplers"][ch["sampler"]]
            times = self.read_floats(samp["input"])
            w = self.read_floats(samp["output"])
            n_k = len(times)
            if len(w) != n_k * n_t:
                continue
            # Expect key k to hold target k-1 at weight 1 (key 0 = base mesh).
            one_hot = all(
                all(abs(w[k * n_t + i] - (1.0 if i == k - 1 else 0.0)) < 1e-4 for i in range(n_t))
                for k in range(n_k)
            )
            if not one_hot or n_k != n_t + 1:
                continue

            stride = -(-n_t // max_frames)  # ceil
            keep_k = list(range(0, n_k, stride))
            if keep_k[-1] != n_k - 1:
                keep_k.append(n_k - 1)  # always land on the final pose
            keep_t = [k - 1 for k in keep_k if k > 0]

            prim["targets"] = [prim["targets"][i] for i in keep_t]
            if "weights" in mesh:
                mesh["weights"] = [0.0] * len(keep_t)
            if "extras" in prim and "targetNames" in prim.get("extras", {}):
                prim["extras"]["targetNames"] = [prim["extras"]["targetNames"][i] for i in keep_t]

            nt2 = len(keep_t)
            new_times = array("f", [times[k] for k in keep_k])
            new_w = array("f", [0.0] * (len(keep_k) * nt2))
            for row, k in enumerate(keep_k):
                if k > 0:
                    new_w[row * nt2 + keep_t.index(k - 1)] = 1.0
            samp["input"] = self._replace_accessor(samp["input"], new_times, "SCALAR", len(new_times),
                                                   mn=[float(new_times[0])], mx=[float(new_times[-1])])
            samp["output"] = self._replace_accessor(samp["output"], new_w, "SCALAR", len(new_w))
            # STEP at 10 fps stutters; the in-betweens LINEAR gives are an
            # improvement even before the frame drop.
            samp["interpolation"] = "LINEAR"

    def linearize_weight_tracks(self):
        for anim in self.j.get("animations", []):
            for ch in anim["channels"]:
                if ch["target"]["path"] == "weights":
                    anim["samplers"][ch["sampler"]]["interpolation"] = "LINEAR"

    def _replace_accessor(self, ai, arr, type_, count, mn=None, mx=None):
        a = dict(self.j["accessors"][ai])
        a["bufferView"] = self.new_view(arr.tobytes())
        a["byteOffset"] = 0
        a["componentType"] = FLOAT
        a["type"] = type_
        a["count"] = count
        a.pop("normalized", None)
        if mn is not None:
            a["min"], a["max"] = mn, mx
        else:
            a.pop("min", None)
            a.pop("max", None)
        self.j["accessors"].append(a)
        return len(self.j["accessors"]) - 1

    def quantize_positions(self):
        """float32 POSITION + morph deltas -> normalized int16, scale moved to the node."""
        targets = []
        for mesh in self.j.get("meshes", []):
            for prim in mesh.get("primitives", []):
                if "POSITION" in prim["attributes"]:
                    targets.append(prim["attributes"]["POSITION"])
                for t in prim.get("targets", []):
                    if "POSITION" in t:
                        targets.append(t["POSITION"])
        targets = sorted(set(targets))
        if not targets:
            return

        scale = 0.0
        for ai in targets:
            a = self.j["accessors"][ai]
            if a.get("componentType") != FLOAT:
                return
            for key in ("min", "max"):
                for v in a.get(key) or []:
                    scale = max(scale, abs(v))
        if scale <= 0:
            return

        for ai in targets:
            a = self.j["accessors"][ai]
            f32 = self.read_floats(ai)
            i16 = array("h", (max(-32767, min(32767, int(round(v / scale * 32767)))) for v in f32))
            if sys.byteorder == "big":
                i16.byteswap()
            a["bufferView"] = self.new_view(i16.tobytes())
            a["byteOffset"] = 0
            a["componentType"] = SHORT
            a["normalized"] = True
            # glTF stores min/max in the accessor's own component units, so a
            # normalized accessor reports the integers -- three.js is what
            # multiplies them back by 1/32767. Writing the decoded floats here
            # gives every quantized mesh a bounding box 32767x too small, which
            # silently breaks fitting, raycasting and frustum culling.
            for key in ("min", "max"):
                if key in a:
                    a[key] = [max(-32767, min(32767, int(round(v / scale * 32767)))) for v in a[key]]

        for node in self.j.get("nodes", []):
            if "mesh" in node and "matrix" not in node:
                s = node.get("scale", [1, 1, 1])
                node["scale"] = [s[0] * scale, s[1] * scale, s[2] * scale]

        for key in ("extensionsUsed", "extensionsRequired"):
            ext = self.j.setdefault(key, [])
            if "KHR_mesh_quantization" not in ext:
                ext.append("KHR_mesh_quantization")

    # -- output -----------------------------------------------------------

    def save(self, path):
        """Repack, dropping accessors and bufferViews nothing reaches.

        Worth doing on its own: the data/editing exports drop morph targets from
        the JSON but leave their accessors and 20+ MB of bytes behind.
        """
        live_acc = set()

        def use(ai):
            if ai is not None:
                live_acc.add(ai)

        for mesh in self.j.get("meshes", []):
            for prim in mesh.get("primitives", []):
                for ai in prim.get("attributes", {}).values():
                    use(ai)
                use(prim.get("indices"))
                for t in prim.get("targets", []):
                    for ai in t.values():
                        use(ai)
        for anim in self.j.get("animations", []):
            for s in anim.get("samplers", []):
                use(s["input"])
                use(s["output"])
        for skin in self.j.get("skins", []):
            use(skin.get("inverseBindMatrices"))

        acc_remap, new_acc = {}, []
        for i, a in enumerate(self.j.get("accessors", [])):
            if i in live_acc:
                acc_remap[i] = len(new_acc)
                new_acc.append(a)

        live_bv = set()
        for a in new_acc:
            if "bufferView" in a:
                live_bv.add(a["bufferView"])
            sp = a.get("sparse")
            if sp:
                live_bv.add(sp["indices"]["bufferView"])
                live_bv.add(sp["values"]["bufferView"])
        for im in self.j.get("images", []):
            if "bufferView" in im:
                live_bv.add(im["bufferView"])

        bv_remap, new_views, out, off = {}, [], bytearray(), 0
        for i, bv in enumerate(self.j.get("bufferViews", [])):
            if i not in live_bv:
                continue
            data = self.views[i]
            bv_remap[i] = len(new_views)
            bv = dict(bv)
            bv["buffer"] = 0
            bv["byteOffset"], bv["byteLength"] = off, len(data)
            bv.pop("byteStride", None)
            new_views.append(bv)
            out += data
            off += len(data)
            pad = _pad(off)
            out += b"\x00" * pad
            off += pad

        for a in new_acc:
            if "bufferView" in a:
                a["bufferView"] = bv_remap[a["bufferView"]]
            sp = a.get("sparse")
            if sp:
                sp["indices"]["bufferView"] = bv_remap[sp["indices"]["bufferView"]]
                sp["values"]["bufferView"] = bv_remap[sp["values"]["bufferView"]]
        for im in self.j.get("images", []):
            if "bufferView" in im:
                im["bufferView"] = bv_remap[im["bufferView"]]

        for mesh in self.j.get("meshes", []):
            for prim in mesh.get("primitives", []):
                prim["attributes"] = {k: acc_remap[v] for k, v in prim["attributes"].items()}
                if "indices" in prim:
                    prim["indices"] = acc_remap[prim["indices"]]
                if prim.get("targets"):
                    prim["targets"] = [{k: acc_remap[v] for k, v in t.items()} for t in prim["targets"]]
        for anim in self.j.get("animations", []):
            for s in anim.get("samplers", []):
                s["input"], s["output"] = acc_remap[s["input"]], acc_remap[s["output"]]
        for skin in self.j.get("skins", []):
            if skin.get("inverseBindMatrices") is not None:
                skin["inverseBindMatrices"] = acc_remap[skin["inverseBindMatrices"]]

        self.j["accessors"] = new_acc
        self.j["bufferViews"] = new_views
        self.j["buffers"] = [{"byteLength": len(out)}] if out else []
        write_glb(path, self.j, bytes(out))


def optimize(inp, outp, do_jpeg=True, do_quant=True, max_tex=1024, quality=88, max_frames=None):
    g = Glb(inp)
    if do_jpeg:
        g.jpeg_textures(quality, max_tex)
    if max_frames:
        g.decimate_frames(max_frames)
    g.linearize_weight_tracks()
    if do_quant:
        g.quantize_positions()
    os.makedirs(os.path.dirname(outp) or ".", exist_ok=True)
    g.save(outp)
    before, after = os.path.getsize(inp), os.path.getsize(outp)
    print(f"  {os.path.basename(inp)[:50]:50s} {before/1e6:6.2f} -> {after/1e6:5.2f} MB  ({before/max(after,1):4.1f}x)")
    return before, after


if __name__ == "__main__":
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a.split("=")[0]: (a.split("=")[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
    optimize(pos[0], pos[1],
             do_jpeg="--no-jpeg" not in flags,
             do_quant="--no-quant" not in flags,
             max_tex=int(flags.get("--max-tex", 1024)),
             quality=int(flags.get("--quality", 88)),
             max_frames=int(flags["--max-frames"]) if "--max-frames" in flags else None)
