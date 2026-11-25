---
name: Kyber
description: UI 2.0 "Prism": one calm light work surface; the only colour that moves is Kyber's light (a cyan → indigo → magenta spectrum) on quota and progress.
colors:
  ground: "#f6f7fb"
  surface: "#ffffff"
  ink: "#0e1116"
  muted: "#5b6170"
  hairline: "#e3e6ee"
  graphite: "#eef0f6"
  indigo: "#4b4fe0"
  link: "#3d41c9"
  spectrum-start: "#14b8d9"
  spectrum-mid: "#4b4fe0"
  spectrum-end: "#d9409a"
  green: "#12805c"
  yellow: "#9a6700"
  red: "#d1242f"
  night-ground: "#0e1116"
  night-surface: "#151922"
  night-text: "#eef0f6"
  night-indigo: "#8b8fff"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Prompt, ui-sans-serif, sans-serif"
    fontSize: "40px mobile / 56px from 768px"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "system-ui, -apple-system, Prompt, ui-sans-serif, sans-serif"
    fontSize: "26px mobile / 32px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, Prompt, ui-sans-serif, sans-serif"
    fontSize: "15px (chat answers 16.5px / 1.75, user-adjustable S·M·L)"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  field: "12px"
  card: "18px"
  sheet: "24px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: "1px {colors.hairline}"
    rounded: "{rounded.pill}"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    border: "1px {colors.hairline}"
    rounded: "{rounded.card}"
    padding: "16-22px"
  meter:
    track: "{colors.hairline}"
    fill: "linear-gradient(90deg, spectrum-start, spectrum-mid, spectrum-end)"
    rounded: "{rounded.pill}"
---

# Design System: Kyber (UI 2.0 · Prism)

## Overview

**Thesis:** one calm white work surface where the only colour that moves is Kyber's light. Quota and progress are drawn as light refracted through a prism. Everything else is ink on white with indigo for selection and links.

Light theme is the default; a cool night theme is available (`data-theme=dark`). The user always sees where they are, which model answers, how much of the 4-hour and weekly limit is left, and what each answer cost.

**Key characteristics**
- Ground `#f6f7fb`, white surfaces with 1px `#e3e6ee` hairlines and a soft cool shadow on floating cards (`--shadow-1`). No glass, no blur as decoration.
- Primary actions are ink pills (`#0e1116`, white text). Secondary actions are white pills with a hairline.
- Indigo `#4b4fe0` marks selection, focus rings and links (`#3d41c9`).
- The spectrum (`#14b8d9 → #4b4fe0 → #d9409a`) appears only on: limit meters, the plan "more than Free" bar, the logo's upper arm, and one blurred band behind the home hero.

## Colors

- **Neutrals:** ground `#f6f7fb`, surface `#ffffff`, graphite `#eef0f6` (quiet fills, chips), hairline `#e3e6ee`, muted text `#5b6170`, ink `#0e1116`.
- **Accent:** indigo `#4b4fe0`; link `#3d41c9`; tint `rgba(75,79,224,.08)` for promo strips and the value card.
- **Status:** green `#12805c`, yellow `#9a6700`, red `#d1242f`. A meter at ≥80% turns indigo→magenta→orange; at 100% red.
- **Night theme:** ground `#0e1116`, surfaces `#151922` / `#1b202b`, borders `#2c3342`, muted `#a3abbd`, text `#eef0f6`, indigo `#8b8fff`.

**The One Light Rule.** The spectrum is never a button fill, never text, never a border. If it is not showing an amount (limit, progress, share of Free), it is not the spectrum.

## Typography

Font stack: `system-ui, -apple-system, 'Prompt', ui-sans-serif, sans-serif` for body and display (Thai falls through to Prompt); Inter is loaded for Latin. Code uses JetBrains Mono on the Code page.

- **Display** 700, 40px mobile / 56px desktop, tight tracking (-0.02em), `text-wrap: balance`.
- **Headline** 700, 26–32px for section titles; plan and page headers (`.shop-hero h1`) 32–40px, left-aligned.
- **Body** 15px / 1.5; muted copy in `#5b6170`. Chat answers 16.5px / 1.75 (user setting S 14.5 · M 16.5 · L 18).
- **Numbers** that matter (prices, %, token prices) are ink and bold, `tabular-nums`. Never grey.

## Layout

- Centered columns: 720px for shop, plans and pricing headers and the plan list; 980px for feature grids.
- **Phone first:** 16px gutters, no horizontal page scroll (`html, body { overflow-x: clip }`); anything wide scrolls inside its own box with a fade mask (`.shop-ctl`, `.acc-nav`).
- **Chat:** 56px top bar with the quota pill (mini spectral meter + %), answers without bubbles, user messages in ink bubbles, a footer under each answer with model and cost. Composer is a white card: input, then one row of [+] [model] [effort] [ink send].
- **Side menu:** the ☰ panel on every page matches the chat sidebar: Chat / Code / Harness switch, New chat, Workspace (and Artifacts), My files, Video, Chats list, account row.
- **Plans:** a vertical list of plan rows. Each row shows name, price and "limit × Free" with a spectral bar; the featured or selected plan is expanded; others expand on tap. One promo strip above the list, never one per card.
- **Account:** sticky category chips with a scroll-spy highlight; the limit card comes first.
- **Announcements** stack in one dock (`.ann-dock`) at the bottom (top on the chat page); they never overlap.

## Elevation & Depth

Flat by default. Floating or interactive cards get `--shadow-1` (soft, cool, low opacity). Featured plan: 2px ink border. Selected plan: 2px indigo border plus a 4px indigo halo. Sheets and dialogs sit on a dim scrim.

## Shapes

Pills (9999px) for buttons, segmented controls, chips and the quota pill; 18px for cards and plan rows; 24px for sheets and the account header cards; 12px for fields and feature-icon tiles.

## Components

- **Buttons:** primary = ink pill; secondary = white pill with hairline; danger = red text pill. 44px touch targets.
- **Segmented control (`.seg`):** graphite track, the active option is an ink pill (or a white card with shadow inside the sidebar mode switch).
- **Meters (`.meter`, `.bar1`, `.ls-bar`, `.pl-bar`, `.lmini`):** hairline track, spectrum fill.
- **Plan row (`.pl .tile.plan`):** see Layout; CTA inside the expanded row (ink for featured, outline otherwise).
- **Canvas / Artifact preview:** white header; a device bar to preview in full width, phone (iPhone frame), tablet (iPad frame) or desktop frame, with model presets, rotate and zoom %.
- **Feature list (`.fi`):** icon tile + title + one line; linked items get an indigo arrow.

## Do's and Don'ts

**Do**
- Keep 44px touch targets and a visible indigo focus ring.
- Keep body text at 4.5:1 or better; prices and percentages in ink.
- Test at 390px width: nothing may cause horizontal page scroll.
- Keep every feature reachable from the ☰ menu on every page.

**Don't**
- Don't add glass, blur or gradient text; don't put an eyebrow/kicker label above headings.
- Don't use the spectrum for anything that is not an amount.
- Don't repeat the same badge or promo on every card; say it once above the group.
- Don't change copy or behavior while restyling.
- Don't break the CSP: no inline scripts, no new script origins beyond cdn.jsdelivr.net; fonts only from Google Fonts.
