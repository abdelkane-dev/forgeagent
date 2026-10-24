# BACKEND_PROGRESS — back-end ForgeAgent

Reprise : lire ce fichier, puis `server/README` (section du README racine) et `src/api/` (contrat front).
Légende : [x] fini · [~] en cours · [ ] à faire

## Décisions techniques
- Dossier `server/` (paquet npm séparé), TypeScript 7, **Hono** + `@hono/node-server`, **Zod 4** (validation + génération OpenAPI via `z.toJSONSchema`), **Drizzle** ORM.
- Base : **PostgreSQL 17** (docker compose) ; **PGlite** (Postgres en WASM) pour les tests et un lancement local sans Docker (`DATABASE_URL=pglite://./.data/pglite`). Mêmes migrations SQL.
- Types partagés : le serveur importe `src/api/types.ts` (alias `@shared/*`) et le seed réutilise `src/api/mock/seed.ts` ⇒ mode démo et vraie base racontent la même histoire.
- File : **BullMQ + Redis** (`QUEUE_DRIVER=bullmq`) ; driver `memory` de même interface pour les tests et le mono-processus.
- LLM : SDK Anthropic côté serveur uniquement ; fournisseur `simulated` déterministe quand `ANTHROPIC_API_KEY` est absente (tests, démo hors-ligne). Modèle par rôle interne via `MODEL_*`.
- Sécurité : mots de passe **scrypt** ; sessions = jeton aléatoire en cookie httpOnly, stocké **haché** (SHA-256) ; clés API stockées en **HMAC-SHA256 avec poivre** ; secrets (connecteurs, webhooks) en **AES-256-GCM** ; journal d'audit **append-only** (trigger SQL).
- IDs préfixés (`agt_…`, `prj_…`) comme le front.

## Écarts de contrat front ⇄ back
- `ApiKey` : ajout de `projectId` et `scope: 'secret' | 'publishable'` (clé publiable pour le widget).
- `Approval` : ajout de `source: 'agent' | 'team'` et `requestId?` (validations de l'équipe interne).
- Nouveaux types : `User`, `TeamAgentInfo`, `TeamRequest`, `TeamTask`, `TeamEvent` (vue « Équipe interne »).

## Phase 1 — Base de données
- [x] Schéma Drizzle (27 tables : users, sessions, api_keys, projects, agents, agent_projects, agent_versions, skills, agent_skills, connectors, integrations, webhooks, runs, run_steps, logs, config_checks, approvals, audit_log, evals, knowledge_docs, memories, templates, notifications, workflows, delegations, schedules, settings, team_requests, team_tasks, team_events)
- [x] Migrations (`server/drizzle/`), dont trigger append-only sur `audit_log`
- [x] Seed de démonstration (Bonaco Pro, 5 agents, historique 7 jours, clés réelles hachées)

## Phase 2 — API REST
- [ ] Routeur typé + OpenAPI + Swagger UI
- [ ] Auth (login, logout, me, signup admin initial), rôles
- [ ] Ressources : overview, agents, projects, skills, connectors, traces, logs (+SSE), approvals, audit, evals, knowledge, memories, templates, team, api-keys, webhooks, notifications, workflows, delegations, schedules, settings, playground

## Phase 3 — Moteur d'agents (équipe interne)
- [ ] Abstractions : file (bullmq/memory), LLM (anthropic/simulated)
- [ ] 6 agents internes (`server/agents/<rôle>/prompt.md` + module)
- [ ] Orchestrateur, limites (étapes, appels, tokens), détection de boucle, veto sécurité, validation humaine
- [ ] Runtime des agents utilisateurs (permissions, outils, logs pas à pas, timeouts, rate limit, coût)
- [ ] Superviseur périodique
- [ ] Tests : scénario complet, veto, boucle

## Phase 4 — Intégration aux sites
- [ ] `widget.js`, clé publiable par projet, CORS par projet, événements site ⇄ agent, site de démo

## Phase 5 — Sécurité
- [ ] En-têtes, rate limiting, CSRF, SSRF (vérification de sites), escalade de permissions, logs masqués

## Phase 6 — Front
- [ ] Auth réelle, garde de routes, `VITE_API_URL`, vue « Équipe interne », snippets avec clé publiable

## Phase 7 — Vérification
- [ ] Tests serveur (auth, permissions, exécution)
- [ ] Playwright : créer, skill, tester, intégrer au site de démo, logs
- [ ] Build + lint front et serveur, docker compose, README
