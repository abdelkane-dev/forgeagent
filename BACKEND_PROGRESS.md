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

- [x] Colonne `content` des connaissances (migration 0002) pour l'indexation réelle

## Phase 2 — API REST
- [x] Routeur typé (`server/src/http/router.ts`) : validation Zod + contrôle de rôle + OpenAPI 3.1 (`/v1/openapi.json`, Swagger UI `/docs`), 80+ routes
- [x] Auth : login, logout, me, signup (instance vide uniquement), invitations (lien), reset (sans énumération), cookie de session haché
- [x] Ressources : overview, agents (+run, checks, versions, duplicate, site, mémoire), projects, skills, connectors, templates, traces, logs (+SSE), approvals, audit, evals, knowledge, memories, team, api-keys, webhooks (signés), notifications, workflows, delegations, schedules, settings

## Phase 3 — Moteur d'agents (équipe interne)
- [x] Abstractions : file (bullmq/memory), LLM (anthropic/simulated), bus (Redis pub/sub/mémoire)
- [x] 6 agents internes (`server/agents/<rôle>/prompt.md` + `index.ts`), modèles via `MODEL_*`
- [x] Moteur (`server/src/team/engine.ts`) : files par rôle, transitions imposées par le code, limites étapes/appels/tokens, détection de boucle, veto, validation humaine (reprise après approbation), `team_tasks` + `team_events` rejouables
- [x] Capacités cloisonnées par rôle (`ROLE_CAPABILITIES`), plafond de permissions (`clampPlan`, `assertGrantable`)
- [x] Runtime des agents utilisateurs : permissions en code, outils connecteurs, `perform_action`, validations, garde-fou injection, PII, timeout, rate limit, coût, traces pas à pas, recherche dans les connaissances
- [x] Superviseur périodique (`SUPERVISOR_INTERVAL_SEC`) + ronde manuelle ; planificateur cron des agents
- [x] Tests : scénario complet, validation humaine, veto, boucle, plafond, cloisonnement, Superviseur (7 tests)

## Phase 4 — Intégration aux sites
- [x] `widget.js` (Shadow DOM, sans dépendance) configuré par `data-agent`/`data-project`/`data-key`
- [x] Clé publiable par projet ; origine vérifiée contre les domaines autorisés du projet (CORS par projet, sans preflight)
- [x] Vérification de site réelle (fetch SSRF-safe, détection du widget), événements console → site par canal SSE avec accusé de réception
- [x] Site de démo `/demo-site` ; snippets du front fonctionnels de bout en bout (widget, REST, JS, Python, MCP : `POST /v1/agents/:id/mcp`)

## Phase 5 — Sécurité
- [x] En-têtes sécurisés, limite de taille, CORS console, CSRF par origine, rate limit (login, runs, widget)
- [x] scrypt, HMAC des clés, AES-GCM des secrets, audit append-only, logs pino expurgés, masquage PII
- [x] SSRF (sites, webhooks, indexation), anti-escalade (éditeur ≠ actions sensibles, dernier admin protégé, plafond équipe)
- [x] Aucun secret dans le dépôt (`scripts/init-env.mjs`)

## Phase 6 — Front
- [x] `ForgeApi` étendu (auth, internalTeam, clés publiables) ; `VITE_API_URL` ⇒ HTTP, sinon mock (`npm run dev:demo`)
- [x] Connexion réelle, invitation, garde de session, déconnexion, redirection 401
- [x] Vue « Équipe interne » (agents, statut, tokens par rôle, files, validations, demandes rejouables)
- [x] Clés publiables, snippets réels, import de fichiers texte, validations d'équipe dans Sécurité

## Phase 7 — Vérification
- [x] Tests serveur : 30 (équipe interne + routes critiques : auth, CSRF, rôles, exécution, clés, widget, MCP, OpenAPI)
- [x] Playwright (`npm run test:e2e`) sur la vraie stack : connexion, création, skill, test, clé, domaine, site de démo, widget, événement, logs, équipe interne : 11/11
- [x] Build + lint front et serveur sans erreur ni avertissement ; `docker compose up` (Postgres 17, Redis 7, API, worker) vérifié ; smoke test
- [x] README (installation, variables, architecture, sécurité, contribution, limites)

## Limites connues
Voir la section du même nom dans `README.md` : transport MCP réel, envoi d'emails, extraction PDF/Word, exécution des workflows et A2A, export OTel, notation sémantique des évaluations.
