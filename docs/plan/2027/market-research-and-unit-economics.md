# DMaker — Market Research & Unit Economics

_Research date: 2026-08-26. Companion to [saas-on-aws-architecture-plan.md](./saas-on-aws-architecture-plan.md) (cost model in "Rough cost model", § Billing & metering). A rendered version with the break-even chart lives in [unit-economics.html](./unit-economics.html) (published artifact: https://claude.ai/code/artifact/074737ba-6637-42c7-8bf3-b791e2cc1eb8)._

## Executive summary

- **Break-even ≈ 9 paying users** (6–12 range) at plan pricing (~$30 seat + credits at cost +15%). Seats-only P1 at $40/seat also breaks even ≈ 9 users; $20/seat ≈ 19 users.
- **Profit per user after break-even ≈ $32–72/mo** ($44 for a medium user; up to ~$115 with caching-spread capture), because past the fixed floor a user only costs their own usage.
- **The market converged mid-2026** on a $0 → $20 → $100 → $200 individual ladder, $19–40/seat team tier, custom enterprise, and overage at raw API token rates. GitHub (Jun 1), Cognition (Jun) and OpenAI (Apr) all moved to dollar-denominated, API-pegged usage billing within three months.
- **Tenant ≈ $0 cost → packaging lever; seat ≈ <$1–7 → margin engine; usage ≈ 92%+ of cost → must always be metered with markup.** Flat tiers without hard quotas lose money on every heavy user (−$180/mo on a $100 tier).
- **Price ceiling is supplier-set:** a medium user costs ~$92 while Claude Max sells them the same usage for $100. Profit lives in hybrid-runner seats, org minimums, credit markup and the caching spread — not in reselling tokens.

## 1. DMaker cost base (from the plan)

| Cost driver                  | /mo      | Notes                                                                       |
| ---------------------------- | -------- | --------------------------------------------------------------------------- |
| Fixed platform floor         | $250–450 | Drifts to $350–550 at 20+ active users                                      |
| New tenant (org)             | ≈ $0     | Pooled architecture; floor amortizes to noise beyond ~10 tenants            |
| Light user (platform-billed) | ≈ $12    | 30 runs/mo; ~$1 sandbox + ~$11 LLM                                          |
| Medium user                  | ≈ $92    | 170 runs/mo; ~$7 + ~$85 LLM — assumes working prompt caching (3–5× without) |
| Heavy user                   | ≈ $280   | 400 runs/mo; ~$20 + ~$260 LLM                                               |
| BYOK user                    | ≈ $7     | Sandbox only; plus BYOK fee revenue                                         |
| Hybrid-runner / BYOC user    | < $1     | Control plane only — nearly pure margin on any seat                         |

## 2. Direct competitors — autonomous coding agents (Aug 2026)

| Product                 | Individual                             | Team / org                                       | Billing unit                                                                         | Overage                             | BYOK                     |
| ----------------------- | -------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------ |
| Devin (Cognition)       | $0 / $20 / $200                        | $80 base + $40/seat                              | Subscription + refreshing quotas; ACUs enterprise-only since Jun 2026                | On-demand credits at API pricing    | No                       |
| Cursor                  | $20 / $60 / $200                       | $40/seat                                         | Seat + included usage pool at API prices                                             | API rates, in arrears               | Chat-only; agent blocked |
| GitHub Copilot          | $10 / $39 / $100 (new Max tier)        | $19–39/seat                                      | Seat + AI Credits ($0.01) at API token rates — replaced premium requests Jun 1, 2026 | Opt-in budgeted credits             | No                       |
| OpenAI Codex            | $8 / $20 / $100 / $200 (via ChatGPT)   | $20/seat                                         | Plan + rolling 5-hour/weekly windows; token-based credit burn (since Apr 2026)       | $40 per 1,000 credits               | Yes — plain API key      |
| Google Jules            | bundled: $19.99 AI Pro; $100–200 Ultra | —                                                | Task quotas/day (15 free / 100 Pro / 300 Ultra)                                      | None — hard limits                  | No                       |
| Factory (Droids)        | $20 / $100 / $200                      | Custom                                           | Subscription + rolling windows (5h/7d/30d)                                           | Prepaid credits, $10 min, no expiry | Yes, all plans           |
| Codegen                 | $9.99                                  | $199 flat/org                                    | Flat "unlimited runs" with soft model caps                                           | Escape via BYOK                     | Yes, no fee              |
| Claude Code (Anthropic) | $20 / $100 / $200                      | Premium seat $100–125; Ent. $20/seat + API usage | Seat + 5-hour session and weekly limits                                              | Extra usage at API rates            | De-facto (API-key mode)  |

## 3. Adjacent platforms — AI app builders

| Product                  | Tiers                    | Billing unit                                                                                          | Multi-user model                                                |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Replit                   | $0 / $20 / $100          | Effort-based checkpoints (≈$0.25 simple) + pay-as-you-go; Feb 2026 repricing was a margin-repair move | Workspace credits pooled; Pro covers 15 builders — not per-seat |
| Lovable                  | $0 / $25 / $50           | Credits per message (0.5–1.7); Cloud + AI usage billed separately                                     | Unlimited members, shared credit pool — explicitly seat-free    |
| Bolt.new                 | $0 / $25 / $30/seat      | Token buckets (10M/mo Pro)                                                                            | Pure per-seat; tokens not shared                                |
| v0 (Vercel)              | $0 / $30 / $100 per user | Dollar credits at published per-model token rates                                                     | Per-user sub; purchased credits shareable                       |
| Windsurf → Devin Desktop | $0 / $20 / $200          | Seat + refreshing quotas — credits abolished Mar 2026; overage at raw API rates                       | $40/seat Teams                                                  |
| Base44 (Wix)             | $20 → $200               | Dual credits: build messages + integration ops                                                        | No seat plan below Enterprise                                   |
| Emergent                 | $0 / $20 / $200          | Credits (100 / 750)                                                                                   | —                                                               |

**Sector unit economics (third-party):** Cursor ran negative gross margins through most of 2025, turning slightly positive only on large-enterprise accounts by Apr 2026 (in-house Composer model); Replit's gross margin was <10% in 2024 and swung −14%…36% in 2025 before usage repricing lifted it to ~20–30%; a Jun 2026 sector report puts inference at ~23% of revenue at scaling AI SaaS — gross margins ~30 points below the classic SaaS baseline. Cognition ≈ $492M ARR May 2026, profitability undisclosed.

## 4. Tenant vs. seat vs. usage

- **Tenant (costs ≈ $0):** a packaging lever, not cost recovery. Use an org base fee ($80–100, like Devin Teams; Codegen charges $199 flat) to cover the fixed floor while tenant count is small and to gate team features. Beyond ~10 tenants it's pure margin.
- **Seat (costs <$1–7):** nearly pure margin; the market bears $19–40/seat for teams, $100+ for premium seats. Hybrid-runner (BYO-compute) teams at $40/seat ≈ 97% margin — a structural advantage platform-billed competitors can't copy without cannibalizing their cloud.
- **Usage (92%+ of cost):** must be metered and passed through with margin — never unlimited (flat rate gets arbitraged 10× by heavy agents). Plan's 10–20% credit markup matches norms (Cursor $0.25/M even on BYOK; OpenRouter 5.5%; Devin $2+/ACU). Caching spread — bill standard rates, pay 0.1× cache reads — is the second margin.
- **Price ceiling:** medium user costs ~$92; Anthropic sells them Claude Max at $100. Platform-billed all-in anchors at ~$100–150 for a medium user → structurally thin at market anchors.

## 5. Break-even model

`profit(n) = contribution × n − fixed(n)`, fixed = $350/mo below 20 users, $450/mo at 20+ (midpoints of the plan's ranges). Mixed usage = 60% light / 30% medium / 10% heavy → avg variable cost ≈ $63/user.

| Pricing scenario                                                   | Contribution/user/mo | Break-even users | Profit/user after                          |
| ------------------------------------------------------------------ | -------------------- | ---------------- | ------------------------------------------ |
| P1 seats-only, $20 seat (users bring compute)                      | $19                  | 19 (14–24)       | ≈ $19                                      |
| P1 seats-only, $40 seat (hybrid-runner teams)                      | $39                  | 9 (7–12)         | ≈ $39                                      |
| Plan pricing — $30 seat + credits at cost +15%, mixed usage        | $39                  | 9 (6–12)         | $32–72 by profile ($44 medium)             |
| Cache-spread capture — same seat, ~40% effective usage margin      | $55–70               | 6 (4–8)          | $55–115                                    |
| Flat-tier copycat — $20/$100 tiers, no markup, no quota discipline | ≈ $10                | ≈ 45             | **−$180/mo per heavy user on a $100 tier** |

Two readings: break-even is a single-digit team under any pricing that charges a real seat and marks up usage; and the copycat row is the trap — the incumbents' flat ladder only works because refreshing quotas silently cap what a tier can consume. On flat tiers, the quota _is_ the margin.

## 6. Pricing implications for DMaker

1. **Ship the converged ladder, keep the plan's mechanics.** Free (local) → Pro ~$20–25 → Team $40/seat + $80–100 org minimum → Enterprise custom; all usage through the credit wallet at cost +10–20%, never bundled "unlimited".
2. **Lead with hybrid-runner seats** — P1's revenue model is also the best unit economics (~$39 of $40/seat is margin).
3. **Quota every flat tier** (refreshing windows, the Windsurf/Factory/Claude pattern) so heavy users hit overage, not your margin.
4. **Price BYOK like Cursor** (~$0.25/M or ~5%); a BYOK user costs $7 and is the natural upgrade from the free local edition.
5. **Verify caching end-to-end before promising margin** — without cache-read-dominated sessions the $92 medium user becomes $280–460 and every number above breaks. The plan's cache verification gate is a commercial requirement.

Caveats: plan cost figures are order-of-magnitude (P2 metering replaces them). Devin/Windsurf pricing cross-confirmed from third-party trackers (devin.ai rate-limited direct fetches); Lovable's official page renders prices client-side.

---

# Appendix A — Direct-competitor research (agent report, raw)

## 1. Cognition Devin

- **Restructured June 2026** — old ACU rate-card pricing (Core $20 entry + pay-as-you-go $2.25/ACU; Team $500/mo incl. 250 ACUs @ $2.00) replaced by flat subscription tiers.
- **Current tiers**: Free $0 (Devin Desktop only — tab completions/inline edits; no cloud agents); Pro $20/mo; Max $200/mo; Teams $80/mo minimum + $40/mo per full developer seat; Enterprise custom.
- **Billing unit**: hybrid — subscription + consumption quotas (daily/weekly refreshing, qualitative only). ACU ("agent effort": VM time + inference tokens + networking; ~15 min active execution) now the billing unit for **Enterprise contracts only**, custom per-ACU rate.
- **Overage**: self-serve buys "on-demand credits" consumed at API pricing; rate unpublished. Teams flex seats free, draw from shared on-demand credits.
- **BYOK**: none.
- Sources: devin.ai/pricing (429 to fetches; via tracker), usagepricing.com/blueprint/cognition.

## 2. Cursor

- **Tiers**: Hobby free; Pro $20/mo; Pro+ $60/mo; Ultra $200/mo (both third-party-confirmed); Teams $40/user/mo Standard + Premium team seat (5× agent limits); Enterprise custom (pooled usage, SCIM, audit logs).
- **Billing unit**: seat → included model-usage pool + on-demand usage billed in arrears at API rates. Trackers put included usage ≈ $20 (Pro) / $70 (Pro+) / $400 (Ultra) at API prices [third-party].
- **Included**: Pro adds cloud (background) agents, frontier models, MCP/skills/hooks; Pro+ = 3× Pro limits; Ultra = 20×. Cloud agents draw from the same pool.
- **Overage**: API rates, opt-in, in arrears; falls back to cheaper "auto" models when pool spent.
- **BYOK**: API keys unlock chat only; **Agent/Edit do not route through external keys**; requires a paid plan [third-party].
- Sources: cursor.com/pricing; flexprice.io, omniakey.com, apidog.com (third-party).

## 3. GitHub Copilot

- **Jun 1, 2026**: premium requests (PRUs) → **usage-based "GitHub AI Credits"** at published API token rates. Completions + Next Edit Suggestions stay unlimited on paid plans; agentic runs + premium models draw credits; code review consumes credits **and** Actions minutes. Annual subscribers keep PRU pricing until renewal.
- **Tiers**: Free $0; Pro $10/mo ($15 base credits + $5 flex); Pro+ $39/mo ($70 + $31); **Max $100/mo new 2026** ($200 + $100); Business $19/user/mo; Enterprise $39/user/mo (promos Jun–Aug 2026).
- **Billing unit**: seat + credit pool ($1 = 100 credits, $0.01 each).
- **Overage**: opt-in with dollar budget; org/cost-center/user budget caps; cutoff otherwise.
- **BYOK**: none.
- Sources: github.blog (usage-based billing announcement), github.com/features/copilot/plans.

## 4. OpenAI Codex

- **Via ChatGPT plans**: Free; Go $8/mo; Plus $20/mo; Pro $100/mo (5×) and $200/mo (20×); Business $20/user/mo; Enterprise custom.
- **Billing unit**: plan + rolling limits (5-hour window shared local/cloud + weekly caps) + credits. Per-model local-message allowances published (GPT-5.6 Sol/Terra/Luna tables).
- **Overage**: **$40 per 1,000 credits** ($0.04/credit); burn per 1M tokens: Sol 100 in/500 out, Terra 50/300, Luna 5/30; typical task ~5–30 credits. Apr 2026: switched to token-based credit billing.
- **BYOK/API**: yes — API key at straight token rates, no fixed limits. OpenAI's own estimate: ~$100–200/developer/mo for power users.
- Sources: developers.openai.com/codex/pricing, OpenAI credit-pack announcement.

## 5. Google Jules

- **No standalone price** — Free: 15 tasks/day, 3 concurrent; AI Pro ($19.99/mo): 100 tasks/day, 15 concurrent; AI Ultra: 300 tasks/day, 60 concurrent. Ultra restructured May 2026: $100/mo (new) and $200/mo (cut from $250) [third-party].
- **Billing unit**: per-seat subscription with task-count limits; **no overage purchase** on consumer plans.
- **BYOK**: none.
- Sources: jules.google/docs/usage-limits, one.google.com, digitalapplied.com (third-party).

## 6. Factory.ai (Droids)

- **Tiers**: Pro $20/mo; Plus $100/mo (~5× Pro); Max $200/mo (~10×); Business custom (≤150 seats, SSO/SCIM); Enterprise custom (dedicated compute, on-prem).
- **Billing unit**: subscription + rolling rate limits across 5-hour/7-day/30-day windows. Cloud & local background agents all tiers; Plus/Max add managed "Droid Computers".
- **Overage**: prepaid "Extra Usage" credits, $10 minimum, no expiration; free open-weight pool ("Droid Core") after standard usage.
- **BYOK**: yes, all plans.
- Sources: factory.ai/pricing, docs.factory.ai/pricing.

## 7. Codegen

- **Tiers** [all third-party — official page unrenderable]: Free 10 runs trial; Individual $9.99/mo — unlimited runs, cheaper models only (Haiku, Grok) on Codegen keys; Teams $199/mo — org GitHub access, ~$150/mo included usage; Enterprise custom (SOC 2, SSO).
- **Overage**: none published; escape hatch is BYOK.
- **BYOK**: yes on both paid tiers, no stated fee.
- Sources: coldiq.com, neura.market (third-party).

## 8. Anthropic Claude Code

- **Tiers**: Free (no Claude Code); Pro $20/mo ($17 annual); Max $100/mo (5×) / $200/mo (20×); Team: Standard seat $20–25 (no Claude Code) + **Premium seat $100/mo annual ($125 monthly)** — 5× usage, includes Claude Code, min 5 seats; Enterprise **$20/seat + usage at API rates**.
- **Billing unit**: seat with dual metering — 5-hour session limit + weekly all-model limit; tier sizes expressed only as multiples of Pro.
- **Overage**: extra usage purchasable at API rates on Max/Team/Enterprise. API-key mode = de-facto BYOK.
- **2026 note**: weekly Claude Code limits +50% on paid plans, extended through Aug 31, 2026 [third-party].
- Sources: claude.com/pricing; ccforeveryone.com, morphllm.com (third-party).

## Cross-cutting 2026 trend

GitHub (PRUs → AI Credits, Jun 1), Cognition (ACU rate card → flat tiers + API-priced credits, Jun), OpenAI (per-message → token-based credits, Apr) converged within three months on dollar-denominated, API-rate-pegged usage. Pattern: $0/$20/$100–200 individual ladder + ~$40–125/seat team tier + custom enterprise, overage at (or pegged to) raw API token rates.

---

# Appendix B — Adjacent-platform research (agent report, raw)

## 1. Replit

- **Tiers**: Starter $0 · Core $20/mo ($17 annual) · Pro $100/mo ($95 annual) · Enterprise custom. Feb 2026 overhaul: Core $25→$20, Pro introduced at $100.
- **Billing unit**: subscription per workspace + dollar-denominated credits. Pro covers up to 15 collaborators + 50 viewers on one subscription — pooled credits, not per-seat.
- **Included**: Core $20/mo credits, 2 parallel agents; Pro $100/mo credits, 10 parallel agents.
- **Overage**: effort-based Agent pricing (rolled out Jul 1, 2026): one request = one checkpoint priced by actual compute effort — simple ≤ ~$0.25. Credit packs or auto pay-as-you-go; **no default spend cap**. Credits don't roll over.
- Sources: replit.com/pricing, blog.replit.com/effort-based-pricing(+recap).

## 2. Lovable

- **Tiers**: Free $0 · Pro $25/mo · Business $50/mo · Enterprise custom (annual ≈17% off). Credit selector to buy bigger allowances without changing tier.
- **Billing unit**: credits per workspace — **not per seat** ("unlimited members on all plans"). Default Mode 0.50–1.70 credits/message.
- **Included**: Free 5 daily build credits (cap 30/mo) + 20 Cloud credits; Pro 100 monthly + rollover; Business adds SSO, security center.
- **Overage**: top-ups valid 12 months; separately bills **Cloud** (hosting/DB) and **AI** (inference in shipped apps) on usage.
- Sources: lovable.dev/pricing (client-side prices; confirmed via nocode.mba, softr.io).

## 3. Bolt.new (StackBlitz)

- **Tiers**: Free $0 · Pro $25/mo · Teams $30/member/mo · Enterprise custom.
- **Billing unit**: tokens per account; on Teams tokens **not shared** — pure per-seat buckets. Free 1M tokens/mo (300K/day); Pro 10M/mo; paid tokens valid up to 2 months.
- Sources: bolt.new/pricing.

## 4. v0 (Vercel)

- **Tiers**: Free $0 · Plus $30/user/mo · Business $100/user/mo · Enterprise custom.
- **Billing unit**: per-user sub + dollar credits burned at **published per-model token rates** (v0 Mini $0.20/$1.20 per M; v0 Pro $2/$10; v0 Max $5/$25; Max Fast $10/$50).
- **Included**: Free $5/mo credits, 7 messages/day; Plus/Business $30/user/mo credits + $2 daily login credits. Purchased credits last 1 year, shareable.
- Sources: v0.app/pricing, vercel.com/blog/updated-v0-pricing.

## 5. Windsurf → Devin Desktop (Cognition)

- Acquired Jul 2025 (~$82M ARR); rebranded Devin Desktop Jun 2, 2026. **Mar 19, 2026: credits abolished** → daily/weekly refreshing quotas.
- **Tiers**: Free $0 · Pro $20/mo (was $15) · Max $200/mo (new) · Teams $40/user/mo · Enterprise custom. Tab autocomplete unlimited; only Cascade agent/premium chat consume quota.
- **Overage**: billed at **raw model API rates** once quota hit — no credit packs.
- [All third-party — devin.ai rate-limited fetches.]

## 6. Base44 (Wix) + 2026 entrants

- **Base44**: Free $0 · Starter $16/$20 · Builder $40/$50 · Pro $80/$100 · Elite $160/$200 · Enterprise custom. **Dual credits**: message credits (build) + integration credits (live-app ops). Top-ups a 2026 addition. Acquired by Wix Jun 2025 (~$80M).
- **Emergent**: Free · Standard $20/mo (100 credits) · Pro $200/mo (750 credits); $70M Series B at $300M, Jan 2026.
- **Jules**: see Appendix A §5.
- **Factory AI**: see Appendix A §6.

## Unit-economics commentary (all third-party)

- **Cursor/Anysphere**: negative gross margins through most of 2025 (inference > subscription revenue); by Apr 2026 slight gross-margin profitability on large-enterprise accounts only (in-house Composer model, Nov 2025); individual/prosumer plans still loss-making. ~$2B run-rate claims.
- **"Token tax" sector report** (Jun 2026): inference ≈ 23% of revenue at scaling AI SaaS → gross margins ~30 points below classic SaaS.
- **Replit**: gross margin <10% in 2024, dipping negative in surges; 2025 swung −14%…36%; usage repricing lifted to ~20–30%. $253M ARR (+2,352% YoY per Sacra); Feb 2026 repricing read as margin repair.
- **Cognition/Devin**: ~$492M ARR May 2026 (13× YoY); profitability undisclosed. ACU = the sector's cleanest attempt to price full COGS (VM + inference + network) per unit of agent work.
- **Lovable**: $120M ARR Aug 2025 at $1.8B; splits build credits vs. metered Cloud/AI usage — pushing inference COGS into usage lines.
- **Pattern**: 2025–26 convergence away from flat seats toward (a) dollar credits + pay-as-you-go overflow, (b) raw-API-rate overage with quota rate-limiting, (c) normalized work units (ACUs). Seat-only pricing survives as the team/enterprise wrapper.

Key sources: replit.com/pricing · blog.replit.com/effort-based-pricing · lovable.dev/pricing · bolt.new/pricing · v0.app/pricing · vercel.com/blog/updated-v0-pricing · base44.com/pricing · cursor.com/pricing · github.blog (AI Credits) · github.com/features/copilot/plans · developers.openai.com/codex/pricing · jules.google/docs/usage-limits · factory.ai/pricing · claude.com/pricing · usagepricing.com (Cognition/Windsurf) · valueaddvc.com (Cognition ARR) · pitchbook.com (Cursor) · techtimes.com (token tax) · sacra.com (Replit)
