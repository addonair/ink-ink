#!/usr/bin/env python3
"""Generate placeholder extension icons.

Standard library only (zlib + struct) so the repo needs no image dependency
and carries no binary blobs that nobody can regenerate.

Draws a flat ink-blue rounded square with a diagonal pen stroke through it.
Deliberately crude - these are placeholders to be replaced before any public
release.

Usage:
    python scripts/make_icons.py [--out public/icons]
"""

from __future__ import annotations

import argparse
import struct
import zlib
from pathlib import Path

SIZES = (16, 32, 48, 128)

BG = (37, 99, 235, 255)      # ink blue
STROKE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def _in_rounded_square(x: int, y: int, size: int) -> bool:
    """Rounded-square mask with a margin proportional to the icon size."""
    margin = max(1, size // 10)
    radius = max(1, size // 5)
    lo, hi = margin, size - 1 - margin
    if not (lo <= x <= hi and lo <= y <= hi):
        return False
    # Only the four corner boxes need the circular test.
    cx = lo + radius if x < lo + radius else (hi - radius if x > hi - radius else x)
    cy = lo + radius if y < lo + radius else (hi - radius if y > hi - radius else y)
    if cx == x and cy == y:
        return True
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2


def _on_stroke(x: int, y: int, size: int) -> bool:
    """A diagonal pen stroke from lower-left to upper-right."""
    thickness = max(1.2, size / 10)
    # Distance from the line x + y = size, confined to the middle band.
    if not (size * 0.22 <= x <= size * 0.78):
        return False
    return abs((x + y) - size) <= thickness


def _pixels(size: int) -> bytes:
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter type 0 (None) per scanline
        for x in range(size):
            if _in_rounded_square(x, y, size):
                colour = STROKE if _on_stroke(x, y, size) else BG
            else:
                colour = TRANSPARENT
            rows.extend(colour)
    return bytes(rows)


def _chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, size: int) -> None:
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(_pixels(size), 9))
        + _chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="public/icons", help="output directory")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    for size in SIZES:
        target = out / f"icon-{size}.png"
        write_png(target, size)
        print(f"wrote {target} ({target.stat().st_size} bytes)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
