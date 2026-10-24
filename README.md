# ForgeAgent

Console open source et auto-hébergée pour **forger, tester, intégrer et superviser des agents IA** dont le cerveau est l’API Claude. C’est un outil pour développeurs, sans partie client final. Premier projet cible : Bonaco Pro.

**Chaque agent est un espace scellé.** Ses connaissances et vecteurs, sa mémoire, ses intégrations et secrets, ses clés API, ses tests, ses workflows, ses coûts, son audit et sa documentation n’appartiennent qu’à lui. Seuls ses membres y accèdent, et c’est PostgreSQL lui-même qui l’impose (Row-Level Security).

- **Console** (`/`, Vite + React) :
  - un espace par agent, avec 10 onglets : Aperçu, Connaissances et mémoire, Intégration, Test et évaluation, Workflows, Audit, Coûts et usage, Équipe et accès, Documentation, Paramètres ;
  - La Forge, la vue de l’équipe interne ;
  - un tableau de bord limité à vos agents ;
  - l’administration de la plateforme.
- **API** (`server/`, Hono + PostgreSQL/pgvector + BullMQ + S3) :
  - une API REST documentée (OpenAPI), avec toutes les routes d’un agent sous `/v1/agents/{agentId}/…` ;
  - l’exécution des agents sous permissions, des workflows et des évaluations avec test de régression ;
  - un widget pour les sites existants ;
  - une **équipe interne d’agents** qui conçoit, sécurise, construit, teste et surveille vos agents.

## Installation

```bash
node scripts/init-env.mjs       # crée .env avec des secrets aléatoires
docker compose up -d --build    # PostgreSQL (pgvector) + Redis + S3 (SeaweedFS) + API + worker
npm install
npm run dev                     # console sur http://localhost:5173
```

Comptes de démonstration (mot de passe : `SEED_PASSWORD` dans `.env`, `forgeagent-demo` par défaut) :

| Compte | Rôle plateforme | Agents visibles |
|---|---|---|
| abdoul@bonaco.pro | Administrateur | propriétaire de 4 agents, éditeur du 5e |
| ines@bonaco.pro | Membre | éditrice de 2 agents, propriétaire de « Rapports hebdo » |
| theo@bonaco.pro | Membre | lecteur de « Assistant d’administration » uniquement |

Les clés API de démonstration (une série par agent) s’affichent une seule fois dans les journaux de l’API au premier démarrage. La documentation de l’API est disponible sur <http://localhost:8787/docs> (Swagger UI) et sur `/v1/openapi.json`.

### Inscription et connexion

