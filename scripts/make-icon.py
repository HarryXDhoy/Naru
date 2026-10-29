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
