---
name: AstraCode
description: Flat, black, OpenAI-style Thai AI chat and code workspace with a few web tricks on the home page.
colors:
  black: "#000000"
  graphite: "#0a0a0b"
  carbon: "#121214"
  steel: "#26262b"
  slate: "#5c5c68"
  ash: "#8e8ea0"
  porcelain: "#ececf1"
  link: "#b4b4c7"
  go-green: "#30d158"
  caution-yellow: "#ffd500"
  alert-red: "#ff453a"
typography:
  display:
    fontFamily: "system-ui, Prompt, sans-serif"
    fontSize: "64px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "system-ui, Prompt, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, Prompt, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  base: "5px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "#ffffff"
    textColor: "#000000"
    rounded: "{rounded.base}"
    padding: "0 24px"
    height: "44px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.base}"
    height: "44px"
  input:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.base}"
    height: "44px"
  card:
    backgroundColor: "{colors.graphite}"
    rounded: "{rounded.base}"
    padding: "24px"
---

# Design System: AstraCode

## Overview

**Creative North Star: "The Quiet Observatory"** (kept), now drawn in the flat, engineered manner of OpenAI's system, on true black.

Everything is flat: one 5px radius, 1px hairlines, no resting shadows, an 8px spacing grid and a single 400ms `ease` for every transition. The accent is the muted purple-gray Ash (#8e8ea0), used for secondary text, focus and the feature outline. The primary action is a white button with black text, because white on Ash fails contrast (about 3.3:1) while white on black is 21:1.

**Key Characteristics:**
- True black page (#000), graphite and carbon layers, hairline borders `rgba(255,255,255,.1)`.
- System-UI type stack with Prompt for Thai glyphs; no webfont for Latin.
- Web tricks live on Home only: pointer spotlight on the hero and tile borders, a dotted grid, scroll reveal. All are off under `prefers-reduced-motion`.

## Colors

### Primary
- **White** (#ffffff on #000000): primary buttons.
- **Ash** (#8e8ea0): secondary text, feature-plan outline, focus accents; 6.6:1 on black.

### Neutral
- **Black** (#000000) page. **Graphite** (#0a0a0b) tiles. **Carbon** (#121214) cards and hover. **Steel** (#26262b) field borders. **Slate** (#5c5c68) outline ring. **Porcelain** (#ececf1) body text. **Link** (#b4b4c7) inline links.

### Status
- **Go Green** (#30d158), **Caution Yellow** (#ffd500), **Alert Red** (#ff453a).

### Named Rules
**The White Action Rule.** The one primary action per screen is white on black; Ash never carries a filled button.

## Typography

**Display / Body Font:** system-ui, then Prompt, then sans-serif

### Hierarchy
- **Display** (700, 40px mobile / 64px from 768px, 1.3, -0.03em): home hero.
- **Headline** (600, 32px, 1.3): section titles.
- **Body** (400, 15px, 1.5): default; muted copy in Ash.
- **Label** (500, 13px): buttons, fields, the AstraCode wordmark tag (uppercase, +0.16em).

## Layout

Centered column, max 980px, 16px gutters; 8px grid (8/16/24/32/48/56). App shells keep their full-height chat and IDE grids. Breakpoints: 400, 520, 760, 1000, 1280px. Plans scroll-snap on phones and sit in a four-column grid from 768px.

## Elevation & Depth

Flat. Depth is a background step and a 1px hairline. No resting shadows. Floating layers (modals, toasts) may keep a soft shadow.

### Named Rules
**The Flat Rule.** If a surface needs separation, add a hairline or a tone step, never a shadow.

## Shapes

One radius: 5px on buttons, fields, cards, tabs, pills. Circles (50%) for avatars, dots and icon buttons. Switch tracks stay pill-shaped because they are a control shape, not a container.

## Components

### Buttons
- 5px radius, 44px tall (48px in the hero). Primary white/black. Outline: transparent with a 1px Slate ring, fills 6% white on hover. 400ms ease.

### Inputs / Fields
- 5px radius, 1px Steel border, 4% white fill; focus outline in Ash.

### Cards / Containers
- Graphite fill, 1px hairline, 5px radius, 24px padding. On Home, the border lights up toward the pointer.

### Navigation
- Sticky 52px bar, 80% black with 20px backdrop blur and a hairline bottom border.

## Do's and Don'ts

### Do:
- **Do** keep 44px touch targets and a visible focus outline.
- **Do** keep Thai line height at 1.3 or more for headings, 1.5 for body.
- **Do** keep content visible by default; JS adds reveal classes only when motion is allowed.

### Don't:
- **Don't** add shadows, gradients on text, or a second accent hue.
- **Don't** fill a button with Ash and put white text on it.
- **Don't** change copy or behavior while restyling.
- **Don't** break the CSP: no inline scripts, no new script origins beyond cdn.jsdelivr.net.
