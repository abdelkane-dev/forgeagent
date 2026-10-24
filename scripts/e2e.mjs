// End-to-end journey through the real stack: console (Vite) + API (docker compose or server dev).
// Forge an agent with the internal team, feed its knowledge, test it, give it a widget key, connect the
// demo site, talk to it through the widget, send a console → site event, read its logs and audit,
// then sign in as another user and check that the agent is invisible to them.
// Usage: npm run test:e2e   (CONSOLE_URL, API_URL, E2E_EMAIL, E2E_PASSWORD to override)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const CONSOLE = process.env.CONSOLE_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://localhost:8787'
const EMAIL = process.env.E2E_EMAIL ?? 'abdoul@bonaco.pro'
const PASSWORD = process.env.E2E_PASSWORD ?? 'forgeagent-demo'
const OUT = 'e2e-artifacts'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: process.env.HEADED !== '1' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })
const page = await context.newPage()
page.setDefaultTimeout(20_000)
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

let step = 0
const run = async (label, fn) => {
  step++
  const t0 = Date.now()
  try {
    await fn()
    console.log(`✓ ${step}. ${label} (${Date.now() - t0} ms)`)
  } catch (e) {
    console.log(`✗ ${step}. ${label}\n   ${e.message.split('\n')[0]}`)
    await page.screenshot({ path: `${OUT}/failure-${step}.png` })
    await browser.close()
    process.exit(1)
  }
}

let agentId = ''
let pubKey = ''

const signIn = async (email) => {
  await page.goto(`${CONSOLE}/login`)
  await page.locator('#l-email').fill(email)
  await page.locator('#l-pass').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL(/\/app$/)
  await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor()
}

await run('connexion à la console', () => signIn(EMAIL))

await run('forger un agent avec La Forge (agent en Démarrage puis Validé)', async () => {
  await page.goto(`${CONSOLE}/app/agents/new`)
  await page.locator('#f-brief').fill('Surveille les erreurs 5xx et la latence de Bonaco Pro, ouvre un ticket et alerte l’équipe. Ne redémarre jamais un service.')
  await page.locator('form').getByRole('button', { name: 'Forger un agent' }).click()
  await page.waitForURL(/\/app\/agents\/agt_[a-z0-9]+\?tab=overview/, { timeout: 30_000 })
  agentId = page.url().match(/agt_[a-z0-9]+/)[0]
  await page.locator('header').getByText('Validé', { exact: true }).waitFor({ timeout: 60_000 })
  await page.screenshot({ path: `${OUT}/01-forged-agent.png` })
})

await run('l’audit de l’agent contient les échanges de l’équipe', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=audit`)
  await page.getByText('team.request.done').first().waitFor()
})

await run('activer l’agent', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=overview`)
  await page.getByRole('button', { name: 'Activer' }).click()
  await page.locator('header').getByText('Actif', { exact: true }).waitFor()
})

await run('ajouter une connaissance et la retrouver par recherche sémantique', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=knowledge`)
  await page.locator('#k-name').fill('runbook.md')
  await page.locator('#k-content').fill('En cas d’erreur 5xx, ouvrir un ticket de gravité haute et prévenir #incidents.')
  await page.getByRole('button', { name: 'Indexer' }).click()
  await page.getByText(/1 extrait/).first().waitFor({ timeout: 30_000 })
  await page.getByLabel('Question').fill('que faire en cas d’erreur 5xx')
  await page.getByRole('button', { name: 'Chercher', exact: true }).click()
  await page.getByText('runbook.md').nth(1).waitFor()
})

await run('tester l’agent en environnement de test', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=tests`)
  await page.getByRole('button', { name: 'Erreur 500 sur /api/invoices' }).click()
  await page.getByText(/Analyse terminée/).first().waitFor({ timeout: 30_000 })
  await page.screenshot({ path: `${OUT}/02-test.png` })
})

await run('créer la clé publiable de cet agent', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=access`)
  await page.locator('#k-name').fill('Widget E2E')
  await page.locator('#k-scope').selectOption('publishable')
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  pubKey = (await page.locator('code', { hasText: 'fa_pub_' }).textContent()).trim()
})

const demoUrl = () => `${API}/demo-site?agent=${agentId}&key=${pubKey}`

await run('relier le site de démo (origine autorisée, widget détecté)', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=integration`)
  await page.locator('#i-name').fill('Site de démo')
  await page.locator('#i-url').fill(demoUrl())
  await page.getByRole('button', { name: 'Relier', exact: true }).click()
  await page.getByText(new URL(API).origin, { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Vérifier' }).click()
  await page.getByText(/Connecté/).first().waitFor({ timeout: 20_000 })
})

const site = await context.newPage()
await run('dialoguer avec l’agent via le widget du site', async () => {
  await site.goto(demoUrl())
  await site.getByRole('button', { name: 'Ouvrir l’assistant' }).click()
  await site.getByLabel('Message').fill('Erreur 500 sur la page facturation')
  await site.getByLabel('Message').press('Enter')
  await site.locator('.m.a').filter({ hasText: /\S/ }).last().waitFor({ timeout: 30_000 })
  await site.screenshot({ path: `${OUT}/03-demo-site-widget.png` })
})

await run('envoyer un événement de la console au site (ping → pong)', async () => {
  await page.bringToFront()
  await page.getByLabel('Événement').selectOption('ping')
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
  await page.getByText(/pong depuis/).waitFor({ timeout: 15_000 })
})

await run('voir les logs de cet agent', async () => {
  await page.goto(`${CONSOLE}/app/logs?agent=${agentId}`)
  await page.getByRole('log').getByText(/widget|site/).first().waitFor({ timeout: 15_000 })
  await page.screenshot({ path: `${OUT}/04-logs.png` })
})

await run('La Forge affiche la demande et l’équipe', async () => {
  await page.goto(`${CONSOLE}/app/forge`)
  await page.getByRole('heading', { name: 'Le Maître de Forge' }).waitFor()
  await page.getByRole('button', { name: /construction/ }).first().click()
  await page.getByLabel('Échanges dans l’ordre').getByText('request.done').waitFor()
  await page.screenshot({ path: `${OUT}/05-forge.png`, fullPage: true })
})

await run('un autre utilisateur ne voit pas cet agent', async () => {
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.waitForURL(/\/login/)
  await signIn('theo@bonaco.pro')
  await page.goto(`${CONSOLE}/app/agents`)
  await page.getByRole('link', { name: 'Assistant d’administration' }).first().waitFor()
  if (await page.getByText('Gardien technique').count()) throw new Error('Théo voit un agent dont il n’est pas membre')
  await page.goto(`${CONSOLE}/app/agents/${agentId}`)
  await page.getByText('Agent introuvable').waitFor()
})

await browser.close()
if (errors.length) {
  console.log(`✗ erreurs JavaScript dans la page :\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log(`\nParcours complet réussi. Captures dans ${OUT}/`)
