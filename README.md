# Clawton

**A policy enforcement layer between an AI agent and real-money execution — trades and payments alike — enforced onchain.**

## Summary

Clawton sits between an AI agent (OpenClaw) and the systems it can spend money through. Every action the agent proposes — a trade on Binance, or a payment for an API resource via the x402 protocol — is evaluated against an onchain policy before it is allowed to execute. Both the approval and the denial of every action are permanently recorded onchain, so the system's behavior is independently verifiable rather than something the agent merely reports.

The project is built on Newton Protocol for policy evaluation and attestation, deployed on Ethereum Sepolia. Two execution paths are currently supported: trade execution on Binance Spot Testnet, and resource payments over the x402 protocol on Base Sepolia.

## The problem

Connecting an AI agent to a trading account or a payment-enabled wallet gives that agent real execution power. A reasoning error, a bad prompt, a prompt-injection attempt, or a plain bug can turn into financial loss with nothing standing between the agent's decision and the money moving. This risk isn't limited to exchanges — the same exposure applies to autonomous agents paying for resources over emerging protocols like x402, where recent academic research has documented overpayment and injection-driven fraudulent-payment attack patterns as open problems, explicitly calling for pre-execution controls as the architecturally sound response. Clawton implements exactly that, on both fronts.

## Design principle

