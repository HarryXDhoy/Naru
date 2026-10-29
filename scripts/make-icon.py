"""Render Naru's app icon: the HeroHorizon planet rim from the ego(lite) design system,
inside a macOS squircle. Writes desktop/icon.png (1024 px) and desktop/icon.icns.
Needs numpy and Pillow:  python3 scripts/make-icon.py"""
import io, struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
S = 1024
hexrgb = lambda h: np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
NAVY, DEEP, ACCENT, BRIGHT, GROUND, HALO = map(hexrgb, ('#152256', '#204493', '#0880f7', '#a7cbff', '#f7faff', '#85a0e0'))

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def mix(a, b, t):
    return a * (1 - t[..., None]) + b * t[..., None]

def scene(n):
    y, x = np.mgrid[0:n, 0:n].astype(float) + .5
    px, py = (x - n / 2) / n, (n / 2 - y) / n            # icon units, +y up
    cx, cy, R = 0., -1.18, 1.10                          # horizon sits a little below centre
    d = np.hypot(px - cx, py - cy) - R
    ang = np.arctan2(px - cx, py - cy)
    s = np.clip(d / .55, 0, 1)
    sky = mix(np.broadcast_to(ACCENT, d.shape + (3,)), DEEP, smooth(0, .5, s))
    sky = mix(sky, NAVY, smooth(.4, 1, s))
    sky += HALO * (.35 * np.exp(-np.maximum(d, 0) * 9) * (1 - np.abs(px) * .6))[..., None]
    q = np.clip(-d, 0, 2)
    ground = mix(np.broadcast_to(ACCENT, d.shape + (3,)), BRIGHT, smooth(.03, .26, q))
    ground = mix(ground, GROUND, smooth(.2, .5, q))
    ground += HALO * (.25 * np.exp(-q * 22))[..., None]
    col = np.where((d > 0)[..., None], sky, ground)
    rim = np.exp(-np.abs(d) * 150) * 1.1 + np.exp(-np.abs(d) * 26) * .45
    col += np.array([.86, .93, 1.]) * (rim * (.55 + .45 * np.cos(ang * 1.2)))[..., None]
    a0 = .32
    g = np.exp(-((ang - a0) * 9) ** 2) * np.exp(-np.abs(d) * 60)
    col += (g * 1.6)[..., None]
    col += (np.exp(-((ang - a0) * 3) ** 2) * np.exp(-np.abs(d) * 9) * .2)[..., None]
    return np.clip(col, 0, 1)

def squircle_mask(n, inset, power=5.0):
    y, x = np.mgrid[0:n, 0:n].astype(float) + .5
    half = (n - 2 * inset) / 2
    u, v = np.abs(x - n / 2) / half, np.abs(y - n / 2) / half
    f = u ** power + v ** power                          # superellipse, close to Apple's continuous corners
    edge = 1.5 / half
    return np.clip((1 - f) / (power * edge) + .5, 0, 1)

def render(n=S):
    big = n * 2                                          # supersample
    inset = big * 100 / 1024
    body = scene(int(big - 2 * inset))
    canvas = np.zeros((big, big, 3)); i = int(inset)
    canvas[i:i + body.shape[0], i:i + body.shape[1]] = body
    alpha = squircle_mask(big, inset)
    rgba = np.dstack([canvas, alpha])
    img = Image.fromarray((rgba * 255).round().astype(np.uint8), 'RGBA').resize((n, n), Image.LANCZOS)
    shadow = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    sh = Image.fromarray((squircle_mask(n, n * 100 / 1024) * 70).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(n * 12 / 1024))
    shadow.putalpha(sh)
    shadow = shadow.transform((n, n), Image.AFFINE, (1, 0, 0, 0, 1, -n * 10 / 1024))
    out = Image.alpha_composite(shadow, img)
    return out

def icns(img, path):
    entries = [(b'ic11', 32), (b'ic12', 64), (b'ic07', 128), (b'ic13', 256), (b'ic08', 256), (b'ic14', 512), (b'ic09', 512), (b'ic10', 1024)]
    chunks = b''
    for code, size in entries:
        buf = io.BytesIO(); img.resize((size, size), Image.LANCZOS).save(buf, 'PNG'); data = buf.getvalue()
        chunks += code + struct.pack('>I', len(data) + 8) + data
    path.write_bytes(b'icns' + struct.pack('>I', len(chunks) + 8) + chunks)

if __name__ == '__main__':
    img = render()
    (ROOT / 'desktop').mkdir(exist_ok=True)
    img.save(ROOT / 'desktop' / 'icon.png')
    icns(img, ROOT / 'desktop' / 'icon.icns')
    print('wrote desktop/icon.png and desktop/icon.icns')
