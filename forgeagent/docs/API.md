# Correspondance front → API

Les données fictives de `app.js` indiquent la forme des ressources. Endpoints à créer (préfixe `/v1`) :

| Variable du front | Ressource | Endpoints |
|---|---|---|
| `A` | Agents | `GET/POST /agents`, `GET/PATCH/DELETE /agents/:id`, `POST /agents/:id/pause`, `GET /agents/:id/versions`, `POST /agents/:id/versions/:v/restore`, `POST /agents/:id/run` |
| `PJ` | Projets | `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/agents` |
| `S.d` (assistant) | Création | `POST /agents` (corps = identité, type, sous-type, capacités, permissions, intégrations) |
| `S.chat` | Bac à sable | `POST /agents/:id/sandbox` (réponse + trace), `POST /agents/:id/checks` |
| `TR`, `SP` | Traces | `GET /traces`, `GET /traces/:id` (spans), export OpenTelemetry |
| `SK` | Skills | `GET/POST /skills`, `POST /agents/:id/skills` |
| `KD`, `KM` | Connaissances et mémoire | `GET/POST/DELETE /knowledge`, `GET/DELETE /agents/:id/memory` |
| `W.n` | Workflows | `GET/PUT /workflows/:id` (nœuds avec position x, y), `POST /workflows/:id/test` |
| `AP` | Validations humaines | `GET /approvals`, `POST /approvals/:id/approve`, `POST /approvals/:id/reject` |
| `GR` | Garde-fous | `GET/PUT /guardrails`, `POST /kill-switch` |
| `EV` | Évaluations | `GET/POST /evals`, `POST /evals/:id/run`, `POST /deployments` (progressif) |
| `AL` | Audit | `GET /audit?q=` (lecture seule) |
| `KEYS`, `WH` | Clés et webhooks | `GET/POST/DELETE /api-keys`, `GET/POST/DELETE /webhooks` |
| `TP` | Modèles d'agents | `GET /templates` |
| `PERM` | Équipe et droits | `GET/PUT /roles`, `POST /members/invite` |
| `CODE`, `MCP` | Intégrations | `GET /agents/:id/embed`, `GET/POST /connectors` (MCP) |
