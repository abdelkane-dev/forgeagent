// End-to-end journey through the real stack: console (Vite) + API (docker compose or server dev).
// Create an agent, add a skill, test it, integrate it into the demo site, talk to it through the widget,
// send a console → site event, read the logs, and ask the internal team for an agent.
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

const name = `Agent E2E ${new Date().toISOString().slice(11, 19)}`
let agentId = ''
let pubKey = ''

await run('connexion à la console', async () => {
  await page.goto(`${CONSOLE}/login`)
  await page.locator('#l-email').fill(EMAIL)
  await page.locator('#l-pass').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL(/\/app$/)
  await page.getByRole('heading', { name: 'Tableau de bord' }).waitFor()
})

await run('créer un agent avec l’assistant en 7 étapes', async () => {
  await page.goto(`${CONSOLE}/app/agents/new`)
  await page.locator('#name').fill(name)
  await page.locator('#mission').fill('Surveille les erreurs de Bonaco Pro et ouvre un ticket. Ne redémarre jamais un service.')
  await page.getByRole('button', { name: 'Bonaco Pro' }).waitFor()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByRole('radio', { name: /^Surveillance/ }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByLabel('Accès à Journaux applicatifs').selectOption('read')
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByRole('group', { name: 'Actions autorisées' }).getByRole('button', { name: 'Lire les journaux applicatifs' }).click()
  await page.getByRole('group', { name: 'Actions autorisées' }).getByRole('button', { name: 'Créer un ticket' }).click()
  for (const title of ['Skills', 'Intégration', 'Vérification']) {
    await page.getByRole('button', { name: 'Suivant' }).click()
    await page.getByRole('heading', { name: title }).waitFor()
  }
  await page.getByRole('button', { name: 'Créer l’agent' }).click()
  await page.waitForURL(/\/app\/agents\/agt_[a-z0-9]+\?created=1/, { timeout: 30_000 })
  agentId = page.url().match(/agt_[a-z0-9]+/)[0]
  await page.getByRole('heading', { name }).waitFor()
})

await run('ajouter une skill (publie une nouvelle version)', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=skills`)
  const row = page.locator('div', { has: page.getByText('Résumé', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Ajouter' }) }).last()
  await row.getByRole('button', { name: 'Ajouter' }).click()
  await page.getByText('v2 publiée').waitFor()
  await page.getByRole('button', { name: 'Retirer' }).first().waitFor()
})

await run('tester l’agent dans le bac à sable', async () => {
  await page.goto(`${CONSOLE}/app/playground?agent=${agentId}`)
  await page.getByRole('button', { name: 'Erreur 500 sur /api/invoices' }).click()
  await page.getByText(/Analyse terminée/).first().waitFor({ timeout: 30_000 })
  await page.getByText('logs_query').first().waitFor()
  await page.screenshot({ path: `${OUT}/01-playground.png` })
})

await run('créer une clé publiable de widget', async () => {
  await page.goto(`${CONSOLE}/app/integrations?tab=keys`)
  await page.getByRole('button', { name: 'Créer une clé' }).click()
  await page.locator('#k-name').fill('Widget E2E')
  await page.locator('#k-scope').selectOption('publishable')
  await page.getByRole('button', { name: 'Créer la clé' }).click()
  const code = page.getByRole('dialog').locator('code', { hasText: 'fa_pub_' })
  pubKey = (await code.textContent()).trim()
  await page.getByRole('button', { name: 'J’ai copié la clé' }).click()
})

await run('autoriser le domaine du site de démo dans le projet', async () => {
  await page.goto(`${CONSOLE}/app/projects/prj_bonaco`)
  await page.getByRole('heading', { name: 'Bonaco Pro' }).waitFor()
  await page.getByLabel('Nouveau domaine').waitFor()
  const host = new URL(API).host
  if (!(await page.getByRole('button', { name: `Retirer ${host}` }).count())) {
    await page.getByLabel('Nouveau domaine').fill(host)
    await page.getByLabel('Nouveau domaine').press('Enter')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await page.getByText('Projet enregistré').waitFor()
  }
})

const demoUrl = () => `${API}/demo-site?agent=${agentId}&key=${pubKey}`

await run('connecter le site de démo à l’agent (widget détecté)', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=site`)
  await page.locator('#s-url').fill(demoUrl())
  await page.getByRole('button', { name: 'Vérifier' }).click()
  await page.getByText('Connecté', { exact: true }).waitFor({ timeout: 20_000 })
})

const site = await context.newPage()
await run('dialoguer avec l’agent via le widget du site', async () => {
  await site.goto(demoUrl())
  await site.getByRole('button', { name: 'Ouvrir l’assistant' }).click()
  await site.getByLabel('Message').fill('Erreur 500 sur la page facturation')
  await site.getByLabel('Message').press('Enter')
  await site.locator('.m.a', { hasText: 'Analyse terminée' }).waitFor({ timeout: 30_000 })
  await site.screenshot({ path: `${OUT}/02-demo-site-widget.png` })
})

await run('envoyer un événement de la console au site (ping → pong)', async () => {
  await page.bringToFront()
  await page.locator('#s-ev').selectOption('ping')
  await page.getByRole('button', { name: 'Envoyer' }).click()
  await page.getByText(/pong depuis/).waitFor({ timeout: 15_000 })
  await page.screenshot({ path: `${OUT}/03-site-events.png` })
})

await run('voir les logs de l’agent', async () => {
  await page.goto(`${CONSOLE}/app/agents/${agentId}?tab=logs`)
  const log = page.getByRole('log', { name: 'Journal en direct' })
  await log.getByText(/widget · entrée reçue/).first().waitFor()
  await log.getByText(/événement ping → site/).first().waitFor()
  await page.screenshot({ path: `${OUT}/04-logs.png` })
})

await run('demander un agent à l’équipe interne et suivre la demande', async () => {
  await page.goto(`${CONSOLE}/app/internal-team`)
  await page.getByRole('button', { name: 'Nouvelle demande' }).click()
  await page.locator('#tr-brief').fill('Un agent de surveillance pour Bonaco Pro : erreurs 5xx et latence, alerte l’équipe.')
  await page.getByRole('button', { name: 'Envoyer à l’équipe' }).click()
  await page.getByLabel('Détail de la demande').getByText('Terminée', { exact: true }).waitFor({ timeout: 45_000 })
  await page.getByRole('link', { name: 'Ouvrir l’agent créé' }).waitFor()
  await page.screenshot({ path: `${OUT}/05-internal-team.png`, fullPage: true })
})

await browser.close()
if (errors.length) {
  console.log(`✗ erreurs JavaScript dans la page :\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log(`\nParcours complet réussi. Captures dans ${OUT}/`)
