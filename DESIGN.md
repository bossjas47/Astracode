---
name: AstraCode
description: Dark, Apple-leaning Thai AI chat and code workspace.
colors:
  obsidian: "#050507"
  graphite: "#0e0e11"
  carbon: "#18181c"
  steel: "#2e2e34"
  slate: "#6e6e73"
  ash: "#8e8e93"
  porcelain: "#f5f5f7"
  signal-blue: "#0071e3"
  link-blue: "#2997ff"
  go-green: "#30d158"
  caution-yellow: "#ffd500"
  alert-red: "#ff453a"
typography:
  display:
    fontFamily: "SF Pro Display, Inter, Prompt, ui-sans-serif, system-ui, sans-serif"
    fontSize: "80px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-1.2px"
  headline:
    fontFamily: "SF Pro Display, Inter, Prompt, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: "SF Pro Text, Inter, Prompt, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "SF Pro Text, Inter, Prompt, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
rounded:
  input: "12px"
  card: "28px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "28px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "44px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "44px"
  input:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.input}"
    padding: "10px 14px"
    height: "44px"
  card:
    backgroundColor: "{colors.carbon}"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: AstraCode

## Overview

**Creative North Star: "The Quiet Observatory"**

A dark room where the work glows and the chrome does not. Near-black surfaces recede, one blue accent marks the next action, and everything else is porcelain text on layered graphite. It reads like an Apple dark theme because that is the incumbent system; the redesign keeps product truth and replaces the look, so treat this file as evidence of the current state.

Density is low on marketing pages (large centered display type, wide gutters) and tighter in the chat and code workspaces (280px sidebar, 36–44px controls). Touch comes first: controls are at least 44px tall.

**Key Characteristics:**
- Dark only (`color-scheme: dark`); no light theme.
- One accent (signal blue) used for primary actions; links use a lighter blue.
- Soft, tactile shapes: pills for actions, 28px cards, 12px fields.
- Depth from tone and hairlines first, shadow only on floating layers.
- Thai text relies on Prompt as the fallback face; Inter covers Latin.

## Colors

A neutral near-black ramp plus one blue and three status colors.

### Primary
- **Signal Blue** (#0071e3): primary buttons and focus outline on fields.
- **Link Blue** (#2997ff): inline links only.

### Neutral
- **Obsidian** (#050507): page background, inner tiles.
- **Graphite** (#0e0e11): sidebar.
- **Carbon** (#18181c): cards, hover and selected rows.
- **Steel** (#2e2e34): input borders, outline buttons at rest.
- **Slate** (#6e6e73): outline button ring.
- **Ash** (#8e8e93): secondary text, labels.
- **Porcelain** (#f5f5f7): body text, selected tab fill, focus ring.

### Status
- **Go Green** (#30d158), **Caution Yellow** (#ffd500), **Alert Red** (#ff453a): success, warning, error and destructive text.

### Named Rules
**The One Voice Rule.** Signal Blue marks the single primary action on a screen. Selection and focus use Porcelain, not blue.

## Typography

**Display Font:** SF Pro Display, then Inter, Prompt
**Body Font:** SF Pro Text, then Inter, Prompt

**Character:** Neutral grotesque with tight display tracking. Prompt supplies Thai glyphs; SF Pro only exists on Apple devices, so Inter is what most users see.

### Hierarchy
- **Display** (600, 40px mobile / 80px from 768px, 1.15, -1.2px tracking): home hero.
- **Headline** (600, 32px, 1.15): section titles, auth title.
- **Title** (600, 19–28px): logo, stat numbers.
- **Body** (400, 15px, 1.5): everything else; muted copy 13px in Ash.
- **Label** (500, 13–15px): buttons and field labels.

## Layout

Centered column, max 980px with 16px side gutters on public pages. The app shells use full height (`100dvh`): chat is a 280px sidebar plus fluid main; code is a three-column IDE grid that collapses below 1000px. Breakpoints in use: 400, 520, 760, 860, 1000, 1280px. Spacing rhythm is 8 / 16 / 28px.

## Elevation & Depth

Hybrid, tonal first. Layers separate by background step (Obsidian, Graphite, Carbon) and a 1px hairline (`rgba(255,255,255,.09)`). Shadows appear on cards (`0 12px 32px rgba(0,0,0,.35)`) and on floating layers (`0 8px 28px rgba(0,0,0,.45)` with a faint top highlight). Selection uses an inset 2px Porcelain ring, not a shadow.

### Named Rules
**The Hairline First Rule.** Reach for a tone step or hairline before a shadow; shadows belong to layers that float.

## Shapes

Three radii carry the language: 9999px for actions and tabs, 28px for cards and tiles, 12px for fields (16px for textarea). Smaller 10–20px radii appear on list rows and popovers.

## Components

### Buttons
- **Shape:** full pill (9999px), 44px tall (36px for `.sm`), 22px horizontal padding.
- **Primary:** Signal Blue fill, white text.
- **Outline:** transparent with a 1px Slate inset ring, Porcelain text.
- **Dark:** translucent graphite fill. **Red:** Alert Red text on a Steel ring.
- **Disabled:** 40% opacity.

### Inputs / Fields
- **Style:** 12px radius, 1px Steel border, 4% white fill, 44px min height.
- **Focus:** 1px Signal Blue outline offset 1px.

### Cards / Containers
- **Corner Style:** 28px. **Background:** Carbon; inner tiles Obsidian with a hairline.
- **Padding:** 24–28px.

### Tabs
- Pill chips, 36px tall, Steel border; the active tab fills Porcelain with dark text.

### Navigation
- Sticky 52px bar, 80% black with a 20px backdrop blur and a #282828 bottom border; 13px links.

## Do's and Don'ts

### Do:
- **Do** keep touch targets at 44px or more.
- **Do** keep focus visible: 2px Porcelain outline, 2px offset.
- **Do** respect `prefers-reduced-motion` (already global).
- **Do** keep Thai line height at 1.5 or more for body copy.

### Don't:
- **Don't** add a second accent color next to Signal Blue.
- **Don't** change copy or behavior while restyling.
- **Don't** break the CSP: no inline scripts, no new script origins beyond cdn.jsdelivr.net.
