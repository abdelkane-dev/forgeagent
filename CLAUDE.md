# ForgeAgent — règles projet

Console pour créer, tester et superviser des agents IA (Claude), avec isolation stricte par agent.

## Reprise
- Lire `PROGRESS.md` (avancement, décisions de design), puis `ANALYSIS.md` et `BACKEND_PROGRESS.md` si on touche au serveur.
- Mettre à jour `PROGRESS.md` à chaque étape terminée.

## Stack
- Front (`src/`) : Vite + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui style **base-nova = Base UI** (utiliser `render`, pas `asChild`) + Motion 14 (`motion/react`) + TanStack Query + React Router.
- Back (`server/`) : Node 22 + TypeScript, Drizzle, PostgreSQL avec RLS + pgvector, tests Vitest.
- Thème et tokens : `src/index.css`, `FORGE_THEME.md`. Direction visuelle : `.taste-skill/direction.json`.
- `VITE_API_URL` absent ⇒ mode démo (`src/api/mock/`).

## Commandes
- Front : `npm run dev` · `npm run build` · `npm run lint` · `npm run test:e2e`
- Serveur : `npm --prefix server run dev|typecheck|lint|test` · migrations : `npm --prefix server run db:migrate`

## Règles
- Chaque route et chaque table d'agent respecte la RLS : un non-membre reçoit 404. Toute nouvelle table d'agent → politique RLS + test.
- Clés et secrets : uniquement par variables d'environnement (`.env.example` à jour), jamais commités.
- Avant commit : `npm run lint`, `npm run build`, et `npm --prefix server test` si le serveur est touché.
- Respecter `prefers-reduced-motion` (CSS global + `useReducedMotion`).
