# FORGE_THEME — source unique de vérité (marque, libellés, palette, animation)

Règle d’or : **thème fort dans le visuel et la marque, vocabulaire clair dans les libellés.**
Les libellés vivent dans un seul fichier : `src/labels.ts`. Le code, la base, l’API et la documentation technique n’utilisent que des identifiants techniques.

## 1. Libellés de l’interface

| Clé (code) | Libellé affiché |
|---|---|
| `nav.dashboard` | Tableau de bord |
| `nav.agents` | Agents |
| `nav.skills` | Skills |
| `nav.test` | Test |
| `nav.integration` | Intégration |
| `nav.logs` | Logs |
| `nav.projects` | Projets |
| `nav.settings` | Paramètres |
| `nav.forge` | **La Forge** (vue de l’équipe interne) |
| `action.createAgent` | **Forger un agent** (bouton principal de création) |

Seuls « Forger un agent », « La Forge » et les noms des agents internes portent le thème. Aucun autre mot thématique dans les libellés, menus, boutons, erreurs ou la documentation.

Onglets de l’espace d’un agent : Aperçu · Connaissances et mémoire · Intégration · Test et évaluation · Workflows · Audit · Coûts et usage · Équipe et accès · Documentation · Paramètres.

## 2. États d’un agent

| Identifiant | Libellé | Traitement visuel | Animation (désactivée si `prefers-reduced-motion`) |
|---|---|---|---|
| `inactive` | Inactif | gris froid `--state-cold` | aucune |
| `starting` | Démarrage | braise `--state-ember` | respiration lente de la lueur (2,4 s) |
| `active` | Actif | orange en fusion `--state-molten` | léger scintillement de la lueur (3 s) |
| `validated` | Validé | lueur bleutée de trempe `--state-quench` | reflet qui traverse une fois au survol |
| `error` | Erreur | rouge fissuré `--state-crack` | fissure dessinée, pulsation lente |

Le libellé texte est **toujours** affiché à côté du témoin : jamais la couleur seule.

Cycle : `starting` (en construction ou en test) → `validated` (tests réussis, prêt) → `active` (en production) ; `inactive` = en pause ; `error` = exécution ou test en échec.

## 3. Équipe interne (affichage dans « La Forge » uniquement)

Le rôle technique est toujours visible à côté du nom.

| Identifiant | Nom affiché | Rôle visible | Devise | Accent | Blason |
|---|---|---|---|---|---|
| `orchestrator` | Le Maître de Forge | Orchestrateur | Chaque pièce à sa place. | `--crest-amber` | enclume couronnée |
| `architect` | Le Dessinateur | Architecte | Mesurer deux fois, forger une fois. | `--crest-brass` | compas |
| `builder` | Le Forgeron | Constructeur | Le métal suit le plan. | `--crest-ember` | marteau |
| `security` | La Sentinelle | Sécurité | Rien ne passe sans contrôle. | `--crest-steel` | bouclier et œil |
| `tester` | Le Trempeur | Testeur | L’épreuve révèle la lame. | `--crest-quench` | goutte de trempe |
| `supervisor` | Le Veilleur de Feu | Superviseur | Le feu ne dort jamais. | `--crest-fire` | flamme veillée |

## 4. Modèles par rôle (variables d’environnement, jamais en dur)

| Variable | Défaut |
|---|---|
| `MODEL_ORCHESTRATOR` | claude-opus-5-5 |
| `MODEL_ARCHITECT` | claude-opus-5-5 |
| `MODEL_SECURITY` | claude-opus-5-5 |
| `MODEL_BUILDER` | claude-sonnet-5-5 |
| `MODEL_TESTER` | claude-sonnet-5-5 |
| `MODEL_SUPERVISOR` | claude-haiku-5-5 |
| `MODEL_SUPERVISOR_ESCALATION` | claude-sonnet-5-5 (utilisé dès qu’une anomalie est détectée) |

## 5. Palette (tokens dans `src/index.css`)

Sombre par défaut.

| Token | Sombre | Clair | Usage |
|---|---|---|---|
| `--background` | #0c0a09 charbon | #f6f2ed | sol |
| `--card` | #161311 | #ffffff | surfaces |
| `--raised` | #1f1a17 | #ffffff | surfaces flottantes |
| `--foreground` | #f3ede7 | #1a1410 | texte |
| `--muted-foreground` | #a89e95 | #6b5f55 | texte secondaire (≥ 4,5:1) |
| `--ember` | #ff7a1a braise | #c2410c | accent, action principale, focus |
| `--ember-ink` | #140a03 | #ffffff | texte sur braise |
| `--amber` | #ffb347 | #b45309 | lueur secondaire |
| `--state-cold` | #8b9099 | #6b7280 | Inactif |
| `--state-ember` | #e8590c | #c2410c | Démarrage |
| `--state-molten` | #ff8c2b | #ea580c | Actif |
| `--state-quench` | #7cb7ff | #2563eb | Validé |
| `--state-crack` | #ef4444 | #dc2626 | Erreur |
| `--crest-amber` `--crest-brass` `--crest-ember` `--crest-steel` `--crest-quench` `--crest-fire` | #ffb347 #d9b26b #ff7a1a #9aa6b2 #7cb7ff #ff5a36 | versions assombries | accents des blasons |

Contraste et lisibilité priment toujours sur l’effet : texte courant ≥ 4,5:1, aucun texte posé sur une lueur animée.

## 6. Animation (Motion)

- **Lueur de métal en fusion** sur les actions clés (« Forger un agent », publier, activer) : halo `--ember` animé au survol, statique au repos.
- **Étincelles et particules** : sur la landing (hero) et à la réussite d’une création ; 24 particules au plus, transform/opacity uniquement, coupées hors écran.
- **Scintillement de chaleur** : distorsion légère au-dessus du hero de la landing (filtre SVG `feTurbulence` animé), uniquement sur la décoration, jamais sur du texte.
- Durées : 120 / 200 / 360 ms pour l’interface ; 2–3 s pour les respirations d’état.
- `prefers-reduced-motion: reduce` ⇒ particules, scintillement et respirations désactivés ; les états restent lisibles par la couleur, l’icône et le texte.

## 7. Marque

- Logo : enclume et marteau en SVG (`src/components/brand/logo.tsx`, `public/favicon.svg`), braise sur charbon.
- Nom : ForgeAgent.
