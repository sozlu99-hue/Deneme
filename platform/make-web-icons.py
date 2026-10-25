#!/usr/bin/env python3
"""Derive web install icons from the approved Server monogram.

Run in the platform folder: python3 make-web-icons.py

web/icon-512.png is the approved green mark. This script writes
icon-192.png and icon-maskable-512.png from that file. It does not
replace icon-512.png.
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent / 'web'
SOURCE = OUT / 'icon-512.png'


def main():
    src = Image.open(SOURCE).convert('RGBA')
    if src.size != (512, 512):
        raise SystemExit('icon-512.png must be 512x512')
    src.resize((192, 192), Image.Resampling.LANCZOS).save(OUT / 'icon-192.png', format='PNG')
    # Maskable icons keep the mark inside the safe center. Android may cut the edge.
    bg = src.getpixel((0, 0))
    canvas = Image.new('RGBA', (512, 512), bg)
    inner = src.resize((410, 410), Image.Resampling.LANCZOS)
    canvas.paste(inner, ((512 - 410) // 2, (512 - 410) // 2), inner)
    canvas.save(OUT / 'icon-maskable-512.png', format='PNG')
    print('icon-192.png 192')
    print('icon-maskable-512.png 512')


if __name__ == '__main__':
    main()