- **Email et mot de passe.** Le premier compte devient administrateur de la plateforme. Ensuite, `SIGNUP_MODE=open` (par défaut) laisse chacun créer un compte de simple membre, qui ne voit que les agents qu’il crée ou auxquels on l’ajoute. `SIGNUP_MODE=invite` réserve l’inscription aux invitations.
- **GitHub.** Créez une OAuth App (GitHub › Settings › Developer settings › OAuth Apps). Déclarez comme *Authorization callback URL* `<PUBLIC_URL>/v1/auth/oauth/github/callback`, par exemple `http://localhost:8787/v1/auth/oauth/github/callback`. Renseignez ensuite `GITHUB_CLIENT_ID` et `GITHUB_CLIENT_SECRET`.
- **Google, pour les comptes Gmail et Workspace.** Créez un « ID client OAuth » de type *Application Web* dans la Google Cloud Console. Déclarez comme URI de redirection `<PUBLIC_URL>/v1/auth/oauth/google/callback`, puis renseignez `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.
- Redémarrez l’API (`docker compose up -d`) : les boutons « Continuer avec GitHub / Google » deviennent actifs.
- Règles appliquées :
  - un état signé et à usage unique protège le retour du fournisseur contre le CSRF ;
  - Google utilise PKCE ;
  - seules les adresses **vérifiées** par le fournisseur sont acceptées ;
  - une adresse vérifiée égale à celle d’un compte existant (ou d’une invitation) rejoint ce compte ;
  - sinon, un compte est créé si l’inscription est ouverte ;
  - le retour ne redirige que vers la console.

### Autres modes

| Commande | Usage |
|---|---|
| `npm run dev:demo` | Console seule, sans back-end. Les données sont fictives, mais les mêmes règles d’isolation sont simulées. |
| `npm run server` | API sans Docker : PGlite (Postgres embarqué avec pgvector), file en mémoire, fichiers sur disque. |
| `npm run test:server` | Tests du serveur : isolation, routes, scénario de l’équipe interne (PGlite en mémoire, modèle simulé). |
| `npm run test:e2e` | Parcours Playwright complet sur la vraie stack (Chrome requis, `E2E_PASSWORD` = `SEED_PASSWORD`). |

Sans `ANTHROPIC_API_KEY`, le moteur fonctionne en mode **simulé** : il est déterministe et hors ligne, ce qui convient aux démos et aux tests. Ajoutez la clé dans `.env` pour utiliser Claude.

## Variables d’environnement

Toutes sont décrites dans [`.env.example`](.env.example). Voici les principales :

| Variable | Rôle |
|---|---|
| `VITE_API_URL` | URL de l’API pour la console (vide ⇒ mode démo) |
| `DATABASE_URL` | Connexion **applicative** (`forge_app`, soumise à la RLS) : `postgres://forge_app:…` ou `pglite://…` |
| `DATABASE_ADMIN_URL` | Connexion propriétaire, réservée aux migrations et au seed |
| `APP_DB_PASSWORD` | Mot de passe du rôle `forge_app`, posé par les migrations |
| `STORAGE_DRIVER`, `S3_*` | Fichiers des agents : `s3` (préfixe `agents/<agentId>/`) ou `fs` |
| `QUEUE_DRIVER` / `REDIS_URL` | `bullmq` (Redis) ou `memory` |
| `ANTHROPIC_API_KEY` | Clé Claude (sinon modèle simulé) |
| `MODEL_*` | Modèle par rôle interne (voir La Forge), et `MODEL_SUPERVISOR_ESCALATION` |
| `SIGNUP_MODE` | `open` (inscription libre) ou `invite` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Connexion avec GitHub |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Connexion avec Google (Gmail) |
| `KEY_PEPPER`, `ENCRYPTION_KEY` | Hachage des clés, chiffrement (avec une clé dérivée par agent), jetons de capacité |
| `CAPABILITY_TTL_SEC`, `REGRESSION_TOLERANCE` | Durée d’un jeton de tâche, baisse de score tolérée avant publication |
| `TEAM_MAX_*`, `RUN_MAX_STEPS`, `RUN_TIMEOUT_MS` | Garde-fous |

## Architecture

```
console (React) ──cookie──▶ API Hono /v1 ──▶ scoped(contexte) ──▶ PostgreSQL + pgvector (RLS, rôle forge_app)
site client ──widget.js + clé publiable de l’agent──▶ /v1/widget/*      ├─▶ S3 : agents/<agentId>/…
                                                       │                 └─▶ Redis : BullMQ + pub/sub agent:<id>:*
                                                       ├─ runtime d’un agent (son contexte, ses permissions)
                                                       └─ La Forge : files team.<rôle>, une tâche = un agent ◀── worker(s)
```

### Isolation par agent

- **En base.** Chaque table d’agent porte `agent_id`, avec `ENABLE` et `FORCE ROW LEVEL SECURITY` (29 tables). L’API se connecte avec `forge_app`, un rôle qui n’est ni super-utilisateur ni propriétaire. Chaque transaction déclare son contexte (`app.mode`, `app.user_id`, `app.agent_id`) dans `scoped()` :
  - `user` : les agents dont l’utilisateur est membre, limités à l’agent de la route quand elle en nomme un ;
  - `task` : un seul agent (exécutions, worker, tâches de l’équipe) ;
  - `platform` : un seul agent, en maintenance par un administrateur, avec chaque accès inscrit dans l’audit de l’agent ;
  - sans contexte, la base ne renvoie aucune ligne.
