# BACKEND_PROGRESS — v2 : isolation stricte par agent

Reprise : lire ce fichier, puis `FORGE_THEME.md`, `README.md`, `src/api/types.ts` (contrat), `server/src/db/schema.ts`.
Légende : [x] fini · [~] en cours · [ ] à faire

La v1 (API Hono, équipe interne, widget, Docker) est en place et testée (voir l’historique git). La v2 réorganise tout autour du principe : **chaque agent est un espace totalement isolé**.

## Décisions techniques v2
- **Isolation en base** : chaque table liée à un agent porte `agent_id NOT NULL` et a la RLS activée et forcée (`ENABLE` + `FORCE ROW LEVEL SECURITY`). Une seule fonction SQL décide de l’accès : `forge_can_access(agent_id)`, `SECURITY DEFINER`, qui lit le contexte de transaction :
  - `app.mode = 'user'` : l’utilisateur `app.user_id` doit être membre de l’agent (`agent_members`).
  - `app.mode = 'task'` : seulement `app.agent_id` (tâche de l’équipe interne, runtime, worker), après vérification d’un jeton de capacité par le code.
  - `app.mode = 'platform'` : seulement `app.agent_id`, pour un administrateur de plateforme en maintenance (chaque accès est écrit dans l’audit de l’agent).
  - Sans contexte : aucune ligne.
- **Rôle base dédié** : l’application se connecte avec le rôle `forge_app` (ni superutilisateur ni propriétaire), donc la RLS s’applique toujours. Les migrations et le seed passent par `DATABASE_ADMIN_URL`. Avec PGlite (tests), la session bascule en `SET ROLE forge_app` après migration.
- **Toute requête sur des données d’agent** passe par `scoped(ctx, tx => …)` (transaction + `SET LOCAL ROLE forge_app` + `set_config`). Les tables de plateforme (users, sessions, projects, skills, connectors, templates, platform_settings, notifications, platform_audit) n’ont pas de RLS.
- **Résolution des clés API / du widget** : fonction `SECURITY DEFINER` `forge_resolve_key(hash)` ; aucune lecture inter-agents par le code.
- **Vecteurs** : pgvector (`vector(256)`, index HNSW cosinus), protégés par la RLS ; embeddings `hash` (feature hashing, hors ligne) derrière une interface `Embedder`.
- **Fichiers** : stockage S3 (MinIO dans docker compose) ou `fs` (tests). `AgentStorage` n’accepte que les clés `agents/<agentId>/…`.
- **Secrets** : AES-256-GCM avec une **clé dérivée par agent** (HKDF(`ENCRYPTION_KEY`, agentId)) ; clés API par agent, stockées en HMAC.
- **Accès** : `agent_members(agent_id, user_id, role: owner|editor|viewer)` ; rôle de plateforme `users.platform_role: admin|member`. Être membre de A ne donne rien sur B.
- **Préfixes** : bus `agent:<id>:*`, jobs BullMQ `agent:<id>:…`, rate limit `agent:<id>:…`.
- **Équipe interne** : chaque tâche cible UN agent (`team_tasks.agent_id`) et reçoit un jeton de capacité HMAC (agentId, taskId, rôle, expiration) ; les capacités ouvrent un contexte `task` limité à cet agent. Coûts imputés à l’agent (`usage_costs.source = 'team'`) ; chaque échange est écrit dans l’audit de l’agent.
- **Cycle de vie** : `starting` → `validated` → `active`, `inactive` (pause), `error`. « Forger un agent » via l’équipe crée d’abord l’agent en `starting` avec le demandeur propriétaire.
- **Suppression** : export JSON, puis purge (DB en cascade, vecteurs, fichiers du préfixe, secrets, jobs).
- **Modèles** : orchestrator/architect/security = opus ; builder/tester = sonnet ; supervisor = haiku, escalade sonnet sur anomalie (`MODEL_SUPERVISOR_ESCALATION`).

## Écarts de contrat front ⇄ back (v2)
- `AgentStatus` : `inactive | starting | active | validated | error`.
- `User.platformRole` ; `Agent.myRole` (owner/editor/viewer) ; `Agent.monthlyBudget`, `Agent.allowedOrigins`.
- Ressources par agent : `KnowledgeDoc`, `KnowledgeHit`, `MemoryItem(kind)`, `AgentIntegration`, `AgentSecret`, `ApiKey(agentId)`, `EvalSuite/EvalCase/EvalRun`, `AuditEntry(agentId, actorType, result)`, `UsageSummary`, `AgentMember`, `AgentDoc`, `Workflow(version, trigger)/WorkflowRun`.
- Supprimés (incompatibles avec l’isolation) : délégations A2A, planifications globales, webhooks globaux (désormais par agent).

## Phase 0 — Thème forge (front)
- [~] FORGE_THEME.md, `src/labels.ts`, palette, logo, états, blasons, landing

## Phase 1 — Base de données
- [ ] Schéma v2 + migrations régénérées + RLS + rôle `forge_app` + fonctions SECURITY DEFINER
- [ ] pgvector (PGlite + image pgvector/pgvector:pg17)
- [ ] Seed v2 (Bonaco Pro, membres par agent)

## Phase 2 — Services d’isolation
- [ ] `scoped()` / contexte, stockage par agent, secrets dérivés, clés par agent, membres, usage/budgets, docs générées, export/purge

## Phase 3 — Runtime, workflows, évaluations
- [ ] Runtime agent (contexte de l’agent seul, coûts → usage_costs, environnement test séparé)
- [ ] Moteur de workflows (déclencheurs manuel/cron/webhook, étapes, versions, exécutions, reprise)
- [ ] Évaluations + test de régression avant publication

## Phase 4 — Équipe interne v2
- [ ] Jetons de capacité, tâches mono-agent, audit et coûts imputés, supervisor + escalade

## Phase 5 — API v2
- [ ] Routes `/v1/agents/:agentId/*` + auth + projets + tableau de bord limité + La Forge + admin plateforme audité + widget par agent

## Phase 6 — Tests
- [ ] Isolation (IDOR sur chaque famille de routes, vecteurs, coûts, logs, workflows, secrets, tâches, purge, RLS sans contexte applicatif)
- [ ] Routes critiques + scénario équipe complet (veto, boucle)

## Phase 7 — Front v2
- [ ] Contrat `ForgeApi` v2 + mock démo + http
- [ ] Espace agent (10 onglets), navigation thème, La Forge, tableau de bord limité, admin

## Phase 8 — Livraison
- [ ] docker compose (pgvector, Redis, MinIO, API, worker), `.env.example`
- [ ] Playwright, build, lint, README
