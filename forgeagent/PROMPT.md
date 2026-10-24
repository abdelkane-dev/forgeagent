# Premier prompt à donner à l'agent (Antigravity)

> Lis `README.md`, `AGENTS.md` et `docs/API.md`, puis explore `app.js`.
> Objectif : construire le back-end de ForgeAgent dans un dossier `server/` (Node 22, TypeScript, Fastify, SQLite avec Drizzle) et brancher le front dessus.
>
> 1. Commence par me proposer un plan en étapes et attends ma validation.
> 2. Crée le schéma de base de données et les endpoints de `docs/API.md`, en commençant par agents, projets et clés API.
> 3. Construis le moteur d'agent avec le SDK Anthropic : boucle d'outils, niveaux d'autonomie, validation humaine, plafonds de coût, arrêt d'urgence, traces.
> 4. Remplace les données fictives du front par des appels API, une ressource à la fois, en gardant un mode démo.
> 5. Ajoute des tests pour le moteur et les garde-fous, puis un `docker-compose.yml` pour tout lancer.
>
> Ne casse pas le front existant. Dis-moi ce que tu as testé à chaque étape.
