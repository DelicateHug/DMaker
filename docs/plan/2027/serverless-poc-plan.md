# DMaker → SaaS: Serverless POC Plan (pre-revenue)

> **Companion to [`saas-on-aws-architecture-plan.md`](./saas-on-aws-architecture-plan.md), which is unchanged and remains the target.** This document is the cheapest correct way to stand up _the same architecture_ before the market is proven: Lambda-only compute, no high availability, **~$15–25/mo fixed**. It also states the explicit triggers that end it.
>
> Planning-only. No code changes. Written 2026-08-27.

---

## Why this exists

The production plan's fixed floor is **$250–450/mo**, paid identically at 1 user and at 20 (deployment map). At one medium-usage user that's $340–540/mo against $0 revenue, and roughly **75–90% of it is redundancy or idle capacity**, not work being done:

| Production line item                          | ~$/mo       | What you are actually buying                                        |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| Aurora PostgreSQL Serverless v2, **Multi-AZ** | $90+        | Automatic failover; a standby ACU set doing nothing                 |
| 8–9 always-on Fargate services × **2 AZs**    | $120–250    | A warm process per service per AZ, whether or not a request arrives |
| NAT Gateway                                   | $32 + data  | Private-subnet egress for those always-on tasks                     |
| VPC interface endpoints (ECR/CW/Secrets/STS)  | ~$22/AZ-set | Keeping that egress off NAT                                         |
| ElastiCache Valkey                            | $15+        | A cache with no cache pressure at 1 user                            |
| ALB                                           | ~$16–22     | A load balancer in front of one instance of everything              |

The floor is not the cost of running DMaker. **It is the cost of never being down.** A pre-revenue POC has no uptime obligation, no failover story to sell, and one user who can be told "it takes 15 seconds to wake up." So the POC buys the opposite trade, deliberately and reversibly:

> **Availability and latency are spent. The data model, the tenancy boundary, and the interfaces are not.**

That second clause is the whole discipline of this document. A cheap POC that skips `org_id` or forks the run-event contract is not cheap — it is a rewrite with a discount.

---

## The one hard constraint

**Lambda's maximum execution time is 15 minutes. A DMaker run is 20–30 minutes of agent work.** So "Lambda only" cannot mean "the agent runs in Lambda." Everything else in the control plane fits Lambda comfortably; the execution plane does not, and no amount of tuning changes that.

There are exactly two ways out, and the POC takes the first:

1. **Hybrid runner — "DMaker Connect" (D3).** Runs execute on the user's own machine, dialling home over the same event contract. Compute cost to us: **$0**. Personal Claude/ChatGPT subscriptions stay legal (they cannot power hosted execution — D2). This is not a POC hack; it is verbatim the plan's own **P1: "earliest sellable… cloud execution not required yet — users bring compute."**
2. **Lambda MicroVMs (June 2026)** — 8h max, suspend/resume, snapshots, explicitly marketed for AI coding sandboxes. The AWS-native answer, and already D6's designated POC. But the appendix flags it **young, ~4 regions, pricing third-party-read and unverified (~$0.10/vCPU-hr)**. It stays an _optional_ POC-2 experiment, not the POC's dependency.

Deferring cloud execution deletes not just the sandbox bill but **four whole services**: the LLM gateway (LiteLLM), the git proxy, the egress proxy, and the sandbox ECS cluster. Those exist to contain untrusted code we are running on our own hardware. If we are not running it, they are not yet load-bearing — and that is the single largest reason the POC is 20× cheaper rather than 2× cheaper.

---

## Target POC architecture

