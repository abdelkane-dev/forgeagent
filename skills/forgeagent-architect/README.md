# ForgeAgent Architect & Security Controller (Free)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-orange.svg)](https://opensource.org/licenses/Apache-2.0)
[![Powered by ForgeAgent](https://img.shields.io/badge/Powered%20by-ForgeAgent-ff7a1a.svg)](https://github.com/abdelkane-dev/forgeagent)
[![Works with Claude Code](https://img.shields.io/badge/Claude%20Code-Compatible-D97757)](https://github.com/abdelkane-dev/forgeagent)
[![Works with Cursor](https://img.shields.io/badge/Cursor-Compatible-6366f1)](https://github.com/abdelkane-dev/forgeagent)

**Design production-ready Claude agents from a one-sentence brief. Audit MCP servers in seconds. Never ship an over-privileged agent again.**

---

## What is this?

This skill extracts the **Architect** and **Security Controller** roles from the internal engineering team of [ForgeAgent](https://github.com/abdelkane-dev/forgeagent) — the self-hosted, open-source workshop to build, test, integrate, and supervise Claude agents.

In ForgeAgent, every agent is designed by an internal team of six specialized agents before it's built. This skill gives you that same **Architect + Security Controller pair** directly inside your IDE.

---

## What it does

### 🏗️ Agent Architecture from a Brief
Paste a one-sentence description. Receive a complete, production-grade agent specification:
- **Role, Mission, Type** — precisely defined, no guesswork.
- **Model Selection** — Haiku / Sonnet / Opus, matched to the task complexity and budget.
- **`allowedActions`** — the exact capability list, nothing more.
- **`forbiddenActions`** — hard stops the agent must never cross.
- **`autonomy` level** — supervised / act_after_approval / autonomous, chosen conservatively.
- **`costCapPerDay`** — a budget ceiling defined at design time, not after the first runaway bill.

### 🔒 MCP Tool Security Audit
Point it at any `tools/list` response or TypeScript MCP handler. It checks:
- All 4 mandatory tool annotations are present (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).
- Destructive tools are correctly flagged and gated behind human confirmation.
- Read-only connectors are not escalated to `read_write` without justification.
- No credential exposure or unsafe environment variable patterns.

Returns a **security score out of 100** with a corrected diff you can apply immediately.

### 🛡️ Human-in-the-Loop Gate Enforcement
Every design automatically identifies which actions require user confirmation before execution — and generates the exact `⚠️ HUMAN REVIEW REQUIRED` gate output format your agent should produce.

### 📦 ForgeAgent JSON Export
All specifications are output as valid ForgeAgent JSON — ready to import into any self-hosted ForgeAgent instance, or to be used as a machine-readable spec for your own build pipeline.

---

## Who this is for

- **Developers building Claude agents** who want a rigorous design process, not trial-and-error prompting.
- **MCP server publishers** who want to pass M8ven trust audits and appear in the OpenAI tool registry.
- **Teams adopting AI** who need a repeatable, auditable standard for every agent shipped.

---

## What's included

```
forgeagent-architect/
├── SKILL.md                         ← The full agent instructions (this file)
├── references/
│   └── spec-schema.json             ← JSON Schema for ForgeAgent agent specs
└── README.md                        ← This file
```

---

## Example interactions

**Design from scratch:**
> "I need an agent that monitors our Postgres database for slow queries and opens a ticket automatically."

**Returns:** Full ForgeAgent JSON spec with `type: monitoring`, `model: claude-sonnet-*`, `autonomy: act_after_approval` (ticket creation needs confirmation), tools set to `read` only, all 4 MCP annotations set, and a Security Controller verdict of `approve`.

---

**MCP audit:**
> "Here's my tools/list output. Audit it for M8ven compliance."

**Returns:** Annotation gap analysis, corrected JSON, and a security score.

---

## About ForgeAgent

ForgeAgent is an open-source, self-hosted platform where each agent is an isolated space (PostgreSQL RLS + pgvector). Each agent has its own keys, its own cost tracking, and its own audit log — and is designed by a team of six internal agents before it goes live.

- **GitHub**: [https://github.com/abdelkane-dev/forgeagent](https://github.com/abdelkane-dev/forgeagent)
- **Live Demo**: [https://abdelkane-dev.github.io/forgeagent/](https://abdelkane-dev.github.io/forgeagent/)
- **M8ven Trust Index**: [https://m8ven.ai/mcp/abdelkane-dev/forgeagent](https://m8ven.ai/mcp/abdelkane-dev/forgeagent)

---

*Pair this with **ForgeAgent Evaluator** (premium) to add automated regression testing and a release gate to your agent development workflow.*
