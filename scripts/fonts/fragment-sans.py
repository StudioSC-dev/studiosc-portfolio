"""Build the fragment sans, app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2.

The input is the two IBM Plex Sans v23 files the boards pin in docs/boards/fonts/:
the `latin` file and the `latin-ext` file of google.css. The output is one
variable WOFF2 that

- keeps the Latin file's glyphs, character map, hinting (fpgm, prep, cvt, cvar),
  layout (GDEF, GPOS, GSUB) and variations (fvar, gvar, HVAR, MVAR, avar);
- adds U+20B1, the peso sign, grafted from the Latin Extended file, with its
  outline, its hinting instructions, its advance and its variations;
- limits the weight axis to 400 to 600;
- is renamed "SSC Fragment Sans": no name-table string contains "Plex", the
  OFL's Reserved Font Name, and the copyright (ID 0) and the licence URL
  (ID 14) are the Latin file's.

The same inputs give the same bytes: the build keeps the Latin file's head
timestamps, and the environment is pinned (scripts/fonts/README.md).

Usage, from the repository root:

    <venv>/bin/python -I scripts/fonts/fragment-sans.py [--out PATH]

It prints the output's size and SHA-256. Exit status 2 means the environment
is not the pinned one; any other failure is a recipe error.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import sys
from pathlib import Path

FONTTOOLS = "4.69.1"
BROTLI = "1.2.1"
PYTHON = (3, 12)

ROOT = Path(__file__).resolve().parents[2]
BOARD_FONTS = ROOT / "docs" / "boards" / "fonts"
OUT = ROOT / "app" / "fonts" / "ibm-plex-sans" / "ibm-plex-sans-latin-peso.woff2"

# The board pins: google.css's `latin` and `latin-ext` IBM Plex Sans files.
LATIN = (
    "zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1syxeKYY.woff2",
    "e2291e842cf5af167122a22881a740c7f2dda7716f1e8cd76680264f4a859470",
)
LATIN_EXT = (
    "zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1syxQKYbABA.woff2",
    "d160e20920ae4d6556518d352d3af27a74e9b0de3d8fe17b1c1044fc75aa2f81",
)

PESO = 0x20B1
WEIGHTS = (400, 600)
RENAMES = (("IBM Plex Sans", "SSC Fragment Sans"), ("IBMPlexSans", "SSCFragmentSans"))
KEPT = (
    "fpgm", "prep", "cvt ", "cvar",
    "GPOS", "GSUB", "GDEF",
    "fvar", "gvar", "HVAR", "MVAR", "avar",
)
# Tables the grafted glyph's instructions and the hinting depend on: they
# must be the same in both pins for the glyph to run under the Latin file's.
SHARED = ("fpgm", "prep", "cvt ", "cvar", "gasp", "fvar", "avar")
MAXP_HINTING = (
    "maxZones", "maxTwilightPoints", "maxStorage", "maxFunctionDefs",
    "maxInstructionDefs", "maxStackElements", "maxSizeOfInstructions",
)


class Unpinned(Exception):
    """The environment is not the one scripts/fonts/README.md pins."""


def check_environment() -> None:
    if sys.version_info[:2] != PYTHON:
        raise Unpinned(f"Python {sys.version.split()[0]}, not {PYTHON[0]}.{PYTHON[1]}")
    try:
        import brotli
        import fontTools
    except ImportError as e:
        raise Unpinned(f"missing module: {e.name}") from e
    if fontTools.version != FONTTOOLS:
        raise Unpinned(f"fonttools {fontTools.version}, not {FONTTOOLS}")
    if brotli.version != BROTLI:
        raise Unpinned(f"brotli {brotli.version}, not {BROTLI}")


def pinned(name: str, sha256: str) -> Path:
    path = BOARD_FONTS / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != sha256:
        raise ValueError(f"{path}: sha256 {digest}, not the pin {sha256}")
    return path


def regions(store, data) -> list:
    """The region of each column of a VarData, as axis coordinate tuples."""
    out = []
    for index in data.VarRegionIndex:
        region = store.VarRegionList.Region[index]
        out.append(
            tuple((a.StartCoord, a.PeakCoord, a.EndCoord) for a in region.VarRegionAxis)
        )
    return out


def graft(latin, ext, codepoint: int) -> str:
    """Adds the ext font's glyph for `codepoint` to the Latin font."""
    for table in SHARED:
        if latin.getTableData(table) != ext.getTableData(table):
            raise ValueError(f"the pins' {table!r} tables differ")
    for field in MAXP_HINTING:
        if getattr(latin["maxp"], field) != getattr(ext["maxp"], field):
            raise ValueError(f"the pins' maxp.{field} differ")
    if codepoint in latin.getBestCmap():
        raise ValueError(f"the Latin pin already maps U+{codepoint:04X}")
    name = ext.getBestCmap()[codepoint]
    if name in latin.getGlyphOrder():
        raise ValueError(f"the Latin pin already has a glyph {name!r}")
    glyph = ext["glyf"][name]
    if glyph.isComposite():
        raise ValueError(f"{name} is a composite glyph")
    # The glyph joins no GDEF class or layout lookup: on the boards it is set
    # in a run of its own, from the ext file, so nothing positions it against
    # a Latin neighbour.
    gdef = ext["GDEF"].table
    if gdef.GlyphClassDef and name in gdef.GlyphClassDef.classDefs:
        raise ValueError(f"{name} has a GDEF class in the ext pin")

    # Decompile every table before the glyph order changes.
    for tag in latin.keys():
        if tag != "GlyphOrder":
            latin[tag]

    order = latin.getGlyphOrder() + [name]
    latin["glyf"].glyphs[name] = glyph
    latin["hmtx"].metrics[name] = ext["hmtx"][name]
    latin["gvar"].variations[name] = ext["gvar"].variations[name]

    # The advance's variation: the same deltas, in a Latin VarData over the
    # same regions in the same order.
    src = ext["HVAR"].table
    dst = latin["HVAR"].table
    index = src.AdvWidthMap.mapping[name]
    outer, inner = index >> 16, index & 0xFFFF
    src_data = src.VarStore.VarData[outer]
    wanted = regions(src.VarStore, src_data)
    for n, data in enumerate(dst.VarStore.VarData):
        if regions(dst.VarStore, data) == wanted:
            data.Item.append(list(src_data.Item[inner]))
            data.ItemCount = len(data.Item)
            dst.AdvWidthMap.mapping[name] = (n << 16) | (len(data.Item) - 1)
            break
    else:
        raise ValueError(f"no Latin HVAR VarData over the regions {wanted}")
    if src.LsbMap or src.RsbMap or dst.LsbMap or dst.RsbMap:
        raise ValueError("an HVAR side-bearing map is present")

    latin.setGlyphOrder(order)
    latin["glyf"].glyphOrder = order
    latin["maxp"].numGlyphs = len(order)
    for sub in latin["cmap"].tables:
        if sub.isUnicode():
            sub.cmap[codepoint] = name
    return name