```
                    ┌────────────── CONTROL PLANE (all serverless, no always-on compute) ──────────────┐
 Browser / Electron │                                                                                   │
 (React UI, xterm)  │  Route53 → CloudFront ──→ S3 (static React bundle)          [CF free tier: $0]    │
        │           │                                                                                   │
        ├── HTTPS ──┼─→ API Gateway HTTP API ──→ λ api        (Express 5 as-is, via Lambda Web Adapter) │
        │           │                             ├─ Better Auth (sessions in Postgres)                 │
        │           │                             └─ RLS-scoped: SET LOCAL app.org_id per txn           │
        │           │                                                                                   │
        └── WSS ────┼─→ API Gateway WebSocket ──→ λ ws-connect / λ ws-message                           │
                    │        ▲                     └─ fan-out via @connections POST (replaces Redis)    │
                    │        │                                                                          │
                    │  GitHub webhook → λ github-svc → SQS → λ dispatcher (run FSM transitions)         │
                    │  EventBridge Scheduler (5-min tick) → λ reaper (watchdog, TTL, stuck runs)        │
                    │                                                                                   │
                    │  Aurora Serverless v2  · DynamoDB   · S3        · SSM Param  · KMS  · SES  · SQS  │
                    │  min 0 ACU, SINGLE-AZ    ws-conns,    artifacts,   Store       (1 CMK)            │
                    │  via RDS Data API        seq, locks   transcripts  (free)                         │
                    │  ⇒ no VPC, no NAT, no interface endpoints, $0 when idle                           │
                    └──────────────────────────────┬────────────────────────────────────────────────────┘
                                                   │ egress-only dial-home (same WS API, same contract)
                                     ┌─────────────▼──────────────┐
                                     │ EXECUTION = DMaker Connect │   ← the user's own machine
                                     │ device-code enrolled       │      their tools, their logins,
                                     │ owner-only dispatch        │      their subscription. $0 to us.
                                     └────────────────────────────┘
                                     ┌────────────────────────────┐
                                     │ (POC-2, optional)          │   ← behind SandboxProvider,
                                     │ λ MicroVM sandbox, 1 tenant│      single-tenant, BYOK only
                                     └────────────────────────────┘
```

### The four substitutions that do the work

| Production                                                    | POC                                                                                                                                                              | Why it's safe _for now_                                                                                                                                                               | What it costs us                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 8–9 always-on Fargate services behind an ALB                  | **One Lambda per concern behind API Gateway** — `api` (the existing Express app, unmodified, under AWS Lambda Web Adapter), `github-svc`, `dispatcher`, `reaper` | Idle traffic is the POC's normal state. Paying per-request instead of per-second-of-idle is strictly better below ~2M requests/mo                                                     | ~1s cold start on the first request after idle                                           |
| `realtime-gw` (Fargate WS server) + ElastiCache Redis pub/sub | **API Gateway WebSocket API** + `@connections` POST for fan-out; connection registry in DynamoDB                                                                 | Redis pub/sub exists to get an event from the instance that produced it to the instance holding the socket. API GW holds the socket itself, so the problem doesn't arise at one shard | 10-min idle timeout and a **2h hard connection cap** — see _What is deliberately broken_ |
| Redis replay ring + rate limits + locks                       | **Postgres `run_events` (already the durable tier) + DynamoDB counters**; API GW throttling for rate limits                                                      | The plan already says "durability is the DB's job, RAM only buys resume latency." At POC volume, buy nothing                                                                          | Resume-after-reconnect does a DB read instead of a RAM read                              |
| Aurora Multi-AZ + NAT + VPC endpoints + Lambdas-in-VPC        | **Aurora Serverless v2, min 0 ACU, single-AZ, reached over the RDS Data API** — so Lambdas live outside any VPC                                                  | No VPC ⇒ no NAT ($32), no interface endpoints ($22/AZ-set), no ENI cold-start penalty. Single-AZ ⇒ half the ACUs. Scale-to-zero ⇒ $0 while nobody is using it                         | An AZ failure is an outage; a resume from zero is ~15s                                   |

**Everything else in the stack is multi-AZ anyway and costs the same either way.** Lambda, API Gateway, S3, DynamoDB, SQS, and SES are regional services with AZ redundancy included. This is worth stating plainly: _going serverless does not actually cost you most of your availability._ The only genuine single-AZ decision in this whole document is Aurora. "No availability" is mostly a description of the database, and of the fact that nobody is on call.

