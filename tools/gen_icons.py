# -*- coding: utf-8 -*-
"""Generate TabVerse extension icons (16/48/128) as PNG, pure stdlib (zlib + struct)."""
import struct, zlib, math, os

def rounded_rect_mask(w, h, x0, y0, x1, y1, r):
    """Return a function(x, y) -> bool for an antialiased rounded rect (1px feather)."""
    def inside(x, y):
        # signed distance to the rounded rect
        cx = min(max(x, x0 + r), x1 - r)
        cy = min(max(y, y0 + r), y1 - r)
        # if inside the "core" box region, distance is to the box edge
        dx = max(x0 + r - x, x - (x1 - r), 0)
        dy = max(y0 + r - y, y - (y1 - r), 0)
        if dx > 0 and dy > 0:
            d = math.hypot(dx, dy) - r
        else:
            d = max(x0 - x, x - x1, y0 - y, y - y1)
        return d <= 0.0
    return inside

def aa_coverage(test, x, y, samples=4):
    hit = 0
    for sy in range(samples):
        for sx in range(samples):
            px = x + (sx + 0.5) / samples
            py = y + (sy + 0.5) / samples
            if test(px, py):
                hit += 1
    return hit / (samples * samples)

def lerp(a, b, t):
    return a + (b - a) * t

def render(size):
    s = float(size)
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]

    # background rounded square with diagonal gradient
    m = s * 0.04
    bg = rounded_rect_mask(size, size, m, m, s - m, s - m, s * 0.225)
    c1 = (99, 102, 241)    # indigo
    c2 = (34, 211, 238)    # cyan

    # layered "tab cards": a translucent card behind, solid white card in front
    back = rounded_rect_mask(size, size, s*0.34, s*0.34, s*0.88, s*0.80, s*0.09)
    front = rounded_rect_mask(size, size, s*0.16, s*0.22, s*0.74, s*0.70, s*0.09)

    for y in range(size):
        for x in range(size):
            cov_bg = aa_coverage(bg, x, y)
            if cov_bg <= 0:
                continue
            t = (x + y) / (2.0 * s)
            r = lerp(c1[0], c2[0], t); g = lerp(c1[1], c2[1], t); b = lerp(c1[2], c2[2], t)
            cr, cg, cb, ca = r, g, b, cov_bg * 255

            cov_back = aa_coverage(back, x, y)
            if cov_back > 0:
                ar = cov_back * 0.45
                cr = lerp(cr, 255, ar); cg = lerp(cg, 255, ar); cb = lerp(cb, 255, ar)
                ca = ar * 255 + ca * (1 - ar)

            cov_front = aa_coverage(front, x, y)
            if cov_front > 0:
                cr = lerp(cr, 255, cov_front); cg = lerp(cg, 255, cov_front)
                cb = lerp(cb, 255, cov_front); ca = cov_front * 255 + ca * (1 - cov_front)
                # little "tab" notch detail on the front card: two small bars
                pass

            px[y][x] = (int(round(cr)), int(round(cg)), int(round(cb)), int(round(ca)))
    return px

def box_resize(px, size, new_size):
    scale = size / float(new_size)
    out = []
    for y in range(new_size):
        row = []
        for x in range(new_size):
            x0, x1 = int(x * scale), max(int((x + 1) * scale), int(x * scale) + 1)
            y0, y1 = int(y * scale), max(int((y + 1) * scale), int(y * scale) + 1)
            r = g = b = a = n = 0
            for yy in range(y0, min(y1, size)):
                for xx in range(x0, min(x1, size)):
                    pr, pg, pb, pa = px[yy][xx]
                    r += pr; g += pg; b += pb; a += pa; n += 1
            row.append((r // n, g // n, b // n, a // n))
        out.append(row)
    return out

def write_png(path, px):
    h, w = len(px), len(px[0])
    raw = b""
    for row in px:
        raw += b"\x00" + b"".join(struct.pack("4B", *p) for p in row)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.normpath(os.path.join(here, "..", "icons"))
    os.makedirs(out, exist_ok=True)
    base = render(128)
    write_png(os.path.join(out, "icon128.png"), base)
    write_png(os.path.join(out, "icon48.png"), box_resize(base, 128, 48))
    write_png(os.path.join(out, "icon16.png"), box_resize(base, 128, 16))
    print("icons written to", out)

if __name__ == "__main__":
    main()
