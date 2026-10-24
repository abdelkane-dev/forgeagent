<div align="center">

<img src="docs/assets/logo.svg" alt="" width="84" height="84" />

# ForgeAgent

**Forgez, testez, intégrez et supervisez des agents IA propulsés par Claude, sur votre propre infrastructure.**
Chaque agent est un espace scellé : ses données, ses clés et ses coûts n’appartiennent qu’à lui.

[![CI](https://github.com/abdelkane-dev/forgeagent/actions/workflows/ci.yml/badge.svg)](https://github.com/abdelkane-dev/forgeagent/actions/workflows/ci.yml)
[![Licence : Apache 2.0](https://img.shields.io/badge/licence-Apache%202.0-orange.svg)](LICENSE)
![Node 22](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL + pgvector](https://img.shields.io/badge/PostgreSQL-RLS%20%2B%20pgvector-4169E1?logo=postgresql&logoColor=white)
![Claude](https://img.shields.io/badge/cerveau-Claude-D97757)

**[▶ Essayer la démo en ligne](https://abdelkane-dev.github.io/forgeagent/)** · [Démarrage rapide](#-démarrage-rapide) · [Fonctionnalités](#-fonctionnalités) · [Isolation](#-isolation-par-agent) · [La Forge](#-la-forge) · [Architecture](#-architecture) · [Contribuer](#-contribuer)

<img src="docs/assets/accueil.png" alt="Page d’accueil de ForgeAgent" width="100%" />

</div>

---

## ✦ Pourquoi ForgeAgent

Les équipes qui branchent des agents IA sur leurs produits se heurtent toujours aux mêmes murs : qui a le droit de modifier quel agent, où vont ses clés, que voit-il exactement, combien coûte-t-il, et comment prouver qu’il ne déborde pas sur le voisin. ForgeAgent répond à ces questions **dans la base de données elle-même**, puis construit autour une console complète.

- 🔒 **Isolation stricte** : PostgreSQL Row-Level Security sur les 29 tables d’agent ; un non-membre reçoit 404 sur chaque route.
- 🔥 **La Forge** : une équipe interne de six agents conçoit, contrôle, construit, teste et surveille vos agents, à votre place.
- 🧪 **Tests de régression** avant chaque version : une baisse de score bloque la publication.
- 🔌 **Intégration en une ligne** : widget, REST, SDK ou serveur MCP, avec une clé propre à chaque agent.
- 🏠 **Auto-hébergé** : vos clés Claude, vos données et vos journaux ne quittent jamais votre serveur.

<table>
  <tr>
    <td width="50%"><img src="docs/assets/la-forge.png" alt="La Forge : l’équipe interne" /><p align="center"><sub><b>La Forge</b> · l’équipe interne, ses modèles et ses échanges rejouables</sub></p></td>
    <td width="50%"><img src="docs/assets/test.png" alt="Environnement de test d’un agent" /><p align="center"><sub><b>Test et évaluation</b> · bac à sable, vérifications, scores</sub></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/assets/tableau-de-bord.png" alt="Tableau de bord" /><p align="center"><sub><b>Tableau de bord</b> · uniquement vos agents</sub></p></td>
    <td width="50%"><img src="docs/assets/espace-agent.png" alt="Équipe et accès d’un agent" /><p align="center"><sub><b>Équipe et accès</b> · rôles par agent, clés propres à l’agent</sub></p></td>
  </tr>
</table>

## 🚀 Démarrage rapide

> [!NOTE]
> Prérequis : **Node.js 22+** et **Docker** (Desktop ou Engine avec Compose v2).

```bash
git clone https://github.com/abdelkane-dev/forgeagent.git && cd forgeagent
node scripts/init-env.mjs        # crée .env avec des secrets aléatoires
docker compose up -d --build     # PostgreSQL (pgvector) + Redis + S3 + API + worker
npm install && npm run dev       # console sur http://localhost:5173
```

Ouvrez <http://localhost:5173/login> : les **comptes de démonstration** s’affichent avec leur mot de passe (`forgeagent-demo`) et un bouton **Entrer** pour se connecter en un clic.

| Compte | Rôle plateforme | Ce qu’il voit |
|---|---|---|
| `abdoul@bonaco.pro` | Administrateur | propriétaire de 4 agents, éditeur du 5ᵉ |
| `ines@bonaco.pro` | Membre | éditrice de 2 agents, propriétaire d’un 3ᵉ |
| `theo@bonaco.pro` | Membre | lecteur d’un seul agent |

> [!TIP]
> **Juste pour voir ?** La [démo en ligne](https://abdelkane-dev.github.io/forgeagent/) tourne dans le navigateur, sans serveur.
> **Sans Docker ?** `npm run dev:demo` lance la console seule, avec des données fictives et les mêmes règles d’isolation simulées.
> **Sans clé Claude ?** Le moteur tourne en mode **simulé**, déterministe et hors ligne. Ajoutez `ANTHROPIC_API_KEY` dans `.env` pour utiliser Claude.

L’API est documentée sur <http://localhost:8787/docs> (Swagger UI) et `/v1/openapi.json`.

<details>
<summary><b>Inscription et connexion (email, GitHub, Google / Gmail)</b></summary>

- **Email + mot de passe** : le premier compte devient administrateur ; ensuite `SIGNUP_MODE=open` (défaut) ouvre l’inscription aux simples membres, `SIGNUP_MODE=invite` la réserve aux invitations.
- **GitHub** : créez une OAuth App (*Settings › Developer settings › OAuth Apps*), URL de retour `http://localhost:8787/v1/auth/oauth/github/callback`, puis renseignez `GITHUB_CLIENT_ID` et `GITHUB_CLIENT_SECRET`.
- **Google (Gmail, Workspace)** : créez un *ID client OAuth* de type *Application Web* dans Google Cloud, URI de redirection `http://localhost:8787/v1/auth/oauth/google/callback`, puis renseignez `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.
- Redémarrez l’API : `docker compose up -d`. Tant qu’un fournisseur n’est pas configuré, la page de connexion le dit explicitement.

Garanties : état signé anti-CSRF, PKCE pour Google, adresses **vérifiées** seulement, redirection limitée à la console.

</details>

## ✨ Fonctionnalités

| | |
|---|---|
| **Espace agent en 10 onglets** | Aperçu · Connaissances et mémoire · Intégration · Test et évaluation · Workflows · Audit · Coûts et usage · Équipe et accès · Documentation · Paramètres |
| **Connaissances** | Textes, fichiers et sites indexés dans pgvector (index HNSW), recherche sémantique limitée à l’agent |
| **Mémoire** | Courte (par session) et longue, effaçable, avec durée de conservation |
| **Workflows** | Déclencheurs manuel, cron et webhook ; étapes modèle, condition, validation humaine, outil, sortie ; versions, reprise ×3 |
| **Évaluations** | Suites et cas, historique par version, rejeu de régression avant chaque publication |
| **Intégration** | Widget pour site existant, REST, SDK JS et Python, serveur MCP, webhooks signés, origines autorisées |
| **Coûts** | Tokens et dollars par source (exécutions, évaluations, workflows, La Forge), budgets jour et mois |
| **Audit** | Journal en ajout seul (trigger SQL), y compris chaque échange de La Forge et chaque accès de maintenance |
| **Plateforme** | Comptes, rôles plateforme, arrêt d’urgence, garde-fous globaux, journal de la plateforme |

## 🔒 Isolation par agent

```mermaid
flowchart LR
  U[Utilisateur] -->|session| R[Routeur /v1/agents/:agentId]
  K[Clé API de l’agent] --> R
  R -->|membre ? rôle ?| S["scoped(contexte)"]
  S -->|SET LOCAL ROLE forge_app<br/>app.mode · app.user_id · app.agent_id| DB[(PostgreSQL<br/>RLS forcée)]
  S --> ST[(S3 · agents/&lt;id&gt;/…)]
  S --> Q[[Redis · agent:&lt;id&gt;:…]]
```

- **La base décide.** L’API se connecte avec `forge_app`, un rôle ni super-utilisateur ni propriétaire. Chaque transaction déclare son contexte ; sans contexte, aucune ligne n’est visible. Même un bug applicatif ne peut pas lire l’agent voisin.
- **Rôles par agent** : `owner` (accès, clés, secrets, purge), `editor` (configure, teste, publie), `viewer` (consulte, teste). Le rôle plateforme `admin` ne donne que les métadonnées ; l’accès de maintenance est justifié et audité dans l’agent.
- **Secrets** chiffrés AES-256-GCM avec une clé **dérivée par agent** (HKDF) ; **clés API** hachées, liées à un seul agent.
- **Suppression** : export JSON, puis purge totale (lignes, vecteurs, fichiers, secrets, audit).
- **Prouvé par les tests** : la suite d’isolation appelle *chaque* route agent de l’OpenAPI en tant qu’étranger, vérifie l’IDOR, les vecteurs, les secrets, la purge et la RLS en SQL brut.

## 🔥 La Forge

« Forger un agent » confie la demande à une équipe interne. L’agent existe dès la première seconde (état **Démarrage**), le demandeur en est propriétaire, et tout le travail se fait dans ses murs.

| Nom | Rôle technique | Modèle | Capacités |
|---|---|---|---|
| Le Maître de Forge | orchestrator | Opus | `readRequest` |
| Le Dessinateur | architect | Opus | `readCatalog`, `readProject` |
| La Sentinelle | security | Opus | `readCatalog`, veto |
| Le Forgeron | builder | Sonnet | `configureAgentFromPlan` |
| Le Trempeur | tester | Sonnet | `runChecks`, `runSandbox`, `runEvaluation` |
| Le Veilleur de Feu | supervisor | Haiku → Sonnet sur anomalie | `readAgentHealth`, `readRecentErrors`, `notify` |

Chaque tâche reçoit un **jeton de capacité** signé, limité dans le temps et à un seul agent. Les échanges passent par BullMQ, sont écrits dans l’audit de l’agent et **rejouables** ; les tokens lui sont imputés. Limites d’étapes, détection de boucle, plafond de permissions fixé par le demandeur, validation humaine des actions sensibles.

## 🏗 Architecture

```mermaid
flowchart TB
  subgraph Console["Console · Vite + React 19 + Tailwind v4"]
    UI[Pages et espace agent] --> API[Contrat ForgeApi]
  end
  subgraph Serveur["API · Hono + Zod + Drizzle"]
    RT[Routes /v1 + OpenAPI] --> RUN[Runtime d’agent]
    RT --> WF[Workflows et évaluations]
    RT --> TEAM[La Forge]
  end
  API -->|cookie httpOnly| RT
  W[Worker BullMQ] --> TEAM
  W --> WF
  RUN --> LLM[Claude · SDK Anthropic]
  Serveur --> PG[(PostgreSQL + pgvector)]
  Serveur --> RD[(Redis)]
  Serveur --> S3[(S3 · SeaweedFS)]
  Site[Site client] -->|widget.js + clé publiable| RT
```

<details>
<summary><b>Structure du dépôt</b></summary>

```
src/                    console React : contrat ForgeApi (api/), espace agent (pages/app/agent/), La Forge, libellés
server/
  drizzle/              migrations : schéma, isolation (RLS, rôle, fonctions), identités OAuth
  src/db/               schéma Drizzle, client (scoped, asAgent, serial), seed
  src/http/             routeur typé (contexte d’agent, rôles, OpenAPI), schémas Zod
  src/routes/           auth, plateforme, agents, espace agent, La Forge, admin, widget
  src/services/         accès, connaissances, évaluations, workflows, usage, docs, OAuth, cycle de vie
  src/runtime/          exécution, vérifications, site externe, planificateur
  src/team/ · agents/   moteur de La Forge, capacités, prompt.md par rôle
  test/                 isolation, API, La Forge, OAuth
scripts/                init-env, smoke, e2e (Playwright)
FORGE_THEME.md          thème : libellés, états, équipe, palette, animation
```

</details>

## ⚙️ Configuration

Toutes les variables sont décrites dans [`.env.example`](.env.example). Les essentielles :

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Clé Claude (sinon mode simulé) |
| `DATABASE_URL` · `DATABASE_ADMIN_URL` · `APP_DB_PASSWORD` | Connexion applicative soumise à la RLS · connexion propriétaire pour les migrations · mot de passe de `forge_app` |
| `STORAGE_DRIVER` · `S3_*` | Fichiers des agents sur S3 ou disque local |
| `SIGNUP_MODE` · `GITHUB_*` · `GOOGLE_*` | Inscription et connexion |
| `SHOW_DEMO_ACCOUNTS` | Affiche les comptes de démo sur la page de connexion (**démo locale uniquement**) |
| `MODEL_*` | Modèle par rôle de La Forge |
| `KEY_PEPPER` · `ENCRYPTION_KEY` | Hachage des clés, chiffrement, jetons de capacité |

## 🛡 Sécurité

Mots de passe scrypt, sessions httpOnly hachées, CSRF par origine, limitation des tentatives, validation Zod de toutes les entrées, protection SSRF, logs expurgés, audits en ajout seul. Aucun secret dans le dépôt : `.env` est ignoré et généré par `scripts/init-env.mjs`.

Une faille ? Lisez [SECURITY.md](SECURITY.md) et signalez-la en privé.

## 🧪 Qualité

| Commande | Ce qu’elle vérifie |
|---|---|
| `npm run lint` · `npm run build` | Console : oxlint, TypeScript strict, build Vite |
| `npm --prefix server run typecheck` · `run lint` | API : TypeScript strict, oxlint |
| `npm run test:server` | 60 tests : isolation, routes, La Forge, OAuth (PGlite en mémoire) |
| `npm run test:e2e` | Parcours Playwright complet sur la vraie stack Docker |

La CI GitHub Actions rejoue lint, typecheck, tests et build sur chaque pull request.

## 🗺 Limites connues

- Les connecteurs MCP des agents renvoient des réponses simulées : le transport réel reste à brancher.
- Embeddings locaux (hachage, 256 dimensions) : une interface `Embedder` permet de brancher un vrai modèle.
- Les PDF et Word sont stockés mais pas encore extraits.
- Aucun envoi d’email : les invitations produisent un lien à transmettre.

## 🤝 Contribuer

Les contributions sont bienvenues : lisez [CONTRIBUTING.md](CONTRIBUTING.md). En bref : une branche par changement, commits conventionnels, tests verts, et toute nouvelle table d’agent porte `agent_id` avec sa politique RLS.

## 📄 Licence

[Apache 2.0](LICENSE) © les contributeurs de ForgeAgent.