**The policy decides, not the agent.** Whether the agent is proposing a Binance trade or an x402 payment, the request goes through the same independent guard process, evaluated against a policy deployed onchain and immutable at runtime. If the check fails, nothing is executed — no exchange order, no payment signature — no matter what the agent says or how it explains the result. Every check, on either path, is logged both locally and onchain.

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
│      Blocked before
│      reaching Binance
│      or the x402 facilitator
│
├──▶ Binance execution (trades)
└──▶ x402 payment (resource access, Base Sepolia)
│
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
- [ALLOWED Binance trade](https://sepolia.etherscan.io/tx/0x3ad2c92b546e1fed21c34c42c5b4b280bcb08d46f2fe5a14c242fe28c113bdcd#eventlog) — 0.001 BTC within the spend cap, executed and logged.
- [DENIED Binance trade](https://sepolia.etherscan.io/tx/0xf17fa9138f24ce214df2f84f63e9d62ef7381060620c6379c64eb1a3ef344a1b#eventlog) — an attempt 50x over the spend cap, blocked and logged.
- [ALLOWED x402 payment](https://sepolia.etherscan.io/tx/0x2ae1236bcf57c9bc634c3615a06d8dadc08577bab2206e21df7c42f62824186f#eventlog) — a $0.01 USDC payment on Base Sepolia, settled and logged.
- [DENIED x402 payment](https://sepolia.etherscan.io/tx/0x2b3668e8811fca69dfc1ee513cc4f0d8bafc0dd2b0f308fd06e4d99bb283516a#eventlog) — a $50 payment request exceeding the policy limit, blocked before it was signed.

## Components

| Component | Description |
|---|---|
| Rego policy | The policy logic: spend cap, recipient/token whitelist, withdrawal block, admin override |
| Policy Data contract | Onchain WASM data provider backing the policy evaluation |
| Policy contract | The deployed Rego policy logic itself |
| NewtonPolicyWallet | Smart wallet contract; binds task manager, policy, and owner atomically at deployment, in a single transaction |
| ClawtonTradeLog | Onchain event log recording every ALLOWED and DENIED decision — for both trades and payments — with its parameters and timestamp |
| Clawton Guard (Binance) | Node.js bridge: evaluates a trade intent against the deployed policy, executes on Binance only if allowed, and writes the outcome onchain either way |
| Clawton Guard (x402) | Node.js bridge: probes an x402-protected resource, evaluates the payment requirement against the same deployed policy, and signs the payment only if allowed |
| Agent skill definitions | Instruct the OpenClaw agent to route every trade or payment request through the appropriate guard rather than acting directly, and to report only what the guard's output actually says |

## Policy rules (current)

1. **Spend cap** — no single trade or payment may exceed a configured maximum value.
2. **Whitelist** — only pre-approved trading pairs (Binance) or recipients (x402) are permitted.
3. **No withdrawals** — any withdrawal-type action is unconditionally denied.
4. **Admin override** — a designated address can bypass the checks above for manual intervention.

The policy is evaluated as fail-closed: any undefined or unrecognized condition results in denial, not approval.

## Onchain verifiability

Every decision — trade or payment, approved or denied — is written to a dedicated event log contract on Sepolia. Anyone can inspect the chain directly and see the verdict, the action type, the amount, and the context that produced that verdict, with an immutable timestamp. This is separate from the action itself, which settles where it belongs (the exchange's order book, or Base Sepolia for x402 payments) — it is an onchain attestation that the check happened and what it concluded.

## Tech stack

- **Newton Protocol** — Rego-based policy evaluation and WASM data providers, deployed as onchain contracts
- **Foundry** — smart contract development and deployment
- **OpenClaw** — the agent runtime; model-agnostic, currently running an NVIDIA-hosted agentic model
- **Binance Spot Testnet / binance-cli** — trade execution
- **x402 / Base Sepolia** — resource payment execution
- **Node.js** — the guard processes tying policy evaluation, execution, and onchain logging together

## What's been verified end-to-end

- A Binance trade within policy limits: evaluated, approved, executed, filled, and logged onchain.
- A Binance trade far outside policy limits (50x the spend cap): evaluated, denied, never reached the exchange, and the denial itself logged onchain.
- An x402 payment within policy limits: evaluated, approved, settled on Base Sepolia, resource data returned, and logged onchain.
- An x402 payment far outside policy limits ($50 against a $0.01 baseline): evaluated, denied, payment never signed, and the denial logged onchain.
- The agent, prompted in plain language across both action types, correctly reports the guard's actual output rather than an invented explanation — including catching and correcting real failure modes observed during testing (a fabricated command name, and an incorrect atomic-unit-to-dollar conversion), both traced back to raw logs rather than trusted at face value.

## Known limitations (honest, current state)

- **Not audited.** This is an active MVP. It has not undergone any professional security review and should not be used with real funds in its current form.
- **Spend value estimation.** The value used for the spend-cap check — on both the Binance and x402 paths — is computed using a fixed approximate USD-to-ETH conversion rate, not a live price feed. This is the most significant gap between the current implementation and a production-grade version.
- **No cumulative limit.** Each action is checked independently. A sequence of many small actions, each individually within the cap, is not yet blocked in aggregate — this would require a stateful onchain oracle tracking rolling volume, which is planned but not yet implemented.
- **Testnet-only, two chains.** Ethereum Sepolia (policy) and Base Sepolia (x402 settlement) plus Binance Spot Testnet. No mainnet deployment has been attempted or is currently planned without a security review first.
- **Local simulation caveat.** The local policy-simulation tooling used during development has a known limitation in how it parses one intent field, which is worked around in local testing via a separate simulation-only policy file, without weakening the actual onchain policy logic. This is documented for transparency rather than hidden.
- **Single-owner model.** The current deployment is self-custodial and self-administered by design — the deployer's wallet is both the policy admin and the executor across both paths. A multi-tenant version, where each user deploys their own isolated wallet and policy with no platform-level override, is the natural next step and is not yet built.
- **Agent reliability requires active verification.** During development, the agent was observed fabricating a plausible-sounding but incorrect dollar-value calculation, and separately inventing a nonexistent command name, both while sounding fully confident. Both were caught by cross-checking the agent's claims against the guard's actual local log file — which is why that log, not the agent's narration, is treated as the system's source of truth throughout this project.

## Status

Functional MVP covering two independent execution paths (Binance trades, x402 payments), both enforced by the same onchain policy and both fully logged onchain. Actively developed by an independent developer.

## License

MIT