def rename(font, source_names) -> None:
    for record in font["name"].names:
        text = record.toUnicode()
        for old, new in RENAMES:
            text = text.replace(old, new)
        if "Plex" in text:
            raise ValueError(f"name ID {record.nameID} keeps 'Plex': {text!r}")
        record.string = text
    for name_id in (0, 14):
        if font["name"].getDebugName(name_id) != source_names[name_id]:
            raise ValueError(f"name ID {name_id} changed")


def build() -> bytes:
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    # recalcTimestamp=False: the output keeps the Latin pin's head.modified,
    # so the same inputs give the same bytes on any day.
    latin = TTFont(pinned(*LATIN), recalcTimestamp=False)
    ext = TTFont(pinned(*LATIN_EXT), recalcTimestamp=False)
    source_names = {i: latin["name"].getDebugName(i) for i in (0, 14)}
    cmap = dict(latin.getBestCmap())

    name = graft(latin, ext, PESO)
    instantiateVariableFont(latin, {"wght": WEIGHTS}, inplace=True)
    rename(latin, source_names)

    latin.flavor = "woff2"
    buf = io.BytesIO()
    latin.save(buf, reorderTables=True)
    data = buf.getvalue()

    # What the file must hold, read back from the bytes.
    out = TTFont(io.BytesIO(data))
    missing = [t for t in KEPT if t not in out]
    if missing:
        raise ValueError(f"tables missing from the output: {missing}")
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in out["fvar"].axes]
    if axes != [("wght", float(WEIGHTS[0]), float(WEIGHTS[1]))]:
        raise ValueError(f"axes {axes}")
    if out.getBestCmap() != {**cmap, PESO: name}:
        raise ValueError("the character map is not the Latin pin's plus U+20B1")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, default=OUT, help=f"default {OUT.relative_to(ROOT)}")
    args = parser.parse_args()
    try:
        check_environment()
    except Unpinned as e:
        print(f"unpinned environment: {e} (see scripts/fonts/README.md)", file=sys.stderr)
        return 2
    data = build()
    args.out.write_bytes(data)
    print(f"{len(data)} bytes sha256:{hashlib.sha256(data).hexdigest()} {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
