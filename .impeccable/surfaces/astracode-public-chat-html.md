---
version: 1
slug: "astracode-public-chat-html"
primary_target: "astracode/public/chat.html"
related_targets: ["astracode/public/style.css","astracode/public/app.js","astracode/public/chat.js"]
---

# Surface brief: Kyber app shell UI 2.0 (chat first, then every page)

Mode: Operate (chat, code, account, admin); home and plans are Persuade inside the same world. Light theme leads; dark stays as an option.

## Job and audience
Thai users on phones, daytime. They pick a model (or Auto), ask, read long Thai answers, and need to know how much quota is left. Pain points confirmed by the owner: cannot find buttons/menus, hard to read on mobile, unclear usage/remaining quota, home/plans not convincing.

## Scope and boundaries
Visual world replaced and layout reorganized; every feature and behavior stays, Thai copy stays unless a label must move. CSP unchanged (no inline scripts). Files: `astracode/public/style.css`, markup builders in `app.js`, `chat.js`, `shop.js`, `account.js`, `code.js`; page heads via `tools/pages.mjs`.

## Direction contract
THESIS: One calm white work surface where the only colour that moves is Kyber's light: quota and progress are drawn as light refracted through a prism. Refuses the cream-paper + serif + terracotta look and the grey ChatGPT clone.
OWN-WORLD: Cool paper ground #F6F7FB, white surfaces, ink #0E1116, muted #5B6170, hairlines #E3E6EE; primary actions are ink pills; indigo #4B4FE0 for selection, links and focus; the spectrum cyan #14B8D9 → indigo #4B4FE0 → magenta #D9409A is reserved for the signature; status green/amber/red only where they mean something. Type: Anuphan 400–700 for Thai and Latin, tabular numerals. Radii 12/18/24 and pills, soft cool shadows, no glass.
STORY: At any moment the user sees where they are, which model answers, how much of the 4-hour and weekly quota is left, and what each answer cost; every main destination is one tap away.
FIRST VIEWPORT: Phone chat. 56px top bar: menu, chat title, quota pill (mini spectral meter + %). Messages column, answers 16.5px/1.75 without bubbles, user messages in ink bubbles, a footer under each answer with model chip and its cost. Composer card at the bottom: input, then one row [+] [model chip ▾] [แชต | โค้ด | Agent segmented] [ink send circle]. Bottom tab bar on phones: แชต, โค้ด, การใช้งาน, บัญชี. Desktop: left sidebar replaces the tab bar.
FORM: Prism (Kyber crystal), position 7 of 7 on the grounded list; seed:ddf247f73ddb3965. Signature: the refraction meter, a spectral fill for quota (top pill, usage sheet, account), and the same light on active/progress states.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions
Logo arm colour (keep clay or move to the spectrum) to confirm with the owner before the home/plans pass.