---

## Cost model

| Line                                            | Assumption                                                                            | $/mo            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | --------------- |
| Lambda                                          | Well inside the 1M-request / 400k GB-s perpetual free tier                            | **$0–2**        |
| API Gateway HTTP API                            | ~500k requests @ $1.00/M                                                              | **$0.50**       |
| API Gateway WebSocket                           | 170 runs × 25 min × ~5 events/s ≈ 1.3M msgs @ $1.00/M, + connection-minutes @ $0.25/M | **$1–3**        |
| **Aurora Serverless v2** (min 0 ACU, single-AZ) | 0.5 ACU × $0.12/ACU-hr × **~4 active hr/day** = $7.20, + ~5 GB storage                | **$8**          |
| RDS Data API                                    | $0.35/M requests                                                                      | **~$0**         |
| DynamoDB (on-demand)                            | WS connections, seq counters, locks                                                   | **$0–1**        |
| S3                                              | Artifacts, transcripts, UI bundle — a few GB                                          | **$0.50**       |
| CloudFront                                      | Perpetual free tier: 1 TB out + 10M requests                                          | **$0**          |
| Route53                                         | One hosted zone                                                                       | **$0.50**       |
| SES                                             | Magic links, verification @ $0.10/1,000                                               | **~$0**         |
| KMS                                             | 1 customer-managed key (or $0 on AWS-managed)                                         | **$1**          |
| SSM Parameter Store (standard)                  | Replaces Secrets Manager's $0.40/secret                                               | **$0**          |
| SQS + EventBridge Scheduler                     | Inside free tier                                                                      | **~$0**         |
| CloudWatch Logs                                 | 7-day retention, sampled                                                              | **$1–3**        |
| NAT Gateway / VPC endpoints / ALB / ElastiCache | **Eliminated**                                                                        | **$0**          |
|                                                 |                                                                                       |                 |
| **Fixed total**                                 |                                                                                       | **~$13–20**     |
| **Variable (hybrid runner)**                    | User's machine, user's subscription                                                   | **$0**          |
| **POC total, 1 user**                           | vs **$340–540** in production                                                         | **≈ $15–25/mo** |

### The one trap that doubles this bill

**Do not add a keep-warm ping.** The obvious fix for cold starts is a 5-minute EventBridge tick against `λ api`. It costs ~$0.30/mo in Lambda — and it keeps Aurora permanently awake, taking it from $8 to `0.5 ACU × $0.12 × 730h =` **$43.80/mo**. A $0.30 optimisation buys a $36 regression. If cold start becomes intolerable, use provisioned concurrency on `λ api` _only_ and leave the database alone, or accept the 15s and move on.

### If cloud execution is added anyway (POC-2)

Sandbox cost only, using the appendix's unverified Lambda MicroVM read of ~$0.10/vCPU-hr: 170 runs × 25 min ≈ 71 vCPU-hr ≈ **$7/mo**, less suspended time. LLM tokens are BYOK in POC-2 — the customer's key, the customer's bill, zero pass-through and zero credit-wallet machinery. Total still under **$35/mo**.

---

## What is deliberately broken

Naming these is the point. Each is a decision with a cost, not an oversight.

