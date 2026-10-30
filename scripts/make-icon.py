"""Build Naru's macOS icons with AppKit and iconutil (no Python packages required)."""
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / 'desktop'
DESKTOP.mkdir(exist_ok=True)
png = DESKTOP / 'icon.png'
subprocess.run(['swift', str(ROOT / 'scripts/make-icon.swift'), str(png)], check=True)
# AppKit may render at Retina scale; standardize the master before making the iconset.
subprocess.run(['sips', '-z', '1024', '1024', str(png)], check=True, stdout=subprocess.DEVNULL)
with tempfile.TemporaryDirectory(prefix='naru-icon-') as tmp:
    iconset = Path(tmp) / 'Naru.iconset'
    iconset.mkdir()
    for point in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            suffix = '@2x' if scale == 2 else ''
            name = f'icon_{point}x{point}{suffix}.png'
            subprocess.run(['sips', '-z', str(point * scale), str(point * scale), str(png), '--out', str(iconset / name)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(DESKTOP / 'icon.icns')], check=True)
print('wrote desktop/icon.png and desktop/icon.icns')

# Dot-matrix lowercase wordmark, using currentColor in every UI theme.
import json
import re
letters = {
    'n': ['11110', '10001', '10001', '10001', '10001'],
    'a': ['01110', '00001', '01111', '10001', '01111'],
    'r': ['10110', '11001', '10000', '10000', '10000'],
    'u': ['10001', '10001', '10001', '10011', '01101'],
}
circles = []
for letter, glyph in enumerate('naru'):
    for row, line in enumerate(letters[glyph]):
        for col, dot in enumerate(line):
            if dot == '1':
                circles.append(f'<circle cx="{2 + letter * 27 + col * 4}" cy="{2 + row * 4}" r="1.65"/>')
mark = '<svg xmlns="http://www.w3.org/2000/svg" class="wordmark" viewBox="0 0 101 20" fill="currentColor" role="img" aria-label="naru">' + ''.join(circles) + '</svg>'
(ROOT / 'public/wordmark.svg').write_text(mark + '\n')
client = ROOT / 'public/app.js'
source = client.read_text()
source, count = re.subn(r"const WORDMARK=.*?;\n", lambda _: 'const WORDMARK=' + json.dumps(mark) + ';\n', source, count=1)
assert count == 1
client.write_text(source)
print('wrote public/wordmark.svg and embedded wordmark')
