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
- [ ] README.md (lancer, structure, brancher le back-end)

## Phase 2 — Design system et motion
- [x] Composants communs : PageHeader, Section, Panel, Row, Kbd, EmptyState, ErrorState, skeletons, Async, StatusDot, Tag, UnderlineTabs, CodeBlock (copier), LogStream (terminal live), ConfirmDialog (saisie du nom), Field/NativeSelect/SwitchRow/ChipGroup, ColumnChart, Meter, KpiStrip, HexLoader, LinkButton
- [x] Shell : sidebar, menu mobile (Sheet), lien d'évitement, bannière arrêt d'urgence, transitions de page
- [x] Palette ⌘K + raccourcis (G+lettre, C, T, ?, /) + dialogue d'aide

## Phase 3 — Pages
- [ ] Landing `/`
- [ ] Connexion `/login`
- [ ] Documentation `/docs`
- [ ] 404
- [ ] Tableau de bord `/app`
- [ ] Agents (liste, filtres, recherche) `/app/agents`
- [ ] Assistant de création (7 étapes) `/app/agents/new`
- [ ] Détail agent (aperçu, config, skills, déclencheurs, outils, mémoire, versions, logs, intégration, site externe) `/app/agents/:id`
- [ ] Workflows `/app/workflows`
- [ ] Skills `/app/skills`
- [ ] Connaissances `/app/knowledge`
- [ ] Modèles `/app/templates`
- [ ] Projets + détail `/app/projects(/:id)`
- [ ] Intégrations (snippets, site existant, application, MCP, clés API, webhooks) `/app/integrations`
- [ ] Environnement de test `/app/playground`
- [ ] Évaluations `/app/evals`
- [ ] Observabilité `/app/observability`
- [ ] Sécurité `/app/security`
- [ ] Journal d'audit `/app/audit`
- [ ] Coûts et usage `/app/usage`
- [ ] Équipe `/app/team`
- [ ] Paramètres `/app/settings`
- [ ] Notifications `/app/notifications`

## Phase 4 — Vérification
- [ ] `npm run build` sans erreur, `npm run lint` propre
- [ ] Parcours Playwright de chaque flux, liens morts corrigés
- [ ] Responsive 390 / 768 / 1440, performance

## Consommation (approx.)
- Phase 0–1 : ~160 k tokens (lecture du prototype, skills, scaffold, couche API)
