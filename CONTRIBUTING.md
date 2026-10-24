# Contribuer à ForgeAgent

Merci de votre intérêt. Ce guide tient en une page : lisez-le avant d’ouvrir une pull request.

## Mettre en place

```bash
node scripts/init-env.mjs
npm install && npm --prefix server install
npm run server   # API sans Docker (PGlite, file en mémoire)
npm run dev      # console sur http://localhost:5173
```

Ou la stack complète : `docker compose up -d --build` puis `npm run dev`.

## Avant une pull request

```bash
npm run lint && npm run build
npm --prefix server run lint && npm --prefix server run typecheck
npm run test:server
```

La CI rejoue ces commandes ; une pull request rouge n’est pas relue.

## Règles du projet

1. **Une branche par changement**, partie de `main`, et des [commits conventionnels](https://www.conventionalcommits.org/fr/) (`feat:`, `fix:`, `docs:`…).
2. **Isolation d’abord.** Toute nouvelle table d’agent porte `agent_id` et reçoit sa politique RLS dans une migration. Les données d’un agent ne se lisent que dans `scoped()` ou `asAgent()`. N’appelez jamais `db` dans une transaction et n’imbriquez pas de `scoped()`. La suite `server/test/isolation.test.ts` doit rester verte.
3. **Schéma** : `npm --prefix server run db:generate` crée une nouvelle migration. Ne modifiez jamais une migration publiée.
4. **Aucune autorisation décidée par un modèle** : toute action passe par une vérification en code.
5. **Langues** : code, noms d’API et commentaires en anglais ; interface en français. Tous les libellés passent par `src/labels.ts` (voir `FORGE_THEME.md`).
6. **Aucun secret** dans le dépôt, les tests ou les captures.

## Signaler un bug ou proposer une idée

Utilisez les modèles d’issue. Pour une faille de sécurité, suivez [SECURITY.md](SECURITY.md) : jamais d’issue publique.
