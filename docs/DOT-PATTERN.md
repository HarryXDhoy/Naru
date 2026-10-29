# Dotted texture — ego(lite) Style extension

A fine, evenly spaced dot grid adds a quiet technical texture over the blue hero and at the edge of the sidebar. The image supplied by the user is the visual reference. The same Dotted texture (Naru) rules are recorded in the Claude ego(lite) Style design system.

## Tokens

The CSS custom properties in `public/styles.css` are the source of truth:

| Token | Value | Use |
| --- | --- | --- |
| `--dot-grid` | `7px` | Distance between dot centers in both directions |
| `--dot-radius` | `.8px` | Dot radius; an extra `.35px` softens the edge |
| `--dot-hero-color` | `#ffffffb3` | Light dots over the blue hero |
| `--dot-side-color` | `#152256` light, `#cfe2ff` dark | Sidebar dot color |
| `--dot-side-opacity` | `.055` light, `.10` dark | Restrained sidebar texture |

## Application

- The hero uses the Defined halftone artwork, reduced in the center and stronger toward the edges, with the fine dot grid above it. The artwork drifts slowly over the WebGL or CSS fallback background, below the heading and composer, and never captures pointer events.
- The sidebar uses the same spacing and radius, fading toward the bottom. Text and controls remain visually foregrounded.
- Keep conversation text, form inputs, menus and approval panels on solid surfaces for legibility. The artwork movement pauses when the window is hidden and remains still when reduced motion is requested.
- Use the same CSS-pixel spacing on narrow screens. Do not rasterize or stretch a bitmap: the CSS pattern remains sharp on Retina and other displays.

## Defined theme

The hero uses the HalftoneField shader recovered from the user’s design-system bundle, with theme-aware output and a pointer lens. `public/defined-halftone.svg` provides the fallback when WebGL is unavailable. The fine 7px / .8px dot grid remains a separate overlay. The sidebar uses the standard dot colours (`#152256` at 5.5 % light, `#cfe2ff` at 10 % dark).
