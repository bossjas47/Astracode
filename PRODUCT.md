# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Thai speakers using AI on mobile first (PWA). Three audiences, all confirmed:
- General Thai users who chat with AI day to day.
- Developers and coding students who use Code mode, GitHub sync and the API.
- Small teams and organizations who share a plan and a quota.

## Product Purpose
AstraCode is a Thai AI chat and in-browser Code mode. One account gives access to many models, billed in baht. Success: a Thai user pays by PromptPay, picks or auto-selects a model, and finishes real work (chat, edit a project, run code) without a foreign card.

## Positioning
Four things a global competitor cannot truthfully copy together: prices in baht with PromptPay top-up and Wallet; many models in one place (with an Auto picker); Code mode that edits and previews projects in the browser; an OpenAI-compatible API (`/v1`).

## Operating Context
Mostly phones. Thai UI text. Usage is metered as real cost in baht and shown to users as a percent: a 4-hour window plus a weekly window, with overflow to Wallet. Plans: Free, DeepSeek Lite/Max, Plus, Pro, Max, and Team plans. Payment by slip upload, auto-checked (Slip2Go/byshop). Login: Firebase email, Google, LINE, optional 2FA.

## Capabilities and Constraints
- Pages: home, login, chat, code, plans, pricing, terms, account, developers, support, blog, status, receipt, share, admin.
- Redesign scope (confirmed): every page. Behavior and all existing text stay unchanged. Visual layer only.
- Frontend is plain HTML/CSS/vanilla JS served by a Cloudflare Worker (`wrangler deploy`). No framework or build step. Strict CSP: no inline scripts, scripts only from self and cdn.jsdelivr.net.
- `preview` and `node-runner` pages run user code in a sandbox and keep their own CSP.
- Offline PWA shell (`sw.js`, `manifest.json`).

## Brand Commitments
Name: AstraCode. Existing assets: `public/icon.svg`, `public/og.png`. Existing Thai copy is binding. No voice or visual commitments beyond that were stated.

## Evidence on Hand
No testimonials, customer logos, benchmarks or press in the repo. Do not invent any. Blog posts and plan/model prices live in the database, not in files.

## Product Principles
1. Baht-first clarity: show cost and remaining quota plainly, in Thai.
2. Mobile first: every core flow works one-handed on a phone.
3. Many models, one calm surface: choice must not feel like clutter.
4. Developers and non-developers share the product: Code mode must not scare chat users.
5. Never touch behavior or copy during a visual redesign.

## Accessibility & Inclusion
Thai script must render well (line height, no clipped diacritics, readable at small sizes). No product-specific standard was stated. Keep contrast and touch targets sound.