| Broken                                                 | Consequence                                                                                 | Who feels it                                                                                                | Stops being acceptable when                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No Multi-AZ**                                        | An AZ event takes the database — and therefore the product — down until AWS restores it     | Everyone, rarely                                                                                            | First paying customer, or any uptime commitment in writing                                                                                                                                                                                                                                   |
| **Aurora scale-to-zero resume**                        | ~15s on the first request after an idle window                                              | The one user, several times a day                                                                           | Two humans use it in the same hour — at which point it stops pausing anyway, so the cost saving evaporates before the annoyance does                                                                                                                                                         |
| **API GW WebSocket: 10-min idle timeout, 2h hard cap** | A quiet stretch mid-run drops the socket; any session past 2h drops unconditionally         | Long runs, long terminal sessions                                                                           | Never — this one must be _engineered around_, not tolerated. **Client heartbeats every ~5 min; reconnect resumes from `lastSeq` against `run_events`; terminals use tmux reattach (already specified in the plan).** Build it in POC-1, because production wants reconnect-resume regardless |
| **No egress proxy, no git proxy**                      | The prompt-injection exfiltration mitigations do not exist                                  | Nobody, _while execution is on the user's own machine_ — that is exactly today's local-product threat model | **The moment a second tenant's private repo runs on our compute.** Hard gate: POC-2 is single-tenant, own-repo, BYOK. No exceptions                                                                                                                                                          |
| **No LLM gateway**                                     | No budgets, no metering, no cache-savings visibility, no credit wallet                      | Us, commercially                                                                                            | The first platform-billed (non-BYOK) user. Credits cannot ship without it                                                                                                                                                                                                                    |
| **No Redis**                                           | Rate limits are coarse (API GW throttling); replay is a DB read                             | Nobody at this scale                                                                                        | ~5 concurrent runs, or WS fan-out becomes hot                                                                                                                                                                                                                                                |
| **Scheduler is tick-driven, not resident**             | FSM transitions that nothing else triggers wait up to 5 min                                 | Auto-mode pacing                                                                                            | Mitigated cheaply: the SQS-triggered Lambda handles _immediate_ transitions; the EventBridge tick is only the reaper/watchdog for stuck states                                                                                                                                               |
| **No WAF**                                             | The one unauthenticated route (GitHub webhook) is protected by signature verification alone | Nobody until we're discoverable                                                                             | Public beta. `X-Hub-Signature-256` verification is mandatory from day one either way                                                                                                                                                                                                         |
| **Nobody is on call**                                  | Recovery time is "when Dylan wakes up"                                                      | Dylan                                                                                                       | Self-evident                                                                                                                                                                                                                                                                                 |

---

## The reversibility contract

The POC is allowed to be cheap **only where the cheapness sits behind an interface**. These cost nothing now and are brutal to retrofit, so they ship at full production fidelity from the first commit:

| Must be production-grade in the POC                                                        | Why it cannot wait                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`org_id` on every row + RLS policies + `SET LOCAL app.org_id` inside every transaction** | Retrofitting a tenant key into a live schema is a migration of every table and every query simultaneously. It is free today and it is the entire tenancy boundary |
| **The tenant directory (org → shard/connection)**                                          | The plan already says it: "v1 has one shard — retrofit is the expensive part, the lookup is free"                                                                 |
| **Storage-driver interfaces + Postgres drivers (P0)**                                      | Unchanged from the production plan. This is the work that keeps the local edition and the SaaS one product                                                        |
| **`SandboxProvider` interface**                                                            | The whole justification for Fargate-vs-MicroVM-vs-E2B being a late decision. The POC having no implementation behind it is fine; not having the seam is not       |
| **`GitHostProvider` abstraction**                                                          | Same reason, and GitLab (D11) is a P2 commitment                                                                                                                  |
| **The run FSM + the 60-event-type contract + per-event seq numbers**                       | The UI, the runner, and the replay/resume design all key on it. Forking it for the POC forks the client                                                           |
| **Better Auth + orgs from the first sign-in**                                              | Users and orgs live in our DB. There is no version of this that gets easier later                                                                                 |
| **Envelope-encrypted credentials + `audit_log`**                                           | Day-1 items in the security roadmap. Both are cheap to add and impossible to backfill honestly                                                                    |

Conversely, these are explicitly _permitted_ to be POC-grade, because each is a swap behind one of the above: Multi-AZ, Redis, the LLM gateway, the git/egress proxies, the sandbox implementation, WAF, warm pools, provisioned concurrency, and the admin console.

---

## POC phases

**POC-0 — Prove the four cheap seams (~2 weeks, no product work).** Each is a load-bearing cost assumption above, and each is a half-day to falsify:

