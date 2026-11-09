# Total Recall — Bilateral Credit on Walrus Memory

Two parties (**Alice** and **Bob**) share a single [Walrus Memory](https://memory.walrus.xyz)
namespace. Every interaction between them — repayments, defaults, advances, fulfillments —
is written into that namespace as a plain sentence. The capital each party can borrow is
**not stored anywhere**. On every request the server recalls the full history from Walrus,
re-derives both directions of the bilateral credit line, and only then decides:

`ALLOW` · `REDUCE` · `BLOCK`

An agent rail (Tatum's Sui gateway) will release a tiny **0.01 SUI** transfer **only** when
the reconstructed policy allows it. No database. No cache. No stored limit. The same blobs
always produce the same number — across restarts, across machines, across sessions.

## Stack

| Layer | Tech |
| --- | --- |
| UI | React + TypeScript + Vite (middleware mode), Tailwind, Tatum design tokens |
| API | Express 4, `server/index.mjs` entry, port `PORT` (default 3000) |
| Memory | `@mysten-incubation/memwal` (`MemWal` live / `MemWalMock` in-process) |
| Chain | `@mysten/sui` + Tatum Sui JSON-RPC gateway |

Everything blockchain/memory related lives **server-side**. The browser only talks to `/api/*`.

## How credit is computed

A limit is the lender's exposure to one specific borrower, so only the *borrower's own*
behaviour moves it. Formula (`server/credit/engine.mjs`):

```
base 10
+ min(amount × 0.5, 8)      per successful repayment by the borrower
− 15                        per default / failed repayment by the borrower
− amount × 0.2              per successful advance drawn to the borrower
+ 2                         per borrower success (repayment | fulfillment) in the last 7 days
floor 0, round to 1 decimal
```

Memory-off mode bypasses history entirely and returns the base limit (10) with no evidence.
The UI shows both worlds side by side in every Decision report.

Memory format (`server/credit/schema.mjs`):

```
[CREDIT] <iso-ts> | from:x to:y | type:<repayment|default|advance|fulfillment|request> | amount:<n> | result:<success|failed|pending> | note:<text>
```

State fingerprint = `sha256` over sorted `blobId\ntext` pairs (first 16 hex chars exposed in the UI).
Compare it across a backend restart: Walrus is durable, the limit is not — so the fingerprint is the proof.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

With no credentials the app boots in **mock mode**: an in-process `MemWalMock` pre-seeded with
the 15 demo memories. The product works end-to-end (dashboard, decisions, ledger, write-outcome)
but memory is **not durable** in mock mode and the restart-fingerprint claim does not apply.

### Environment variables

Copy `.env.example` to `.env` (git-ignored) or export in the shell.

| Var | Required for | Notes |
| --- | --- | --- |
| `MEMWAL_ACCOUNT_ID` | live memory | One shared account for both parties |
| `MEMWAL_PRIVATE_KEY` | live memory | Delegate key (signs Walrus writes) |
| `MEMWAL_MODE` | — | `auto` (default) · `mock` · `live` |
| `MEMWAL_NAMESPACE` | — | Default `credit-demo` |
| `MEMWAL_SERVER_URL` | — | Default `https://relayer.memory.walrus.xyz` |
| `MEMWAL_RECALL_LIMIT` | — | Default `100` |
| `TATUM_API_KEY` | payment dry-run / execute | `x-api-key` for the Tatum gateway |
| `SUI_AGENT_PRIVATE_KEY` | payment | Hex64 or `suiprivkey1…` (agent wallet) |
| `SUI_NETWORK` | — | Default `mainnet` |
| `PAYMENT_RECIPIENT` | payment | Target address for the 0.01 transfer |
| `PAYMENT_AMOUNT` | — | Default `0.01` (SUI) |
| `PAYMENT_COIN_TYPE` / `PAYMENT_COIN_DECIMALS` / `PAYMENT_SYMBOL` | — | Defaults `0x2::sui::SUI` / 9 / `SUI` |
| `PAYMENT_GAS_BUDGET_MIST` | — | Default `10000000` |
| `PORT` | — | Default `3000` |

### Go live with Walrus Memory

```bash
export MEMWAL_ACCOUNT_ID=…
export MEMWAL_PRIVATE_KEY=…
npm run dev
# then, once, to populate real blob IDs:
curl -X POST localhost:3000/api/credit/seed -H 'content-type: application/json' -d '{}'
```

`/api/credit/seed` is idempotent (dedupe + idempotency keys + text match), safe to re-run.
Restart the backend and hit `POST /api/credit/verify` with the stored fingerprint to prove
the rebuilt state is bit-identical.

### Go live with the Tatum payment rail

Set `TATUM_API_KEY`, `SUI_AGENT_PRIVATE_KEY` (and optionally `PAYMENT_RECIPIENT`). Then:

1. Create a request that is in policy (e.g. Alice → Bob, 25 SUI).
2. **Authorize with Tatum** — the server gates on the Walrus-rebuilt limit, then runs
   `sui_dryRunTransactionBlock` via `https://sui-mainnet.gateway.tatum.io`.
3. If the dry-run succeeds, **Execute** sends a real 0.01 SUI transfer and writes an
   `advance` memory back to Walrus so the next decision reflects it.

Without `PAYMENT_RECIPIENT`, a dry-run still works (recipient falls back to the sender).
Payment is **403** when the reconstructed limit is below the payment amount or the verdict
is not `ALLOW`; **503** when the key wallet is unconfigured.

## Screens

| Tab | What it proves |
| --- | --- |
| **Overview** | Both bilateral limits side-by-side, memory on/off switch, fingerprint, "rebuilt from Walrus" badge, evidence list, payment-rail status |
| **Request credit** | Direction, amount, purpose → server recalls, recomputes, answers |
| **Decision** | ALLOW/REDUCE/BLOCK hero, limit vs requested, memory on/off comparison, evidence with blob IDs, write-outcome buttons (repayment/default/advance → limit refreshes instantly), Tatum payment rail |
| **Memory ledger** | Every recalled memory, filterable by type, blob IDs, raw `[CREDIT]` lines |

## Demo script

1. Open **Overview** — point at `STATE FINGERPRINT` and the "Rebuilt from N memories" labels.
2. Toggle **Memory off** — both limits collapse to 10.0; toggle back on — they return.
3. **Request credit**: Alice → Bob, 25.00 → ALLOW (against memory-on policy).
4. **Request credit**: Bob → Alice, 25.00 → BLOCK (Alice's record includes one default + drawdowns).
5. In the Decision screen, click **Write the outcome → Default** and watch Bob → Alice drop further
   and Alice → Bob unchanged.(See note below on re-seeding after writes.)
6. **Authorize with Tatum** on the ALLOW case; if keys are configured, **Execute** sends 0.01 SUI
   and a new advance memory appears in the ledger.
7. Restart `npm run dev` and compare `/api/credit/state` fingerprint — identical in live mode.
8. Open **Memory ledger** and filter by type to show the raw Walrus texts + blob IDs.

> Note: writes from the UI accumulate in the shared namespace. In mock mode,
> `POST /api/credit/reset-mock` restores the 15-seed state; in live mode, either use a fresh
> namespace (`MEMWAL_NAMESPACE=credit-demo-2`) or accept the extra evidence as part of the demo.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/credit/state?memory=on\|off` | Limits, directions, evidence, fingerprint |
| `POST /api/credit/evaluate` | `{direction, amount, purpose, memory}` → Decision |
| `GET /api/credit/history?type=all\|repayment\|…` | Ledger (all or last 20 with type filter) |
| `POST /api/credit/record` | Write a `repayment\|default\|advance\|fulfillment\|request` memory |
| `POST /api/credit/seed` | Seed the 15 demo memories (idempotent) |
| `POST /api/credit/verify` | `{fingerprint}` → `matches` boolean |
| `POST /api/credit/reset-mock` | mock mode only — restore seed state |
| `GET /api/credit/status` | Memory mode + Tatum + payment readiness |
| `GET /api/credit/directions` | Direction labels |
| `GET /api/payment/config` · `GET /api/payment/balance` | Payment rail readiness |
| `POST /api/payment/authorize` | Gate → authorization / dry-run (403 if not in policy) |
| `POST /api/payment/execute` | Gate → real 0.01 SUI transfer + writes `advance` memory |

## Verified locally (mock mode)

- `GET /api/credit/state` → 15 memories, `alice_to_bob=39.0`, `bob_to_alice=1.5`, fingerprint `5ebca0738a427f66…`
- evaluate `bob_to_alice @ 25` → `BLOCK`; payment authorize → `403`
- memory off → both limits `10.0`, verdict `BLOCK` @ 25
- record repayment → `39.0 → 43.5`; memory off ↔ on decision re-evaluates in place
- `reset-mock` → returns to `39.0 / 15` and the same fingerprint

## Limitations & honest notes

- **Mock mode is not persistent** and its blob IDs are `mockblob…` hashes — the restart proof only holds with live Walrus credentials.
- Sui JSON-RPC on Tatum mainnet is on the deprecation path; if `sui_*` methods start returning errors, switch `SUI_NETWORK`/client to Tatum's gRPC endpoints.
- Seed timestamps are generated relative to seed time so the 7-day recency bonus stays meaningful; amounts in scratch demos feed the recency window unchanged.
- No authentication on `/api` — this is a hackathon demo, not a multi-tenant service.
