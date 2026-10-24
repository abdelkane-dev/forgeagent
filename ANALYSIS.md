# ForgeAgent — Analyse du prototype source

Source : `../ForgeAgent — Créer et piloter vos agents IA.html` (prototype vanilla JS, ~44 Ko, design jeté).

## Pages / vues existantes
| Groupe | Vues |
|---|---|
| Public | Site vitrine (hero, terminal, bento 6 étapes, 10 familles, FAQ), Connexion / Inscription |
| — | Tableau de bord (premiers pas, 4 KPI, barres 7 j, « À traiter », activité) |
| Construire | Créer un agent (6 étapes), Agents (filtre par type, cartes, détail à onglets), Workflows (canvas drag, A2A, cron), Skills, Connaissances & mémoire, Modèles d'agents |
| Déployer | Projets (+ détail : agents rattachés, environnements, domaines, suppression), Intégrations (Widget, API, SDK, Connecteurs MCP, Site existant, Application), Environnement de test (chat + scénarios + vérifications), Évaluations (suites, v2/v3, déploiement progressif, red team) |
| Opérer | Observabilité (coût/agent, traces, waterfall de spans, export OTel), Sécurité (garde-fous, plafond, arrêt d'urgence, validations, passerelle IA), Journal d'audit (recherche, CSV), Coûts & usage |
| Organisation | Équipe & accès (matrice rôles), Paramètres (modèles, conformité, clés API, webhooks, notifications), Notifications, Recherche |

**Détail agent** : onglets Configuration (nom, autonomie, validation humaine, enregistrer, copier vers projet, arrêt), Versions (restaurer), Skills, Déclencheurs, Outils (lecture/écriture), Mémoire, Traces, Intégration.
**Assistant** : Identité (nom, mission, projet, ton, langue, persona) → Type (10 types + sous-catégories) → Capacités (14) → Permissions (autonomie 3 niveaux, plafond $, 5 garde-fous, rôles, personnes) → Intégration (6 canaux) → Test & création (résumé, 5 vérifications, progression).

## États existants
Vides : agents filtrés, validations, mémoire, notifications, recherche, traces agent. Chargement : barre de création, vérifications, indexation, évaluation. Succès : toasts. Erreur : trace en erreur, nom manquant. **Manquants** : skeletons, erreurs réseau, confirmations de suppression (supprimées sans dialogue), validation de formulaire inline.

## Ce qui manque (standard 2026)
- Palette de commandes ⌘K, raccourcis clavier, navigation par URL (routes partageables, retour navigateur).
- Données typées, couche API isolée, états async réels (loading/error/retry).
- Logs en streaming façon terminal, diff de versions, replay de trace.
- Sélection du modèle Claude par agent (Haiku / Sonnet / Opus) + estimation coût.
- Playground avec inspection des appels d'outils (tool calls) et du raisonnement.
- Confirmation destructive avec saisie du nom, undo sur toasts.
- Responsive mobile réel, a11y (focus, aria, reduced-motion), thème clair/sombre persistant.

## Idées ajoutées
1. Routes réelles (React Router) + ⌘K global (pages, agents, actions).
2. « Live tail » des logs d'un agent avec filtres par niveau.
3. Test d'interaction avec site externe : ping, latence, origine autorisée, événements reçus.
4. Diff de configuration entre versions.
5. Snippets multi-langages avec copie + clé masquée/révélable.
6. Statut système (instance, modèle, file d'attente) dans la barre latérale.

## Hors périmètre
Tout côté client final (commandes, clients) : exclu. Back-end : mocké dans `src/api/`.
