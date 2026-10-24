# PROGRESS — refonte front-end ForgeAgent

Reprise : lire ce fichier, puis `ANALYSIS.md`. Lancer `npm install && npm run dev`.
Légende : [x] fini · [~] en cours · [ ] à faire

## Décisions de design
- Stack : Vite 8 + React 19 + TS 6 + Tailwind v4 + shadcn/ui (style base-nova = **Base UI**, pas Radix : utiliser `render`, pas `asChild`) + Motion 14 + TanStack Query + React Router 7. GSAP non nécessaire.
- Direction landing (taste-skill, seed 13485388) : **« One motif »**. Idée : *le lingot hexagonal de la forge (le logo) devient le motif unique* : bouton principal `.hex-x`, loader `HexLoader`, puces/statuts `.hex`, grande forme cobalt rognée dans le hero, bande de séparation.
- Direction console (taste-skill app, seed 1398961199) : **« Achromatic ledger »**. Chrome en encre, action principale en encre (blanc en sombre), cobalt seulement sur la donnée principale, le focus et le signal « live ». Rayons 8/6 px, pas d'ombre au repos (seulement menus/dialogues), pas de dégradé ni de verre.
- Typo : Schibsted Grotesk Variable (une seule famille) + JetBrains Mono **uniquement** pour code, IDs, logs, terminal.
- Couleurs : tokens dans `src/index.css` (`:root` clair, `.dark` sombre par défaut). Clair : sol #eef0f3, encre #0b0c0e, cobalt #1f2de6. Sombre : sol #0b0c0e, cartes #131519, cobalt #6470ff.
- Motion : transitions de page (fade + 8 px), indicateur d'onglet à ressort, barres de graphiques, entrées au scroll sur la landing. `prefers-reduced-motion` respecté (CSS global + `useReducedMotion`).
- Données : `src/api/` (types, `client.ts` = contrat `ForgeApi`, `mock/` en mémoire, `http.ts` REST). `VITE_API_URL` absent ⇒ mode démo. Erreurs simulables : `localStorage["fa:simulate-errors"]="1"` (Paramètres › Développeur).
- Formulaires : `<select>` natif stylé (`NativeSelect`) plutôt que le Select Base UI (plus simple, accessible, mobile).

## Phase 0 — Analyse
- [x] ANALYSIS.md

## Phase 1 — Fondations
- [x] Scaffold Vite/React/TS, Tailwind v4, shadcn (base-nova), alias `@/`
- [x] Tokens couleurs/typo/rayons/ombres/motion, thème sombre + clair persistant (`fa:theme`)
- [x] Couche API typée + mock + transport HTTP + hooks React Query
- [x] Logo SVG + favicon (`public/favicon.svg`, `public/logo.svg`, `LogoMark`)
- [x] README.md (lancer, structure, brancher le back-end)

## Phase 2 — Design system et motion
- [x] Composants communs : PageHeader, Section, Panel, Row, Kbd, EmptyState, ErrorState, skeletons, Async, StatusDot, Tag, UnderlineTabs, CodeBlock (copier), LogStream (terminal live), ConfirmDialog (saisie du nom), Field/NativeSelect/SwitchRow/ChipGroup, ColumnChart, Meter, KpiStrip, HexLoader, LinkButton
- [x] Shell : sidebar, menu mobile (Sheet), lien d'évitement, bannière arrêt d'urgence, transitions de page
- [x] Palette ⌘K + raccourcis (G+lettre, C, T, ?, /) + dialogue d'aide

