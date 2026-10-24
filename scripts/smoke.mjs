// End-to-end smoke test against a running API (docker compose or npm run dev in server/).
// Usage: node scripts/smoke.mjs [baseUrl] [email] [password]
const base = process.argv[2] ?? 'http://localhost:8787'
const email = process.argv[3] ?? 'abdoul@bonaco.pro'
const password = process.argv[4] ?? 'forgeagent-demo'
const origin = 'http://localhost:5173'
const ok = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) process.exitCode = 1
}

const login = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email, password }) })
ok(login.status === 200, `connexion ${email}`)
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
const api = async (method, path, body) => {
  const r = await fetch(`${base}/v1${path}`, { method, headers: { cookie, origin, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, json: r.status === 204 ? null : await r.json() }
}

const agents = await api('GET', '/agents')
ok(agents.status === 200 && agents.json.length >= 5, `agents : ${agents.json.length}`)
const run = await api('POST', '/agents/agt_8f3k2/run', { input: 'Erreur 500 sur /api/invoices', sandbox: true })
ok(run.status === 200 && run.json.status === 'ok', `exécution en bac à sable (${run.json.meta?.tokens} tokens)`)
const req = await api('POST', '/internal-team/requests', { brief: 'Surveille les erreurs et la latence de Bonaco Pro et alerte l’équipe.', projectId: 'prj_bonaco', maxActions: ['Lire les journaux applicatifs', 'Créer un ticket', 'Envoyer une alerte'], autonomyCeiling: 'act_after_approval' })
ok(req.status === 201, `demande à l’équipe interne ${req.json.id}`)
let detail
for (let i = 0; i < 60; i++) {
  detail = await api('GET', `/internal-team/requests/${req.json.id}`)
  if (detail.json.request.status !== 'running') break
  await new Promise((r) => setTimeout(r, 500))
}
ok(detail.json.request.status === 'done', `demande traitée par le worker : ${detail.json.request.status}, ${detail.json.tasks.length} tâches, ${detail.json.events.length} événements`)
const logs = await api('GET', '/logs')
ok(logs.status === 200 && logs.json.length > 0, `journal : ${logs.json.length} lignes`)
const docs = await fetch(`${base}/docs`)
ok(docs.status === 200, 'Swagger UI /docs')
