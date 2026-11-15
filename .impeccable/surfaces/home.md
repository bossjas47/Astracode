# Surface brief: Home (`/`)

Mode: Persuade. World: Quiet Observatory (DESIGN.md), refined, not replaced.

## Job and audience
Thai visitors, mostly on phones: general chat users, coders, small teams. They arrive from search or a shared link and need to judge whether AstraCode is worth paying for.

## Outcome and proof
Primary action: look at plans and prices. Success: the visitor reaches the plan tiles and either starts free or picks a plan. Proof available: live plan data from `/api/plans`, the model list in the copy, and the existing showcase chat mock. No testimonials or customer logos exist; none may be invented.

## Selected direction
- Keep dark, single-blue, soft-pill language. Raise craft: stronger hierarchy, one focal moment, calmer rhythm.
- Sequence: hero (promise + two buttons) -> plans immediately after the hero (promoted above feature bands) -> why AstraCode (baht/PromptPay, many models, Code, API) -> plan comparison -> install -> FAQ -> blog -> footer.
- Focal moment: the hero showcase (model pill, thinking pill, quota ring, code answer).
- Primary hero button stays "เริ่มใช้ฟรี"; "ดูแพลน" scrolls to plans.

## Scope and boundaries
Production code in `astracode/public/style.css` and the markup inside `landing()` in `app.js`. Allowed: reorder sections, restyle, add CSS. Untouched: all Thai copy, plan data, links, behavior (currency switch, install box, FAQ, smooth scroll), CSP (no inline scripts), other pages. Existing inline `style=` attributes may be replaced by classes.

## States and ranges
Plans: 1 to ~7 tiles, both currencies. Posts: 0 to 3 (section hidden when none). Signed-in visitor sees "เข้าสู่แชต" / "บัญชีของฉัน" instead of sign-up buttons. Logged-out is the main case.

## Interaction and layout
Mobile first: single column, 44px targets, plans scroll-snap or stack. From 768px: hero display 80px, plans in a grid. Reduced motion respected.

## Constraints and open decisions
Thai line height 1.5+. Fonts stay Inter/Prompt via the existing Google Fonts link. Open: whether plan tiles move from stacked to a horizontal snap row on mobile (decide during build).
