---
name: Kyber
description: UI 2.5 "Noir": pure black ground, quiet white hairlines, white ink and white pill actions; colour only where it means something (status, new, offer); Kyber's spectrum lives only on quota meters.
colors:
  ground: "#000000"
  surface: "#0b0b0b"
  surface-2: "#121212"
  hairline: "rgba(255,255,255,0.10)"
  hairline-strong: "rgba(255,255,255,0.18)"
  ink: "#f2f2f2"
  muted: "#9a9a9a"
  on-ink: "#000000"
  green: "#3ccf8e"
  amber: "#f3b45a"
  red: "#ff5a4e"
  offer-red: "#ff6a5e"
  spectrum-start: "#14b8d9"
  spectrum-mid: "#6b6ff5"
  spectrum-end: "#e0509f"
  day-ground: "#f6f7fb"
  day-surface: "#ffffff"
  day-ink: "#0e1116"
typography:
  family: "Anuphan, system-ui, -apple-system, Prompt, sans-serif"
  numeric: "JetBrains Mono (×multipliers, countdown, token counts; never for prose)"
  display:
    fontSize: "clamp(36px, 6vw, 64px)"
    fontWeight: 700
    letterSpacing: "-0.025em"
  sheet-title:
    fontSize: "22px"
    fontWeight: 600
  body:
    fontSize: "15px"
    lineHeight: 1.5
rounded:
  row: "14px"
  card: "18px"
  sheet: "24px"
  pill: "9999px"
components:
  button-primary: { background: "{colors.ink}", text: "{colors.on-ink}", rounded: "{rounded.pill}", height: "44px" }
  button-secondary: { background: "transparent", border: "1px {colors.hairline-strong}", text: "{colors.ink}", rounded: "{rounded.pill}" }
  meter: { track: "rgba(255,255,255,0.10)", fill: "linear-gradient(90deg, spectrum-start, spectrum-mid, spectrum-end)", hi: "indigo→magenta→amber", full: "{colors.red}" }
---

# Design System: Kyber (UI 2.5 · Noir)

## Overview

Premium noir. The app sits on pure black; surfaces are separated by white hairlines at 8–18% rather than by grey fills. Ink is near-white, primary actions are white pills, secondary actions are hairline pills. Colour is never decoration: green/amber/red for live status, a white "ใหม่" tag, amber "กำลังอัปเดต", red for an offer's countdown, and Kyber's spectrum only on quota meters. Dark is the default theme; the light theme stays available and keeps the same structure on a cool white ground.

Layering: `public/style.css` holds the base system; `public/ui25.css` is the Noir layer loaded after it on every page.

## Colors

- Ground `#000`, surfaces `#0b0b0b` (composer, sheets) and `#121212`, hairlines white 10% (strong 18%).
- Ink `#f2f2f2`, muted `#9a9a9a`; text on white pills is `#000`.
- Status: green `#3ccf8e` (≥95% success), amber `#f3b45a` (≥80%, updating), red `#ff5a4e` (down, full).
- Offer: countdown digits `#ff6a5e` inside a red hairline pill.
- Spectrum `#14b8d9 → #6b6ff5 → #e0509f`: quota meters only (sidebar user bar, limit sheet, account limit cards).

## Typography

Anuphan for Thai and Latin at every size; headings tight (-0.025em), balanced. JetBrains Mono only for measurements: model ×multipliers, the promo countdown, token counts. Section labels inside lists are 12px muted with light tracking (+0.02em; Thai reads poorly with wide tracking). No eyebrow/kicker labels above headings.

## Components

- **Model picker sheet:** search field, segmented view (แนะนำ · ทั้งหมด · ค่าย, remembered), "อัตโนมัติ" card, grouped rows: 36px brand tile, name + tags, one-line note with a live status dot (7-day success), mono ×multiplier right, selected row on white 7% with a white check. Grab handle on phones.
- **Limit sheet / account limit cards:** hairline cards; label + "เหลือ X%", big used % (44px), 8px spectrum meter, reset line with clock icon.
- **Effort sheet:** rows with signal bars (depth), two 5-dot meters (speed, limit), "แนะนำ" on Medium; the composer chip shows the same bars.
- **Countdown promo strip:** black strip, offer text, mono D/H/M/S pill, tied to the real promo end, hidden after expiry.
- **Sidebar quick links (every page and the phone drawer):** Workspace, Artifacts, API นักพัฒนา, แอปบนคอม, แพลนและเติมเงิน (balance), above the chat list; a "กำลังทำงาน" section lists chats with a running Agent.
- **Agent card:** live header (step, elapsed, tokens, limit), plan chips, step rows with Thai tool labels and diff counts, latest diff preview.

## Do's and Don'ts

Do keep 44px targets, palette-drawn focus rings, Thai copy unchanged, and every feature one tap from the quick links. Don't add glow, glass, gradient fills on surfaces, leftover indigo chips, or colour that carries no meaning; don't put labels above headings.
