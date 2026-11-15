---
name: AstraCode
description: Liquid Glass on warm black: frosted capsules, specular edges, clay accent, serif display.
colors:
  warm-black: "#12100e"
  graphite: "#1a1714"
  carbon: "#221e1a"
  steel: "#3a342d"
  slate: "#6f665b"
  ash: "#a39a8d"
  porcelain: "#f4efe8"
  clay: "#d97757"
  clay-light: "#e8a183"
  go-green: "#30d158"
  caution-yellow: "#ffd500"
  alert-red: "#ff453a"
typography:
  display:
    fontFamily: "ui-serif, Iowan Old Style, Georgia, Prompt, serif"
    fontSize: "64px"
    fontWeight: 500
    lineHeight: 1.3
  headline:
    fontFamily: "ui-serif, Iowan Old Style, Georgia, Prompt, serif"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, Prompt, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  field: "12px"
  tile: "20px"
  card: "28px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "28px"
components:
  button-primary:
    backgroundColor: "rgba(255,255,255,0.24)"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "44px"
  button-glass:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.pill}"
    height: "44px"
  input:
    backgroundColor: "rgba(255,255,255,0.05)"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.field}"
    height: "44px"
  card:
    backgroundColor: "rgba(34,30,26,0.45)"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: AstraCode

## Overview

**Creative North Star: "The Quiet Observatory"** (kept), now seen through glass: Apple's Liquid Glass material with Claude's warmth.

Surfaces are translucent sheets over a slowly drifting warm light (clay, soft violet, sand). Each sheet blurs and saturates what is behind it, carries a bright 1px top edge and a soft drop. Shapes are capsules and generously rounded panels. The one accent is Clay; the display voice is a serif; body stays system sans.

**Key Characteristics:**
- Warm black (#12100e) page; the ambient light is fixed behind content on Home.
- Glass on floating or grouped surfaces only: nav, cards, tiles, showcase, controls.
- Primary action is a brighter clear-glass capsule (24% white, white text, soft white glow); secondary actions are the same capsule at 4% fill.
- Motion: drifting ambient light, pointer sheen on tiles, scroll reveal. All stop under `prefers-reduced-motion`.

## Colors

### Primary
- **Clay** (#d97757): accent for focus, team note and decorative light. It never fills a button.
- **Clay Light** (#e8a183): links and stat figures.

### Neutral
- **Warm Black** (#12100e) page; **Graphite** (#1a1714), **Carbon** (#221e1a) layers; **Steel** (#3a342d) borders; **Slate** (#6f665b); **Ash** (#a39a8d) secondary text; **Porcelain** (#f4efe8) body text.

### Status
- **Go Green** (#30d158), **Caution Yellow** (#ffd500), **Alert Red** (#ff453a).

### Named Rules
**The Clear Action Rule.** Actions are glass, not color. Clay stays a quiet accent for links and figures; the violet and sand in the ambient light stay behind the glass.

## Typography

**Display Font:** ui-serif, Iowan Old Style, Georgia, then Prompt for Thai
**Body Font:** system-ui, then Prompt

### Hierarchy
- **Display** (500, 40px mobile / 64px from 768px, 1.3): home hero.
- **Headline** (500, 32px, 1.3): section titles and plan prices.
- **Body** (400, 15px, 1.5): default; muted copy in Ash.
- **Label** (500, 13px): controls; the wordmark tag is uppercase, +0.16em.

Thai glyphs fall through to Prompt, so Thai headings are sans while Latin and digits are serif.

## Layout

Centered column, max 980px, 16px gutters. Home bands have no frame: the glass tiles are the structure. Plans scroll-snap on phones and form four columns from 768px. App shells keep their full-height chat and IDE grids.

## Elevation & Depth

Glass depth: `backdrop-filter: blur(24px) saturate(180%)`, a 135deg white gradient fill (11% to 3%), `inset 0 1px 0 rgba(255,255,255,.28)` for the specular edge, `0 8px 32px rgba(0,0,0,.3)` drop. The featured plan adds a white ring and glow.

### Named Rules
**The Glass Needs Light Rule.** Glass only on surfaces that sit over the ambient light or over content; flat panels inside a glass card stay flat.

## Shapes

Capsules (9999px) for buttons, tabs, chips and pills; 28px for cards and the showcase; 20px for tiles and rows; 12px for fields. Circles for avatars and icon buttons.

## Components

### Buttons
- **Primary:** clear glass, 24% white fill, 45% white border, bold white text, inset top highlight, faint white glow; lifts 1px on hover, scales to .97 on press.
- **Glass:** translucent capsule with the glass border; fills to 12% white on hover.

### Inputs / Fields
- 12px radius, 5% white fill, 12px blur, inset shadow; Clay outline on focus.

### Cards / Containers
- 28px glass card or 20px tile; on Home a soft white radial sheen follows the pointer.

### Navigation
- Sticky 52px glass bar, 55% warm black, 24px blur.

## Do's and Don'ts

### Do:
- **Do** keep 44px touch targets and a visible focus outline.
- **Do** keep body text at 4.5:1 or better over the glass.
- **Do** provide a solid fallback where `backdrop-filter` is unsupported (already in the stylesheet).

### Don't:
- **Don't** stack glass on glass beyond one level, or blur the whole page.
- **Don't** fill a button with Clay or any saturated color; keep actions clear glass.
- **Don't** change copy or behavior while restyling.
- **Don't** break the CSP: no inline scripts, no new script origins beyond cdn.jsdelivr.net.