1. **Aurora Serverless v2 at min 0 ACU + RDS Data API + RLS.** Confirm `BeginTransaction` → `SET LOCAL app.org_id` → query → `Commit` enforces the policy over the Data API, and measure the real resume latency from paused. _If `SET LOCAL` doesn't hold across Data API calls in one transaction, the entire no-VPC saving collapses and we fall back to Lambda-in-VPC with interface endpoints (+$22/mo) — far better to know that in week one than in month three._
2. **Express 5 under Lambda Web Adapter.** The existing `apps/server` app, one Lambda, behind an HTTP API. Confirms the POC is a deployment change rather than a rewrite.
3. **API Gateway WebSocket reconnect-resume.** Kill the socket mid-run; the client reconnects and replays from `lastSeq` with no gap and no duplicate. Exercise the 2h cap deliberately.
4. **Cost telemetry.** A budget alarm at $40 and a daily Cost Explorer glance, from day one. The failure mode of every serverless POC is a bill nobody read.

**POC-1 — Control plane live + hybrid runner (~4 weeks; this is sellable).** Deploy the stack above; sign-in (Google/Microsoft/email via SES); repo connect via the GitHub App; **runner v2 = dial-home job protocol + the runner-RPC surface** (worktree/git/diffs/attachments/logs — the plan is explicit that this RPC surface, not the transport flip, is the bulk of the work); owner-only dispatch. Cloud execution absent by design. Revenue model = seats.

**POC-2 — _Optional_: one Lambda MicroVM sandbox.** Single-tenant, own repo, BYOK, behind `SandboxProvider`. Its purpose is not to serve customers — it is to answer D6's three open questions before production commits to them: **does suspend/resume actually work, is the ~$0.10/vCPU-hr read real, and are the regions there?** Answering that for ~$7/mo beats answering it inside a production migration.

---

## Graduation triggers

The POC ends — and the production plan resumes as written — at the **first** of these, whichever arrives:

| Trigger                                         | Why it's the line                                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Second paying tenant**                        | Pooled multi-tenancy with real money on it needs Multi-AZ, WAF, and someone on call                                                                                     |
| **Any customer repo on our compute**            | Egress proxy + git proxy + no-task-role become mandatory the same day (invariant #1, D8 ruleset). Non-negotiable                                                        |
| **First platform-billed (non-BYOK) user**       | Requires the LLM gateway, budgets, metering, and the credit wallet                                                                                                      |
| **≥5 concurrent runs, or Aurora stops pausing** | The cost saving has already evaporated; provisioned capacity is now cheaper _and_ faster                                                                                |
| **WebSocket spend > ~$20/mo**                   | Per-message billing has crossed a resident WS gateway's cost. Chatty agent output (100–200ms event cadence) makes this the most likely cost surprise in the whole model |
| **Any written uptime commitment**               | An SLA you cannot survive an AZ event for is a liability, not a sales asset                                                                                             |

Because the reversibility contract holds, graduating is a **deployment change plus four service builds** (LLM gateway, git proxy, egress proxy, sandbox implementation) — not a re-architecture. That is the return on the discipline.

---

## Summary

|                                          | Production plan                       | Serverless POC                        |
| ---------------------------------------- | ------------------------------------- | ------------------------------------- |
| Fixed floor                              | $250–450/mo                           | **~$13–20/mo**                        |
| 1 medium user, all-in                    | $340–540/mo                           | **~$15–25/mo**                        |
| Compute                                  | 8–9 always-on Fargate services × 2 AZ | Lambda + API Gateway, per-request     |
| Database                                 | Aurora Multi-AZ                       | Aurora single-AZ, min 0 ACU, Data API |
| Execution                                | Fargate microVM per run               | User's own machine (DMaker Connect)   |
| Availability                             | Multi-AZ, autoscaled, on-call         | Single-AZ, cold-start, best-effort    |
| Tenancy, RLS, interfaces, event contract | Full                                  | **Identical — this is the point**     |

The saving is ~95%, and it is bought almost entirely with two things a pre-revenue product does not need: **redundancy, and compute that is warm before anyone asks for it.**
