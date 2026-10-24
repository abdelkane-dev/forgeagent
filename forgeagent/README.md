# ForgeAgent

Plateforme open source pour créer, tester, intégrer et superviser des agents IA, sans écrire le moteur.

Ce dépôt contient pour l'instant **le front-end complet (prototype cliquable, données fictives)**. Le back-end reste à construire : voir `PROMPT.md`, `AGENTS.md` et `docs/API.md`.

## Lancer le front-end

```bash
npx serve .      # puis ouvrir l'adresse affichée
```
Ou ouvrir `index.html` directement dans un navigateur.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Coque HTML (menu, zone principale, notification) |
| `styles.css` | Design system (thème clair et sombre via variables CSS) |
| `app.js` | Toute la logique : données fictives, vues (objet `V`), navigation (`go`, `render`) |
| `AGENTS.md` | Règles pour les agents de code (Antigravity, Claude Code, etc.) |
| `PROMPT.md` | Premier prompt à donner à l'agent pour construire le back-end |
| `docs/API.md` | Correspondance entre les données du front et les endpoints à créer |

## Pages (17 vues console + 2 publiques)

Publiques : `home`, `login`.
Console : `dash`, `agents` (fiche en 6 sous-pages), `create` (assistant en 6 étapes), `sandbox`, `projets` (+ page détail), `integr`, `skills`, `wf` (workflows, glisser-déposer), `kb`, `mk`, `bill`, `obs`, `secu`, `evals`, `audit`, `equipe`, `params` (4 sous-pages), plus `notif` et `search`.

## Principe du front

Chaque vue est une fonction `V.nom = () => "<html>"`. `go('vue')` change de page, `render()` redessine. Les données sont des tableaux globaux en haut de `app.js` (`A`, `PJ`, `TR`, `KD`…) : ce sont eux qu'il faudra remplacer par des appels API.
