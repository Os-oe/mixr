#!/usr/bin/env python3
"""Post-process raw Nano-Banana sprites for MIXR.

- verifies/creates alpha (keys out near-white or magenta bg if no alpha)
- trims transparent border
- resizes to max 512px
- writes public/sprites/<name>.png

Usage: process-sprite.py <raw.png> <out.png> [--max 512] [--report]
"""
import sys
from PIL import Image

def is_magenta(c):
    r, g, b = c[0], c[1], c[2]
    return r > 185 and b > 175 and g < 120 and (r - g) > 85 and (b - g) > 70

def keyed(img):
    img = img.convert('RGBA')
    px = img.load()
    w, h = img.size
    corners = [px[0, 0], px[w-1, 0], px[0, h-1], px[w-1, h-1]]
    if sum(1 for c in corners if c[3] > 250 and is_magenta(c)) >= 3:
        # magenta key
        for y in range(h):
            for x in range(w):
                c = px[x, y]
                if is_magenta(c):
                    px[x, y] = (c[0], c[1], c[2], 0)
        # 1px alpha erosion to kill fringe
        from PIL import ImageFilter
        a = img.getchannel('A').filter(ImageFilter.MinFilter(3))
        img.putalpha(a)
        return img, 'magenta-keyed'
    return img, 'native-alpha'

def main():
    raw, out = sys.argv[1], sys.argv[2]
    maxs = 512
    if '--max' in sys.argv:
        maxs = int(sys.argv[sys.argv.index('--max') + 1])
    img = Image.open(raw)
    img, mode = keyed(img)
    bbox = img.getchannel('A').getbbox()
    if bbox:
        img = img.crop(bbox)
    img.thumbnail((maxs, maxs), Image.LANCZOS)
    img.save(out, 'PNG')
    # alpha stats
    a = img.getchannel('A')
    hist = a.histogram()
    transparent = sum(hist[:8]) / (img.width * img.height)
    print(f"OK {out} {img.width}x{img.height} mode={mode} transparent={transparent:.0%}")

if __name__ == '__main__':
    main()
