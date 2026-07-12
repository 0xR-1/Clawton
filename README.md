# Clawton

**A policy enforcement layer between an AI trading agent and real-money execution, enforced onchain.**

## Summary

Clawton sits between an AI agent (OpenClaw) and a trading exchange (Binance). Every trade the agent proposes is evaluated against an onchain policy — spending limits, token whitelists, and a hard block on withdrawals — before it is allowed to execute. Both the approval and the denial of every trade are permanently recorded onchain, so the system's behavior is independently verifiable rather than something the agent merely reports.

The project is built on Newton Protocol for policy evaluation and attestation, deployed on Ethereum Sepolia, with trade execution currently running against Binance Spot Testnet.

## The problem

Connecting an AI agent to a trading account gives that agent real execution power. A reasoning error, a bad prompt, a prompt-injection attempt, or a plain bug can turn into financial loss with nothing standing between the agent's decision and the trade happening. Most agent-to-exchange integrations trust the agent's own judgment. Clawton does not.

## Design principle

**The policy decides, not the agent.** The agent proposes a trade in natural language; a separate, independent guard process evaluates that proposal against a policy that is deployed onchain and cannot be altered by the agent at runtime. If the check fails, the trade is not sent to the exchange, no matter what the agent says or how it explains the result. Every check — pass or fail — is logged both locally and onchain, so the actual decision history can be audited by a third party without depending on the agent's account of what happened.

## Architecture

User (natural language command)
│
▼
OpenClaw agent
│
▼
Clawton Guard (Node.js)
│
▼
Newton Protocol policy check (Rego, evaluated against an onchain policy contract)
│
┌────┴─────┐
▼          ▼
ALLOWED     DENIED
│          │
▼          ▼
Binance     Blocked before
execution   reaching Binance
│          │
└────┬─────┘
▼
Decision recorded onchain
(Sepolia, permanent, verifiable)

## Deployed contracts (Ethereum Sepolia)

| Contract | Address | Etherscan |
|---|---|---|
| Policy Data | `0x5FC74321B2391e1f1a1aAbc7AD5F399b307bb1d7` | [View](https://sepolia.etherscan.io/address/0x5FC74321B2391e1f1a1aAbc7AD5F399b307bb1d7) |
| Policy | `0x34F575090849668656833Df7414F34b66b91FD24` | [View](https://sepolia.etherscan.io/address/0x34F575090849668656833Df7414F34b66b91FD24) |
| NewtonPolicyWallet | `0xF8593292b751c9874D9B6fa180CD452efFa09e4D` | [View](https://sepolia.etherscan.io/address/0xF8593292b751c9874D9B6fa180CD452efFa09e4D) |
| ClawtonTradeLog (verified) | `0x86b8ED1803c99768D67a81ed1d1a1F9f8f517269` | [View](https://sepolia.etherscan.io/address/0x86b8ED1803c99768D67a81ed1d1a1F9f8f517269) |

Example onchain decisions, permanently recorded:
- [ALLOWED trade](https://sepolia.etherscan.io/tx/0x3ad2c92b546e1fed21c34c42c5b4b280bcb08d46f2fe5a14c242fe28c113bdcd#eventlog) — 0.001 BTC within the spend cap, executed and logged.
- [DENIED trade](https://sepolia.etherscan.io/tx/0xf17fa9138f24ce214df2f84f63e9d62ef7381060620c6379c64eb1a3ef344a1b#eventlog) — an attempt 50x over the spend cap, blocked and logged.

## Components

| Component | Description |
|---|---|
| Rego policy | The policy logic: spend cap, token whitelist, withdrawal block, admin override |
| Policy Data contract | Onchain WASM data provider backing the policy evaluation |
| Policy contract | The deployed Rego policy logic itself |
| NewtonPolicyWallet | Smart wallet contract; binds task manager, policy, and owner atomically at deployment, in a single transaction |
| ClawtonTradeLog | Lightweight onchain event log recording every ALLOWED and DENIED decision with its parameters and timestamp |
| Clawton Guard | Node.js bridge: evaluates a trade intent against the deployed policy, executes on Binance only if allowed, and writes the outcome onchain either way |
| Agent skill definition | Instructs the OpenClaw agent to route every trade request through the guard rather than calling the exchange directly, and to report only what the guard's output actually says |

## Policy rules (current)

1. **Spend cap** — no single trade may exceed a configured maximum value.
2. **Token whitelist** — only pre-approved trading pairs are permitted.
3. **No withdrawals** — any withdrawal-type action is unconditionally denied.
4. **Admin override** — a designated address can bypass the checks above for manual intervention.

The policy is evaluated as fail-closed: any undefined or unrecognized condition results in denial, not approval.

## Onchain verifiability

Every trade decision — whether it results in execution or rejection — is written to a dedicated event log contract on Sepolia. Anyone can inspect the chain directly and see, for a given transaction: the verdict, the trading pair, the side, the quantity, and the context that produced that verdict, with an immutable timestamp. This is separate from the trade execution itself (which happens on the exchange, since exchange order books are not onchain); it is an onchain attestation that the check happened and what it concluded.

## Tech stack

- **Newton Protocol** — Rego-based policy evaluation and WASM data providers, deployed as onchain contracts
- **Foundry** — smart contract development and deployment
- **OpenClaw** — the agent runtime; model-agnostic, currently running an NVIDIA-hosted agentic model
- **Binance Spot Testnet / binance-cli** — trade execution
- **Node.js** — the guard process tying policy evaluation, execution, and onchain logging together

## What's been verified end-to-end

- A trade within policy limits: evaluated, approved, executed on Binance, filled, and logged onchain.
- A trade far outside policy limits (50x the spend cap): evaluated, denied, never reached the exchange, and the denial itself logged onchain.
- The agent, prompted in plain language for both cases, correctly reported the guard's actual output rather than an invented explanation — this was specifically tested and hardened after an earlier failure mode where the agent produced a plausible-sounding but fabricated justification for a result it hadn't actually observed.

## Known limitations (current, honest state)

- **Not audited.** This is an active MVP. It has not undergone any professional security review and should not be used with real funds in its current form.
- **Spend value estimation.** The ETH-equivalent value used for the spend-cap check is currently supplied by the agent's own estimate of the trade, not computed independently from a live price feed. This is the most significant gap between the current implementation and a production-grade version.
- **No cumulative limit.** The policy currently checks each trade independently. A sequence of many small trades, each individually within the cap, is not yet blocked in aggregate — this would require a stateful onchain oracle tracking rolling volume, which is planned but not yet implemented.
- **Single-chain, testnet-only.** Everything currently runs on Ethereum Sepolia and Binance Spot Testnet. No mainnet deployment has been attempted or is currently planned without a security review first.
- **Local simulation caveat.** The local policy-simulation tooling used during development has a known limitation in how it parses one intent field, which is worked around in local testing without weakening the actual onchain policy logic. This is documented for transparency rather than hidden.
- **Single-owner model.** The current deployment is self-custodial and self-administered by design — the deployer's wallet is both the policy admin and the trade executor. A multi-tenant version, where each user deploys their own isolated wallet and policy with no platform-level override, is the natural next step and is not yet built.

## Status

Functional MVP with a complete, tested, and onchain-verifiable execution path in both the approval and denial cases. Actively developed. Built by an independent developer as a focused exploration of policy-enforced AI agent execution, not a funded or team-backed product.

## License

MIT

