# AstraCode

AI chat service, mobile first (PWA). Cloudflare Workers + D1 + R2.

## Deploy

```bash
npm i -g wrangler && wrangler login
wrangler d1 create astracode            # copy database_id into wrangler.toml
wrangler r2 bucket create astracode-slips
wrangler d1 execute astracode --remote --file=schema.sql

# API keys (one per provider you use)
wrangler secret put DEEPSEEK_KEY
wrangler secret put ANTHROPIC_KEY
wrangler secret put OPENAI_KEY
wrangler secret put GEMINI_KEY
wrangler secret put KIMI_KEY
wrangler secret put SLIP_API_KEY        # byshop slip check

wrangler deploy
```

Register with `ADMIN_EMAIL` (in `wrangler.toml`) to get the admin role. Then open `#/admin`.

## Admin setup

- **Models**: use format `openai` for OpenAI, DeepSeek, Kimi, Gemini; `anthropic` for Claude.
  - DeepSeek: `https://api.deepseek.com/v1`
  - OpenAI: `https://api.openai.com/v1`
  - Gemini: `https://generativelanguage.googleapis.com/v1beta/openai`
  - Kimi: `https://api.moonshot.ai/v1`
  - Claude: `https://api.anthropic.com/v1`
  - Promo keys with a different endpoint: put that endpoint in Base URL.
- **Costs** are THB per 1M tokens (CNY x ~4.7).
- **Units** = (fresh input + cache write + cache read / 10 + output) x multiplier.
- **Settings**: PromptPay ID, slip API URL, JSON path of the amount in the slip API response.

## Slip check

`checkSlip()` in `src/worker.js` sends `file` + `keyapi` (multipart) and `Authorization: Bearer`.
If byshop expects another format, change only that function.
The admin always approves by hand. The slip API result is shown next to each payment.

## Local dev

```bash
wrangler d1 execute astracode --local --file=schema.sql
printf 'DEEPSEEK_KEY=...\n' > .dev.vars
wrangler dev
```
