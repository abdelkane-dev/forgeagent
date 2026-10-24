# Règles pour les agents de code

## Contexte
ForgeAgent est un outil **open source pour développeurs** (pas de côté client, pas de commandes). Un développeur configure des agents IA dans une console, les teste, les intègre à ses projets (widget, API, SDK, MCP) et les supervise. Premier projet cible : l'application « Bonaco Pro » (agents de surveillance technique, anti-abus, administration).

## Stack recommandée pour le back-end
- Node 22 + TypeScript, Fastify, SQLite (Drizzle ORM) pour démarrer, PostgreSQL ensuite.
- Moteur d'agent avec l'API Anthropic (SDK officiel `@anthropic-ai/sdk`) : boucle d'utilisation d'outils, modèle configurable par variable d'environnement (défaut : `claude-sonnet-5-5`).
- Connecteurs d'outils via MCP (client MCP), délégation entre agents via A2A (plus tard).
- Traces OpenTelemetry pour chaque exécution (décision, appel d'outil, coût, durée).
- Auth simple (sessions ou clés API), rôles Admin / Éditeur / Lecteur.

## Règles à respecter
1. Ne pas casser le front : il doit continuer à fonctionner avec ses données fictives tant que l'API n'est pas branchée (mode démo).
2. Brancher le front progressivement : remplacer les tableaux globaux de `app.js` par des appels `fetch` vers l'API, une ressource à la fois.
3. Sécurité d'abord : validation humaine pour les actions sensibles, permissions par outil, plafonds de coût par agent et par projet, arrêt d'urgence global, protection contre l'injection de prompt, masquage des données personnelles, journal d'audit non modifiable.
4. Les secrets (clés API) sont chiffrés au repos et jamais renvoyés en clair par l'API.
5. Chaque agent est versionné (v1, v2…) avec retour arrière possible.
6. Écrire des tests pour le moteur d'agent et pour les garde-fous.
7. Langue de l'interface : français. Code, noms d'API et commentaires techniques : anglais.

## Modèle d'un agent
Un agent = déclencheurs + capacités (outils, connaissances, mémoire, skills) + sorties + règles (autonomie, permissions, plafonds).
Niveaux d'autonomie : `suggest_only`, `act_after_approval`, `act_alone_simple`.
Types : conversationnel, autonome, réactif, surveillance, données, contenu, développement, décision, perception, orchestrateur (chacun avec des sous-catégories, voir `SUB` dans `app.js`).
