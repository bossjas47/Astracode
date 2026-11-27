---
version: 1
slug: "astracode-public-chat-html"
primary_target: "astracode/public/chat.html"
related_targets: ["astracode/public/ui25.css","astracode/public/app.js","astracode/public/chat.js"]
---

# Surface brief: Kyber UI 2.5 "Noir" (model picker first, then every page)

Mode: Operate (chat, code, harness, model picker, account); home, plans and pricing are Persuade inside the same world.

## Job and audience
Thai users, mostly phones, often evenings. Customers called the model picker "old-fashioned". The owner wants a premium black look in the spirit of the LuxAlgo site, in Kyber's own identity, on every page. Behavior and Thai copy stay.

## Direction contract
THESIS: Premium noir: pure black ground, quiet hairlines, white ink, big tight headings, white pill primary actions; colour only where it means something (status, new, offer). Refuses grey-on-grey SaaS chrome and neon glow.
OWN-WORLD: Ground #000, surfaces #0b0b0b/#121212, hairlines white 8-14%, text #f2f2f2, muted #8f8f8f; white pill = primary, hairline pill = secondary; Anuphan for Thai/Latin, JetBrains Mono only for numbers that are measurements (×multiplier, tokens, prices in spec rows); small tracked section labels in lists (not above headings); status green #3ccf8e / amber #f3b45a / red #ff5a4e; Kyber spectrum only on quota meters.
STORY: The user sees a calm list of models grouped by purpose, each with one-line use, live status dot and limit multiplier; picks in one tap; knows cost before sending.
FIRST VIEWPORT: Model picker bottom sheet on a phone: grab handle, title "เลือกโมเดล" 24px, close; segmented filter row; "อัตโนมัติ" card; grouped rows: 34px logo tile, name 15.5px + tag, one-line note with status dot, mono ×multiplier right, selected row on #111 with white check.
FORM: Canon (standing exit) taken by the owner, craft bar = the owner's LuxAlgo reference; seed:1e04bf4793cea0ad
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
