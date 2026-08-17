#!/usr/bin/env python3
"""Just enough of the `.aseprite` format to composite the art this game ships.

Layers, cels (raw, compressed and linked), frame tags, and the artist's own
per-cel annotations. Written out rather than pulled in as a dependency because
it is a couple of hundred lines and the alternative is a package that has to be
pinned, audited and kept working for a handful of assets.

It started life inside `tools/panel/build_panel.py`, which needed one 48x48 file
with six named layers. `tools/sprites/build_sprites.py` needs four more at two
different canvas sizes, so the reader moved here and grew the three things the
panel never used:

- **Frame tags** (`0x2018`). The panel annotates every cel and uses no tags at
  all; `Breaker.aseprite` uses both — tag ranges for clips to play, cel labels
  for single frames a clip has to intersect against. Both are the contract, so
  both are read.
- **Layer visibility.** An artist may keep a traced-over reference layer with
  the eye off; compositing it would bake the reference into the shipped sheet,
  so {@link Document.visible_layers} exists and the sprite builder uses it.
- **A colour-depth check.** Cels are handed to `Image.frombytes("RGBA", ...)`,
  which is only true at 32bpp. An indexed or greyscale re-save would otherwise
  produce garbage pixels rather than an error.

Nothing here is specific to a particular file: canvas size, layer names and
labels are all reported rather than assumed, and it is the callers that decide
what they must contain.
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass, field

from PIL import Image

#: Aseprite's file magic, and the frame header's.
FILE_MAGIC = 0xA5E0
FRAME_MAGIC = 0xF1FA

#: Chunk types this reader understands. Everything else is skipped by size.
CHUNK_LAYER = 0x2004
CHUNK_CEL = 0x2005
CHUNK_TAGS = 0x2018
CHUNK_USER_DATA = 0x2020

#: Cel encodings. 1 is a *reference* to the same layer in an earlier frame,
#: which is how Aseprite stores a cel the artist never changed.
CEL_RAW = 0
CEL_LINKED = 1
CEL_COMPRESSED = 2

#: The palette every sprite in this project is drawn from. Lives here so the two
#: build tools check against one list rather than two copies that drift.
EDG64 = {
    "ff0040", "131313", "1b1b1b", "272727", "3d3d3d", "5d5d5d", "858585",
    "b4b4b4", "ffffff", "c7cfdd", "92a1b9", "657392", "424c6e", "2a2f4e",
    "1a1932", "0e071b", "1c121c", "391f21", "5d2c28", "8a4836", "bf6f4a",
    "e69c69", "f6ca9f", "f9e6cf", "edab50", "e07438", "c64524", "8e251d",
    "ff5000", "ed7614", "ffa214", "ffc825", "ffeb57", "d3fc7e", "99e65f",
    "5ac54f", "33984b", "1e6f50", "134c4c", "0c2e44", "00396d", "0069aa",
    "0098dc", "00cdf9", "0cf1ff", "94fdff", "fdd2ed", "f389f5", "db3ffd",
    "7a09fa", "3003d9", "0c0293", "03193f", "3b1443", "622461", "93388f",
    "ca52c9", "c85086", "f68187", "f5555d", "ea323c", "c42430", "891e2b",
    "571c27",
}


#: Aseprite's layer blend modes. 0 is Normal — the only one {@link Document.composite}
#: reproduces, since it is plain `alpha_composite`.
BLEND_NORMAL = 0


@dataclass(frozen=True)
class Layer:
    name: str
    #: 0 normal, 1 group, 2 tilemap. Only 0 carries pixels.
    type: int
    #: Nesting depth under a group layer.
    child_level: int
    #: The eye toggle in Aseprite. Hidden layers are the artist's scaffolding.
    visible: bool
    #: See {@link BLEND_NORMAL}. Anything else composites differently in
    #: Aseprite than it does here, so callers check before trusting a sheet.
    blend: int = BLEND_NORMAL
    #: 0-255, applied to the cel's alpha during compositing.
    opacity: int = 255


@dataclass(frozen=True)
class Tag:
    name: str
    #: Inclusive frame range.
    from_frame: int
    to_frame: int

    @property
    def frames(self) -> list[int]:
        return list(range(self.from_frame, self.to_frame + 1))


@dataclass
class Document:
    path: str
    width: int
    height: int
    frame_count: int
    layers: list[Layer]
    #: Per-frame hold time in milliseconds, as authored.
    durations: list[int]
    #: Ordered as the file stores them. **Names repeat** — `Breaker.aseprite`
    #: has two `IDLE`s and `security_camera.aseprite` four `active`/`disabled`
    #: pairs, one per facing — so this is deliberately not a dict.
    tags: list[Tag] = field(default_factory=list)
    #: `(frame, layer) -> (x, y, opacity, w, h, rgba_bytes)`.
    cels: dict[tuple[int, int], tuple] = field(default_factory=dict)
    #: `(frame, layer) -> the earlier frame whose cel this one reuses`.
    linked: dict[tuple[int, int], int] = field(default_factory=dict)
    #: `(frame, layer) -> the artist's annotation`. The art->code contract.
    cel_labels: dict[tuple[int, int], str] = field(default_factory=dict)
    #: `layer index -> annotation`, for user data attached to a layer.
    layer_labels: dict[int, str] = field(default_factory=dict)

    @property
    def size(self) -> tuple[int, int]:
        return (self.width, self.height)

    @property
    def layer_names(self) -> list[str]:
        return [layer.name for layer in self.layers]

    def layer_index(self, name: str) -> int:
        """The index of `name`, raising if the art no longer carries it."""
        for i, layer in enumerate(self.layers):
            if layer.name == name:
                return i
        raise SystemExit(
            f"{self.path}: no layer named {name!r}.\n  found: {self.layer_names}"
        )

    def visible_layers(self) -> list[int]:
        """Pixel-bearing layer indices with the eye on, bottom first.

        Hidden layers are excluded on purpose: they are references and
        scratch work, and compositing them ships the artist's scaffolding.
        """
        return [i for i, layer in enumerate(self.layers)
                if layer.visible and layer.type == 0]

    def cel(self, frame: int, layer: int):
        """The cel for `(frame, layer)`, following a linked cel to its source."""
        if (frame, layer) in self.linked:
            return self.cel(self.linked[(frame, layer)], layer)
        return self.cels.get((frame, layer))

    def labels_for(self, layer: int) -> dict[int, str]:
        """`{frame: label}` for one layer, with the artist's quoting stripped.

        Cels come back annotated `'3'` rather than `3` — Aseprite keeps the
        quotes the artist typed — and `build_panel.py` has always stripped them
        the same way. Doing it here means the two tools agree.
        """
        return {
            frame: text.strip("'\"")
            for (frame, li), text in self.cel_labels.items()
            if li == layer
        }

    def composite(self, frame: int, layer_ids: list[int]) -> Image.Image:
        """Alpha-composite `layer_ids` (bottom first) of `frame` onto transparency.

        Plain alpha only. A layer set to Multiply, Screen or any of Aseprite's
        other blend modes would look one way in the editor and another here, and
        a sheet that quietly disagrees with the source is worse than a build that
        stops — so those raise rather than compositing wrongly.
        """
        for li in layer_ids:
            if self.layers[li].blend != BLEND_NORMAL:
                raise SystemExit(
                    f"{self.path}: layer {self.layers[li].name!r} uses blend mode "
                    f"{self.layers[li].blend}, and this reader only reproduces "
                    "Normal.\n  Flatten it in Aseprite, or teach composite() that mode."
                )

        out = Image.new("RGBA", self.size, (0, 0, 0, 0))
        for li in layer_ids:
            cel = self.cel(frame, li)
            if cel is None:
                continue
            x, y, cel_opacity, cw, ch, pixels = cel
            # Aseprite multiplies the cel's own opacity by its layer's.
            opacity = cel_opacity * self.layers[li].opacity // 255
            layer = Image.new("RGBA", self.size, (0, 0, 0, 0))
            sub = Image.frombytes("RGBA", (cw, ch), bytes(pixels))
            if opacity != 255:
                alpha = sub.getchannel("A").point(lambda a: a * opacity // 255)
                sub.putalpha(alpha)
            layer.paste(sub, (x, y))
            out = Image.alpha_composite(out, layer)
        return out


def read(path: str, expect_size: tuple[int, int] | None = None) -> Document:
    """Parse an `.aseprite` file.

    `expect_size` is checked when given, so a caller whose geometry is wired
    into code elsewhere fails loudly here rather than producing a sheet that is
    quietly the wrong shape.
    """
    with open(path, "rb") as fh:
        d = fh.read()

    magic = struct.unpack("<H", d[4:6])[0]
    if magic != FILE_MAGIC:
        raise SystemExit(f"{path}: not an .aseprite file (magic {magic:#06x})")

    frame_count = struct.unpack("<H", d[6:8])[0]
    width, height = struct.unpack("<HH", d[8:12])
    depth = struct.unpack("<H", d[12:14])[0]

    if depth != 32:
        raise SystemExit(
            f"{path}: colour depth is {depth}bpp, expected 32 (RGBA).\n"
            "  Cels are decoded straight into an RGBA image, so an indexed or "
            "greyscale save would produce garbage rather than an error.\n"
            "  Re-save from Aseprite as RGB colour mode."
        )
    if expect_size is not None and (width, height) != expect_size:
        raise SystemExit(
            f"{path}: canvas is {width}x{height}, expected "
            f"{expect_size[0]}x{expect_size[1]}"
        )

    doc = Document(
        path=path,
        width=width,
        height=height,
        frame_count=frame_count,
        layers=[],
        durations=[],
    )

    def text(o: int) -> tuple[str, int]:
        n = struct.unpack("<H", d[o:o + 2])[0]
        return d[o + 2:o + 2 + n].decode("utf8", "replace"), o + 2 + n

    off = 128
    for fi in range(frame_count):
        frame_bytes = struct.unpack("<I", d[off:off + 4])[0]
        old_chunks = struct.unpack("<H", d[off + 6:off + 8])[0]
        duration = struct.unpack("<H", d[off + 8:off + 10])[0]
        # The 32-bit count supersedes the 16-bit one, which is 0xFFFF when the
        # frame has more chunks than the old field can hold.
        n_chunks = struct.unpack("<I", d[off + 12:off + 16])[0] or old_chunks
        doc.durations.append(duration)

        co = off + 16
        # User data attaches to whatever chunk preceded it, so the parser has to
        # remember what that was — a label after a cel means something different
        # from a label after a layer.
        last: tuple[str, object] | None = None

        for _ in range(n_chunks):
            csize, ctype = struct.unpack("<IH", d[co:co + 6])
            body = co + 6

            if ctype == CHUNK_LAYER:
                flags, ltype, child = struct.unpack("<HHH", d[body:body + 6])
                blend = struct.unpack("<H", d[body + 10:body + 12])[0]
                opacity = d[body + 12]
                name, _ = text(body + 16)
                doc.layers.append(
                    Layer(name=name, type=ltype, child_level=child,
                          visible=bool(flags & 1), blend=blend, opacity=opacity)
                )
                last = ("layer", len(doc.layers) - 1)

            elif ctype == CHUNK_CEL:
                li, x, y, opacity, celtype = struct.unpack("<HhhBH", d[body:body + 9])
                last = ("cel", (fi, li))
                if celtype == CEL_LINKED:
                    doc.linked[(fi, li)] = struct.unpack("<H", d[body + 16:body + 18])[0]
                elif celtype in (CEL_RAW, CEL_COMPRESSED):
                    cw, ch = struct.unpack("<HH", d[body + 16:body + 20])
                    payload = d[body + 20:co + csize]
                    if celtype == CEL_COMPRESSED:
                        # Raw inflate, skipping the 2-byte zlib header: some
                        # exporters truncate the trailing Adler-32, which makes
                        # a checked decompress fail on otherwise-complete data.
                        obj = zlib.decompressobj(-15)
                        pixels = obj.decompress(payload[2:]) + obj.flush()
                    else:
                        pixels = payload
                    doc.cels[(fi, li)] = (x, y, opacity, cw, ch, pixels)

            elif ctype == CHUNK_TAGS:
                n_tags = struct.unpack("<H", d[body:body + 2])[0]
                o = body + 10  # count, then 8 reserved bytes
                for _t in range(n_tags):
                    f0, f1 = struct.unpack("<HH", d[o:o + 4])
                    # from, to, loop direction, repeat, 6 reserved, RGB, extra.
                    name, o = text(o + 17)
                    doc.tags.append(Tag(name=name, from_frame=f0, to_frame=f1))

            elif ctype == CHUNK_USER_DATA:
                flags = struct.unpack("<I", d[body:body + 4])[0]
                if flags & 1 and last is not None:
                    kind, ref = last
                    value, _ = text(body + 4)
                    if kind == "cel":
                        doc.cel_labels[ref] = value
                    else:
                        doc.layer_labels[ref] = value

            co += csize
        off += frame_bytes

    return doc


def off_palette(image: Image.Image) -> list[str]:
    """Every colour in `image` that is not an exact ENDESGA-64 entry.

    Alpha is ignored beyond "is it drawn at all": a partially transparent pixel
    of an on-palette colour is still on palette.
    """
    seen: set[str] = set()
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            if a:
                seen.add(f"{r:02x}{g:02x}{b:02x}")
    return sorted(f"#{c}" for c in seen - EDG64)
