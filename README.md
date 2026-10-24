# ForgeAgent

Console open source et auto-hébergée pour **créer, tester, intégrer et superviser des agents IA** dont le cerveau est l’API Claude. Outil pour développeurs : aucune partie client final. Premier projet cible : Bonaco Pro.

- **Console** (`/`, Vite + React) : création d’agents en 7 étapes, pilotage (versions, skills, déclencheurs, outils, mémoire, logs), bac à sable, intégrations (widget, REST, MCP, clés, webhooks), observabilité, sécurité, équipe interne.
- **API** (`server/`, Hono + PostgreSQL + BullMQ) : REST documentée (OpenAPI), authentification, runtime des agents sous permissions, widget pour sites existants, et une **équipe interne d’agents** qui conçoit, sécurise, construit, teste et surveille vos agents.

## Démarrage rapide

```bash
node scripts/init-env.mjs       # crée .env avec des secrets aléatoires
docker compose up -d --build    # PostgreSQL + Redis + API + worker (http://localhost:8787)
npm install
npm run dev                     # console sur http://localhost:5173
```

Connectez-vous avec un compte de démonstration (mot de passe : `forgeagent-demo`, voir `SEED_PASSWORD`) :

| Compte | Rôle |
|---|---|
| abdoul@bonaco.pro | Administrateur |
| ines@bonaco.pro | Éditeur |
| theo@bonaco.pro | Lecteur |

Documentation de l’API : <http://localhost:8787/docs> (Swagger UI) et `/v1/openapi.json`.

### Autres modes

| Commande | Usage |
|---|---|
| `npm run dev:demo` | Console seule, sans back-end : données fictives en mémoire |
| `npm run server` | API sans Docker : PGlite (Postgres embarqué) + file en mémoire, un seul processus |
| `npm run test:server` | Tests du serveur (PGlite en mémoire, modèle simulé) |
| `npm run test:e2e` | Parcours Playwright complet sur la vraie stack (Chrome installé requis) |
| `node scripts/smoke.mjs` | Vérification rapide d’une API lancée |

Sans `ANTHROPIC_API_KEY`, le moteur fonctionne en mode **simulé** : déterministe et hors ligne, il convient aux démos et aux tests. Ajoutez la clé dans `.env` pour utiliser Claude.

## Architecture

```
console (React)  ──cookie de session──▶  API Hono (/v1, OpenAPI)  ──▶  PostgreSQL (Drizzle)
site client  ──widget.js + clé publiable──▶  /v1/widget/*            ──▶  Redis : BullMQ + pub/sub
                                             │
                                             ├─ runtime des agents utilisateurs (permissions vérifiées en code)
                                             └─ équipe interne : files team.<rôle>  ◀──  worker(s)
```

### Équipe interne (moteur multi-agents)

| Rôle | Modèle (`MODEL_*`) | Périmètre (capacités serveur) |
|---|---|---|
| Orchestrateur | sonnet | `readRequest` : choisit l’étape suivante parmi celles que le code autorise |
| Architecte | opus | `readCatalog`, `readProject` : propose la configuration |
| Contrôleur sécurité | opus | `readCatalog` : droit de veto, validation humaine |
| Constructeur | sonnet | `createAgentFromPlan` : crée l’agent avec le plan validé |
| Testeur | haiku | `runChecks`, `runSandbox` : vérifications + scénario en bac à sable |
| Superviseur | haiku | `readAgentHealth`, `readRecentErrors`, `notify` : surveillance continue |

- Chaque agent est un module `server/agents/<rôle>/` avec son `prompt.md`. Son contexte ne contient **que** ses capacités (`ROLE_CAPABILITIES`).
- Les agents ne s’appellent jamais entre eux. L’Orchestrateur publie des tâches sur les files `team.<rôle>`, les spécialistes les consomment, et les résultats vont dans `team_tasks`. Chaque échange est inscrit dans `team_events`, ce qui permet de **rejouer** une demande (vue « Équipe interne »).
- Garde-fous :
  - limites par demande (`TEAM_MAX_STEPS`, `TEAM_MAX_AGENT_CALLS`, `TEAM_MAX_TOKENS`) ;
  - détection de boucle (même rôle et même entrée plus de `TEAM_MAX_REPEATS` fois) ;
  - veto sécurité : le modèle ne peut que durcir le verdict du code ;
  - validation humaine pour les actions sensibles ;
  - plafond de permissions fixé par l’utilisateur et appliqué en code (`clampPlan`, `assertGrantable`) ;
  - sorties de modèle validées par Zod et traitées comme des données ;
  - audit complet.
- Tout ce qui est déterministe reste du code : permissions, validation, limites, journalisation.

### Runtime des agents utilisateurs

`server/src/runtime/run-agent.ts` enchaîne les étapes suivantes :
1. Vérifications préalables : arrêt d’urgence, statut, plafond de coût, rate limit.
2. Garde-fou anti-injection.
3. Outils dérivés des connecteurs accordés (lecture, ou écriture si accordée) et `perform_action`, limité aux actions autorisées et non interdites.
4. Validation humaine imposée pour les actions sensibles ou selon l’autonomie.
5. Boucle d’appels d’outils avec un nombre d’étapes maximal et un timeout.
6. Coût en tokens, traces pas à pas (`runs`, `run_steps`) et logs en direct (SSE).

### Intégration à un site existant

