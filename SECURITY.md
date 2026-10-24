# Politique de sécurité

## Versions prises en charge

Seule la dernière version de la branche `main` reçoit des correctifs de sécurité.

## Signaler une faille

**N’ouvrez pas d’issue publique.** Utilisez l’onglet **Security › Report a vulnerability** du dépôt (signalement privé GitHub). Indiquez :

- la version ou le commit concerné ;
- les étapes pour reproduire ;
- l’impact estimé (fuite entre agents, élévation de rôle, contournement de la RLS…).

Nous accusons réception sous 72 heures et publions un avis de sécurité une fois le correctif disponible.

## Périmètre prioritaire

- Isolation entre agents : accès aux données d’un agent dont on n’est pas membre, contournement de la RLS, IDOR.
- Clés API, secrets chiffrés, sessions, OAuth (GitHub, Google).
- Injection de prompt menant à une action non autorisée par le code.
- SSRF via les vérifications de site, les webhooks ou l’indexation.