- **Accès.** Les rôles par agent sont `owner` (accès, clés, secrets, purge), `editor` (configure, teste, publie) et `viewer` (consulte, teste en environnement de test). Un non-membre reçoit **404** sur toute route de l’agent, sans fuite d’existence. Le rôle plateforme `admin` ne donne aucune donnée d’agent, seulement leurs métadonnées.
- **Clés et secrets.** Une clé API appartient à un agent et n’ouvre que lui. Elle est hachée par HMAC et résolue par une fonction `SECURITY DEFINER`. Les secrets sont chiffrés en AES-256-GCM avec une clé dérivée par agent (HKDF). Le widget n’accepte que la clé publiable de l’agent, depuis ses origines autorisées.
- **Vecteurs et fichiers.** Les vecteurs pgvector (index HNSW) sont protégés par la même RLS. `AgentStorage` refuse tout chemin hors de `agents/<agentId>/`.
- **Canaux.** Files, caches, logs en direct et événements du site sont préfixés `agent:<id>:…`. Les prompts ne contiennent que le contexte de l’agent exécuté.
- **Suppression.** Un export JSON est proposé d’abord (sans valeurs de secrets). La purge supprime ensuite les lignes en cascade, y compris les vecteurs et l’audit, ainsi que les fichiers du préfixe et les secrets.

### La Forge (équipe interne)

| Rôle (nom affiché) | Rôle technique | Modèle par défaut | Capacités serveur |
|---|---|---|---|
| Le Maître de Forge | orchestrator | Opus | `readRequest` |
| Le Dessinateur | architect | Opus | `readCatalog`, `readProject` |
| La Sentinelle | security | Opus | `readCatalog` (droit de veto) |
| Le Forgeron | builder | Sonnet | `configureAgentFromPlan` |
| Le Trempeur | tester | Sonnet | `runChecks`, `runSandbox`, `runEvaluation` |
| Le Veilleur de Feu | supervisor | Haiku, Sonnet sur anomalie | `readAgentHealth`, `readRecentErrors`, `notify` |

- « Forger un agent » crée l’agent immédiatement, en état **Démarrage**. Le demandeur en devient propriétaire, et toute la construction se passe ensuite dans les murs de cet agent.
- Chaque tâche (`team_tasks`) cible **un seul agent** et reçoit un jeton de capacité signé et limité dans le temps. Le jeton est vérifié avant chaque appel, et les capacités n’ouvrent qu’un contexte `task` sur cet agent.
- Les agents internes ne communiquent que par BullMQ. Les tokens consommés sont imputés à l’agent cible (`usage_costs.source = team`). Chaque échange est écrit dans `team_events` et dans l’audit de l’agent, ce qui permet de le rejouer depuis La Forge.
- Garde-fous :
  - limites d’étapes, d’appels et de tokens ;
  - détection de boucle ;
  - veto de la Sentinelle ;
  - validation humaine d’un propriétaire pour les actions sensibles ;
  - plafond de permissions fixé par le demandeur ;
  - sorties des modèles validées par Zod et traitées comme des données.

### Exécution, workflows, évaluations

- `runAgent` vérifie l’arrêt d’urgence, le statut, les plafonds jour et mois de l’agent et le rate limit, puis applique le garde-fou anti-injection. Il utilise ensuite les connaissances (recherche pgvector) et la mémoire courte et longue de l’agent, ainsi que ses outils et `perform_action` limité à ses actions autorisées. La validation humaine dépend de l’autonomie. Chaque exécution est tracée, ses coûts sont imputés et elle est inscrite dans l’audit.
- L’**environnement de test** utilise des outils simulés. Il est tracé mais non budgété.
- Les **workflows** se déclenchent manuellement, par cron ou par webhook (avec la clé de l’agent). Les étapes possibles sont : modèle, condition, validation, outil, sortie. Ils sont versionnés à la publication, reprennent jusqu’à 3 fois en cas d’échec et se mettent en pause en attendant une validation.
- Les **évaluations** gardent un historique des scores par version. Les suites de régression sont rejouées sur la configuration candidate avant chaque nouvelle version, et une baisse de score au-delà de la tolérance bloque la publication.

### Intégration à un site existant

1. Dans l’agent, ouvrez **Équipe et accès** et créez une clé de type « Publiable ».
2. Dans **Intégration**, reliez le site : son origine est ajoutée aux origines autorisées du widget.
3. Collez le snippet :
   ```html
   <script src="http://localhost:8787/widget.js" data-agent="agt_…" data-key="fa_pub_…" defer></script>
   ```
4. **Vérifier** contrôle que le site répond et charge le widget de cet agent. La console d’interaction envoie ensuite des événements (`ping`, `page.context`…). Les actions sur le site exigent la permission « Agir sur le site externe ».

Un site de démo local est disponible : `http://localhost:8787/demo-site?agent=<id>&key=<clé publiable>`.

### Sécurité