1. Créez une **clé publiable** dans Intégrations › Clés API (type « Publiable »).
2. Ajoutez le domaine du site dans Projets › Domaines autorisés.
3. Collez le snippet :
   ```html
   <script src="http://localhost:8787/widget.js" data-agent="agt_…" data-project="bonaco-pro" data-key="fa_pub_…" defer></script>
   ```
4. Dans Agent › Site externe, **Vérifier** contrôle que le site répond et charge le widget. **Envoyer** pousse un événement (`ping`, `page.context`…) aux pages ouvertes, qui répondent en direct.

Site de démo local : `http://localhost:8787/demo-site?agent=<id>&key=<clé publiable>`.

### Sécurité

- Mots de passe **scrypt**, sessions en cookie `HttpOnly; SameSite=Lax` stockées **hachées**, protection CSRF par origine, tentatives de connexion limitées.
- Clés API stockées en **HMAC-SHA256 avec poivre**, secret affiché une seule fois. Clés de test : bac à sable imposé. Clés liées à un projet. Clés publiables limitées au widget et aux domaines autorisés.
- Secrets au repos (connecteurs, webhooks) chiffrés en **AES-256-GCM**. Webhooks signés (`X-Forge-Signature`).
- Validation **Zod** de toutes les entrées. Requêtes Drizzle paramétrées. Matrice de rôles en code. Seul un administrateur peut accorder une action sensible.
- Protection **SSRF** sur les vérifications de site, les webhooks et l’indexation (`ALLOW_PRIVATE_SITE_URLS=false` en production).
- Logs **pino** expurgés (cookies, clés, mots de passe) ; données personnelles masquées dans les traces. Journal d’audit **en ajout seul** (trigger SQL).
- Aucun secret dans le dépôt : `.env` est ignoré et généré par `scripts/init-env.mjs`.

## Variables d’environnement

Toutes sont décrites dans [`.env.example`](.env.example). Les principales :

| Variable | Rôle |
|---|---|
| `VITE_API_URL` | URL de l’API pour la console (vide ⇒ mode démo) |
| `DATABASE_URL` | `postgres://…` ou `pglite://./.data/pglite` |
| `QUEUE_DRIVER` / `REDIS_URL` | `bullmq` (Redis) ou `memory` |
| `ANTHROPIC_API_KEY` | Clé Claude (sinon modèle simulé) |
| `MODEL_ORCHESTRATOR` … `MODEL_SUPERVISOR` | Modèle par rôle interne |
| `KEY_PEPPER`, `ENCRYPTION_KEY` | Secrets de hachage et de chiffrement |
| `TEAM_MAX_*`, `RUN_MAX_STEPS`, `RUN_TIMEOUT_MS` | Garde-fous |
| `CONSOLE_ORIGINS`, `PUBLIC_URL` | CORS de la console, URL publique de l’API |

## Structure

```
src/                      console React (voir src/api/ : contrat ForgeApi, mock, http)
server/
  src/db/                 schéma Drizzle, migrations (server/drizzle), seed
  src/http/               routeur typé (validation + OpenAPI), schémas Zod, rôles
  src/routes/             auth, agents, ressources, ops, admin, équipe interne, widget
  src/runtime/            exécution des agents, connecteurs, vérifications, site externe, cron, indexation
  src/team/               moteur de l’équipe interne (engine, capacités, plan)
  agents/<rôle>/          prompt.md + module de chaque agent interne
  src/llm/                fournisseurs Anthropic et simulé
  src/queue/              BullMQ ou mémoire
  test/                   tests vitest (équipe interne, routes critiques)
scripts/                  init-env, smoke, e2e
docker-compose.yml        postgres, redis, api, worker
```

## Contribuer

1. `node scripts/init-env.mjs && npm install && npm --prefix server install`
2. Développez avec `npm run server` (API, PGlite) et `npm run dev` (console).
3. Avant une PR : `npm run lint`, `npm run build`, `npm --prefix server run lint`, `npm --prefix server run typecheck`, `npm run test:server`.
4. Schéma modifié : `npm --prefix server run db:generate` (nouvelle migration dans `server/drizzle/`), jamais de modification d’une migration existante.
5. Code, noms d’API et commentaires en anglais ; interface en français.
6. Toute action d’agent passe par une vérification en code : n’ajoutez jamais d’autorisation décidée par un modèle.

## Limites connues

- **Connecteurs MCP** : les outils exposés aux agents ont des réponses simulées réalistes. Le transport MCP réel reste à brancher dans `server/src/runtime/connectors.ts`.
- **Modèle** : sans `ANTHROPIC_API_KEY`, tout tourne en mode simulé. Les tests couvrent ce mode ; le chemin Anthropic suit l’API officielle du SDK mais n’a pas été exécuté ici faute de clé.
- **Emails** : pas d’envoi. Les invitations produisent un lien à transmettre ; la réinitialisation du mot de passe répond sans envoyer de message.
- **Connaissances** : les sites web et les fichiers texte ou Markdown sont indexés. L’extraction PDF/Word n’est pas disponible. La recherche se fait par mots-clés, sans embeddings.
- **Workflows et délégations A2A** : ils sont enregistrés et modifiables, mais le moteur ne les exécute pas encore. L’exécution de test du canvas est une animation côté console.
- **Évaluations** : chaque lancement rejoue au plus 10 cas en bac à sable. Le score mesure la réussite des exécutions, pas une notation sémantique.
- **Export OpenTelemetry** : l’adresse est enregistrée, mais l’export n’est pas encore implémenté.
- **Historique de démonstration** : le seed stocke environ 1 exécution réelle pour 50, les volumes du graphique sur 7 jours sont donc réduits.
