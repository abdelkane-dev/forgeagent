# ForgeAgent : front-end

Console open source pour **créer, tester, intégrer et superviser des agents IA** dont le cerveau est l’API Claude. Outil pour développeurs : aucune partie client final. Premier projet cible : Bonaco Pro.

Ce dépôt contient **uniquement le front-end**. Sans back-end, il tourne en **mode démo** avec des données fictives réalistes, et chaque bouton fonctionne.

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans dist/
npm run preview    # sert le build
npm run lint       # oxlint
```

Node 20.19+ ou 22+ recommandé.

## Stack

| | |
|---|---|
| Build | Vite 8, TypeScript 6 |
| UI | React 19, Tailwind CSS v4, shadcn/ui (style `base-nova`, primitives **Base UI** : utiliser la prop `render`, pas `asChild`) |
| Motion | Motion 14 (`motion/react`), `prefers-reduced-motion` respecté |
| Données | TanStack Query 5 |
| Routage | React Router 7 |
| Icônes / typo | lucide-react, Schibsted Grotesk + JetBrains Mono (code uniquement) |

## Structure

```
src/
  api/                  ← toute la couche données (à brancher sur le back-end)
    types.ts            types du domaine (Agent, Project, Trace…)
    client.ts           contrat ForgeApi : la seule interface entre UI et back-end
    mock/               implémentation en mémoire (mode démo) + données de démo (seed.ts)
    http.ts             implémentation REST (fetch, /v1/…, cookie de session)
    hooks.ts            hooks React Query (useAgents, useAction…)
    index.ts            choisit mock ou http selon VITE_API_URL
  app/                  shell : sidebar, menu mobile, palette ⌘K, raccourcis, navigation
  components/
    ui/                 composants shadcn (générés, peu modifiés)
    common/             design system ForgeAgent : PageHeader, Panel, états vide/erreur/chargement,
                        CodeBlock, LogStream, ConfirmDialog, UnderlineTabs, graphiques…
    landing/            animations et démo live de la page d’accueil
    brand/logo.tsx      logo (hexagone « lingot » + F)
  lib/                  libellés français, formatage, thème, snippets d’intégration
  pages/                une page par route (chargées à la demande)
    app/                console : dashboard, agents, assistant, détail, workflows, skills,
                        connaissances, modèles, projets, intégrations, test, évaluations,
                        observabilité, sécurité, audit, coûts, équipe, paramètres, notifications
  index.css             tokens du design system (couleurs, rayons, motion), thème clair et sombre
public/                 favicon.svg, logo.svg
forgeagent/             ancien prototype et notes (AGENTS.md : règles pour le back-end), conservé pour référence
```

## Brancher le back-end

1. Créez `.env.local` :
   ```bash
   VITE_API_URL=http://localhost:8787
   ```
   Sans cette variable, l’app reste en mode démo.
2. Implémentez côté serveur les routes listées dans `src/api/http.ts` (préfixe `/v1`). Elles doivent renvoyer les types de `src/api/types.ts`. Le tableau complet est aussi dans la doc intégrée : `/docs/api`.
3. Authentification : cookie de session (`credentials: 'include'`). Ne mettez jamais de clé API dans le front.
4. Logs en direct : Server-Sent Events sur `GET /v1/logs/stream?agentId=…` (un `LogEntry` JSON par message).
5. Les écrans n’appellent jamais `fetch` directement : changer un chemin ou un format se fait dans `src/api/http.ts` uniquement.

Pour brancher progressivement, une ressource à la fois, vous pouvez composer les deux implémentations dans `src/api/index.ts` :

```ts
export const api: ForgeApi = { ...mockApi, agents: httpApi.agents, projects: httpApi.projects }
```

Les règles côté serveur (secrets chiffrés, validation humaine, plafonds, audit en ajout seul, OpenTelemetry) sont décrites dans `forgeagent/AGENTS.md`.

## Design

- Landing : direction « One motif ». Le lingot hexagonal du logo devient le motif unique : grande forme cobalt rognée dans le hero, bouton principal, loader, puces et statuts.
- Console : style « Achromatic ledger ». La chrome est en encre, le cobalt est réservé à la donnée principale, au focus et au signal « en direct ». Pas d’ombre au repos, pas de dégradé, pas de verre.
- Thème sombre par défaut, thème clair et système dans Paramètres (persistés dans `localStorage`).
- Accessibilité : focus visibles, lien d’évitement, onglets au clavier, dialogues accessibles, contrastes AA, mouvement réduit.

## Raccourcis

`Ctrl/⌘ K` palette · `/` rechercher · `C` créer un agent · `T` thème · `G` puis `D/A/W/K/P/I/T/O/S/U` navigation · `?` aide.

## Outils de test (mode démo)

- **Paramètres › Développeur › Simuler des erreurs réseau** : toutes les requêtes échouent, pour voir les états d’erreur.
- Réinitialiser les préférences locales depuis le même écran.