- Mots de passe hachés en **scrypt**. Sessions dans un cookie `HttpOnly; SameSite=Lax`, stockées hachées. Protection CSRF par origine. Tentatives de connexion limitées.
- Protection contre l’IDOR : chaque identifiant enfant est filtré par `agent_id`, et la RLS l’impose une seconde fois. La suite `test/isolation.test.ts` appelle **chaque** route agent de l’OpenAPI en tant qu’étranger.
- Injection entre agents :
  - aucune capacité ne prend un autre `agentId` ;
  - les sorties des modèles sont des données ;
  - les contenus externes sont balisés comme non fiables.
- Validation **Zod** de toutes les entrées, requêtes paramétrées, protection **SSRF** (`ALLOW_PRIVATE_SITE_URLS=false` en production), logs expurgés, audits **en ajout seul** (trigger SQL).
- Aucun secret dans le dépôt : `.env` est ignoré et généré par `scripts/init-env.mjs`.

## Structure

```
src/                      console React
  api/                    contrat ForgeApi (client.ts), types, mock isolant, http, hooks par agent
  pages/app/agent/        espace d’un agent : un fichier par onglet
  pages/app/forge.tsx     La Forge
  labels.ts               tous les libellés (FORGE_THEME.md)
server/
  drizzle/                migrations : extensions, schéma, isolation (RLS, rôle, fonctions)
  src/db/                 schéma Drizzle, client (scoped, asAgent), seed
  src/http/               routeur typé (contexte d’agent, rôles, OpenAPI), schémas Zod
  src/routes/             auth, plateforme, agents, espace agent, La Forge, admin, widget
  src/services/           accès, connaissances, évaluations, workflows, usage, docs, cycle de vie
  src/runtime/            exécution, vérifications, site externe, planificateur
  src/team/ + agents/     moteur de La Forge, capacités, prompt.md par rôle
  test/                   isolation, API, La Forge
scripts/                  init-env, smoke, e2e
FORGE_THEME.md            thème : libellés, états, équipe, palette, animation
```

## Contribuer

1. `node scripts/init-env.mjs && npm install && npm --prefix server install`
2. Développez avec `npm run server` (API, PGlite) et `npm run dev` (console).
3. Avant une PR, lancez : `npm run lint`, `npm run build`, `npm --prefix server run lint`, `npm --prefix server run typecheck`, `npm run test:server`.
4. Si vous modifiez le schéma, lancez `npm --prefix server run db:generate`. Toute nouvelle table d’agent porte `agent_id` et doit être ajoutée à la migration d’isolation (RLS et politiques). La suite d’isolation doit rester verte.
5. Les données d’un agent ne se lisent que dans `scoped()` ou `asAgent()`. N’appelez jamais `db` dans une transaction, et n’imbriquez pas de `scoped()`.
6. Le code, les noms d’API et les commentaires sont en anglais ; l’interface est en français. Tous les libellés passent par `src/labels.ts`.
7. N’ajoutez jamais d’autorisation décidée par un modèle : toute action passe par une vérification en code.

## Limites connues

- **Connecteurs MCP** : les outils exposés aux agents renvoient des réponses simulées réalistes. Le transport MCP réel reste à brancher dans `server/src/runtime/connectors.ts`.
- **Modèle** : sans `ANTHROPIC_API_KEY`, tout tourne en mode simulé. Les tests couvrent ce mode. Le chemin Anthropic suit le SDK officiel mais n’a pas été exécuté ici, faute de clé.
- **Embeddings** : le hachage de caractéristiques (256 dimensions) fonctionne hors ligne. Il est moins fin qu’un modèle d’embeddings ; l’interface `Embedder` permet d’en brancher un.
- **Fichiers** : le texte, le Markdown et les sites web sont indexés. Les PDF et Word sont stockés, mais pas encore extraits.
- **Emails** : aucun envoi. Les invitations produisent un lien à transmettre.
- **Évaluations** : un cas réussit si la réponse ne contient pas d’erreur et inclut les mots attendus. Ce n’est pas une notation sémantique.
- **Stockage S3 en Docker** : la stack utilise SeaweedFS, car les images MinIO ne sont plus publiées sur les registres publics. N’importe quel service S3 convient via `S3_*`.
- **Historique de démonstration** : le seed stocke environ une exécution réelle sur cinquante, ce qui réduit les volumes des graphiques.