## Phase 3 — Pages
- [x] Landing `/`
- [x] Connexion `/login`
- [x] Documentation `/docs`
- [x] 404
- [x] Tableau de bord `/app`
- [x] Agents (liste, filtres, recherche) `/app/agents`
- [x] Assistant de création (7 étapes, validation, brouillon auto, modèles) `/app/agents/new`
- [x] Détail agent (aperçu, config, skills, déclencheurs, outils, mémoire, versions, logs, intégration, site externe) `/app/agents/:id`
- [x] Workflows `/app/workflows`
- [x] Skills `/app/skills`
- [x] Connaissances `/app/knowledge`
- [x] Modèles `/app/templates`
- [x] Projets + détail `/app/projects(/:id)`
- [x] Intégrations (snippets, site existant, application, MCP, clés API, webhooks) `/app/integrations`
- [x] Environnement de test `/app/playground`
- [x] Évaluations `/app/evals`
- [x] Observabilité `/app/observability`
- [x] Sécurité `/app/security`
- [x] Journal d'audit `/app/audit`
- [x] Coûts et usage `/app/usage`
- [x] Équipe `/app/team`
- [x] Paramètres `/app/settings`
- [x] Notifications `/app/notifications`

## Phase 4 — Vérification
- [x] `npm run build` sans erreur, `npm run lint` propre
- [x] Parcours Playwright de chaque flux, liens morts corrigés
- [x] Responsive 390 / 768 / 1440, performance

## Vérification (Phase 4) — résultats
- `npm run build` : OK, aucun avertissement (vendors découpés : react, ui, motion, router, query, icons).
- `npm run lint` (oxlint) : 0 avertissement. `tsc -b` : 0 erreur.
- Playwright CLI : 30 routes (h1 présent, pas de débordement horizontal), 46 liens internes (0 mort), 0 erreur console.
- Flux de bout en bout OK : création d’agent (validation + 7 étapes + redirection), suppression avec saisie du nom, validation humaine, arrêt d’urgence, clé API (secret une fois), bac à sable (injection bloquée), création de projet, palette ⌘K, raccourci G+A, état d’erreur réseau + Réessayer.
- Inspecteur taste-skill (landing, 1440/768/390) : 0 FAIL, 5 WARN défendus : pas de photo ni de vidéo (le sujet est un logiciel : les fragments d’interface tiennent lieu d’images), tailles de police issues des fragments d’UI, légendes secondaires en gris, marge droite, respiration sous le hero.
- Responsive contrôlé à 390 / 768 / 1440, thème clair et sombre.

## Phase 5 — Thème forge et front v2 (isolation par agent)
- [x] `FORGE_THEME.md` source unique ; libellés centralisés dans `src/labels.ts` (Tableau de bord, Agents, Skills, Test, Intégration, Logs, Projets, Paramètres, « Forger un agent », La Forge)
- [x] Palette charbon et braise (sombre par défaut), lueur en fusion sur les actions clés, logo enclume et marteau, favicon
- [x] États Inactif, Démarrage, Actif, Validé, Erreur : rendu métal (gris froid, braise, orange en fusion, bleu de trempe, rouge fissuré), libellé toujours visible
- [x] Équipe : 6 blasons SVG, devises, couleurs d’accent, rôle technique toujours affiché
- [x] Landing : chaleur (feTurbulence) et étincelles (Motion), coupées si `prefers-reduced-motion`
- [x] Espace agent à 10 onglets, La Forge, Test / Intégration / Logs par agent, Paramètres (compte, plateforme, administration)
- [x] Anciennes pages globales contraires à l’isolation retirées (workflows, connaissances, évaluations, observabilité, sécurité, audit, usage, équipe, équipe interne) ; anciennes adresses redirigées
- [x] Build, lint et parcours Playwright v2 verts (voir BACKEND_PROGRESS.md)

## Pistes après livraison
- Remplacer les liens GitHub `forgeagent/forgeagent` par l’URL réelle du dépôt.
- Ajouter des tests unitaires (Vitest) sur `src/api/mock` et les hooks une fois le back-end défini.

## Consommation (approx. : `/cost` non disponible dans cette session, estimation du contexte)
- Phase 0–1 : ~160 k tokens (lecture du prototype, skills, scaffold, couche API)
- Phase 2–3 : ~170 k tokens (design system, 24 pages)
- Phase 4 : ~45 k tokens (build, lint, Playwright, inspecteur, corrections)
