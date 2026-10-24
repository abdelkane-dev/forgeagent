# BACKEND_PROGRESS — v2 : isolation stricte par agent

Reprise : lire ce fichier, puis `FORGE_THEME.md`, `README.md`, `src/api/types.ts` (contrat), `server/src/db/schema.ts`.
Légende : [x] fini · [~] en cours · [ ] à faire

La v1 (API Hono, équipe interne, widget, Docker) a été livrée puis entièrement refondue en v2 autour du principe : **chaque agent est un espace totalement isolé**. État : **v2 terminée**.

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
- **Fichiers** : stockage S3 (SeaweedFS dans docker compose, les images MinIO n’étant plus publiques) ou `fs` (tests, mode sans Docker). `AgentStorage` n’accepte que les clés `agents/<agentId>/…`.
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
- [x] FORGE_THEME.md, `src/labels.ts`, palette braise et charbon, logo enclume, états métal, blasons, étincelles et chaleur sur la landing

## Phase 1 — Base de données
- [x] Schéma v2 + migrations régénérées + RLS forcée (29 tables, 116 politiques) + rôle `forge_app` + fonctions SECURITY DEFINER
- [x] pgvector (PGlite + image pgvector/pgvector:pg17), index HNSW cosinus
- [x] Seed v2 (Bonaco Pro, membres par agent), inséré dans le contexte isolé de chaque agent

## Phase 2 — Services d’isolation
- [x] `scoped()` / `asAgent()`, `serial()` (jamais de requêtes parallèles dans une transaction), stockage par agent, secrets dérivés, clés par agent, membres, usage et budgets, docs générées, export et purge

## Phase 3 — Runtime, workflows, évaluations
- [x] Runtime d’un agent (son contexte seul, coûts dans `usage_costs`, environnement de test séparé)
- [x] Moteur de workflows (manuel, cron, webhook ; étapes ; versions ; exécutions ; reprise ×3 ; pause de validation)
- [x] Évaluations + test de régression avant publication (refus si baisse > `REGRESSION_TOLERANCE`)

## Phase 4 — Équipe interne v2
- [x] Jetons de capacité, tâches mono-agent, audit et coûts imputés à l’agent cible, Veilleur de Feu par agent avec escalade de modèle

## Phase 5 — API v2
- [x] Routes `/v1/agents/:agentId/*` (404 pour les non-membres) + auth + projets + tableau de bord limité + La Forge + admin plateforme audité (`X-Forge-Maintenance`) + widget et hooks par agent

## Phase 6 — Tests
- [x] Isolation : chaque route agent de l’OpenAPI en tant qu’étranger (session et clé), IDOR sur les identifiants enfants, vecteurs, coûts, logs, workflows, secrets, stockage, tâches de l’équipe, purge, RLS sans contexte et contexte forgé, audit en ajout seul, maintenance
- [x] Routes critiques + scénario complet de La Forge (validation, veto, boucle, plafond, supervision)

## Phase 7 — Front v2
- [x] Contrat `ForgeApi` v2 + mock démo isolant + http + hooks par agent
- [x] Espace agent (10 onglets), navigation thème, « Forger un agent » (La Forge ou manuel), La Forge, tableau de bord limité, Test, Intégration, Logs, Paramètres et administration

## Phase 8 — Livraison
- [x] docker compose (pgvector, Redis, S3 SeaweedFS, API, worker, rôle `forge_app`), `.env.example`, `init-env`
- [x] Playwright, build, lint, README

## Vérification — résultats
- Serveur : `tsc` 0 erreur, oxlint 0 avertissement, `tsup` OK, **vitest 53/53** (3 fichiers : isolation, API, La Forge).
- Front : `tsc -b` 0 erreur, oxlint 0 avertissement, `vite build` OK.
- Docker : les 5 services sont sains. En SQL direct avec `forge_app` : 0 agent et 0 secret sans contexte ; Théo ne voit que `agt_7x1pd` ; une tâche sur `agt_7x1pd` ne voit que ses vecteurs.
- E2E Playwright sur la vraie stack (**13/13**) : connexion, agent forgé par La Forge (Démarrage → Validé), audit des échanges, activation, connaissance indexée et retrouvée, test, clé publiable, site de démo relié et widget détecté, dialogue par le widget, événement ping → pong, logs, La Forge rejouée, autre utilisateur sans accès (« Agent introuvable »).
