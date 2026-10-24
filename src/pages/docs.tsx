import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'
import { LogoMark } from '@/components/brand/logo'
import { CodeBlock } from '@/components/common/code-block'
import { NativeSelect } from '@/components/common/field'
import { LinkButton } from '@/components/common/link-button'
import { Kbd } from '@/components/common/page'
import { AGENT_TYPE_ORDER, AGENT_TYPES, AUTONOMY } from '@/labels'
import { agentSnippets } from '@/lib/snippets'

const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-12 mb-3 text-[22px] font-bold tracking-[-0.03em] first:mt-0">{children}</h2>
const P = ({ children }: { children: ReactNode }) => <p className="mb-4 max-w-[68ch] text-[16px] leading-[1.65]">{children}</p>
const C = ({ children }: { children: ReactNode }) => <code className="rounded-[4px] bg-secondary px-1.5 py-0.5 text-[13.5px]">{children}</code>

const ENDPOINTS: [string, string, string][] = [
  ['GET', '/v1/overview', 'Métriques du tableau de bord'],
  ['GET · POST', '/v1/agents', 'Lister, créer un agent'],
  ['GET · PATCH · DELETE', '/v1/agents/:id', 'Lire, modifier (versionNote ⇒ nouvelle version), supprimer'],
  ['POST', '/v1/agents/:id/run', 'Exécuter l’agent (sandbox: true en bac à sable)'],
  ['POST', '/v1/agents/:id/checks', 'Vérifications de configuration'],
  ['POST', '/v1/agents/:id/versions/:v/restore', 'Restaurer une version'],
  ['POST', '/v1/agents/:id/site/ping · /site/events', 'Site externe : connexion et événements'],
  ['GET · POST · PATCH · DELETE', '/v1/projects(/:id)', 'Projets'],
  ['GET', '/v1/traces · /v1/logs · /v1/logs/stream (SSE)', 'Observabilité'],
  ['GET · POST', '/v1/approvals · /:id/approve · /:id/reject', 'Validations humaines'],
  ['GET · PATCH', '/v1/settings', 'Paramètres, arrêt d’urgence (killSwitch)'],
  ['GET · POST · DELETE', '/v1/api-keys · /:id/rotate', 'Clés API (secret renvoyé une seule fois)'],
  ['…', '/v1/skills, /connectors, /knowledge, /memories, /team, /webhooks, /workflows, /schedules, /delegations, /evals, /audit, /notifications', 'Voir src/api/http.ts'],
]

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'start',
    title: 'Démarrage',
    body: (
      <>
        <P>ForgeAgent est une console open source et auto-hébergée pour créer, tester, intégrer et superviser des agents IA dont le cerveau est l’API Claude. C’est un outil pour développeurs : il n’y a pas de partie client final.</P>
        <H2>Lancer le front-end</H2>
        <CodeBlock title="Terminal" snippets={`npm install\nnpm run dev\n# http://localhost:5173 · mode démo, données fictives`} />
        <H2>Premier agent en cinq minutes</H2>
        <ol className="mb-4 grid max-w-[68ch] list-decimal gap-2 pl-5 text-[16px] leading-[1.6]">
          <li>Créez un projet (par exemple Bonaco Pro) dans Projets.</li>
          <li>Ouvrez Créer un agent et suivez les sept étapes.</li>
          <li>Testez-le dans l’environnement de test : scénarios, appels d’outils, vérifications.</li>
          <li>Copiez le code d’intégration, ou reliez un site déjà en ligne.</li>
        </ol>
        <LinkButton to="/app/agents/new" className="mt-2">
          Créer un agent
        </LinkButton>
      </>
    ),
  },
  {
    id: 'concepts',
    title: 'Concepts',
    body: (
      <>
        <P>Un agent = des déclencheurs + des capacités (outils MCP, connaissances, mémoire, skills) + des sorties + des règles (actions autorisées et interdites, autonomie, plafonds).</P>
        <H2>Types d’agents</H2>
        <ul className="mb-4 grid max-w-[68ch] gap-2 text-[15.5px]">
          {AGENT_TYPE_ORDER.map((t) => (
            <li key={t}>
              <b className="font-semibold">{AGENT_TYPES[t].label}</b> : {AGENT_TYPES[t].hint}. <span className="text-muted-foreground">{AGENT_TYPES[t].subcategories.join(', ')}.</span>
            </li>
          ))}
        </ul>
        <H2>Niveaux d’autonomie</H2>
        <ul className="mb-4 grid max-w-[68ch] gap-2 text-[15.5px]">
          {Object.entries(AUTONOMY).map(([k, v]) => (
            <li key={k}>
              <C>{k}</C> <b className="font-semibold">{v.label}</b> : {v.hint}
            </li>
          ))}
        </ul>
        <H2>Versions</H2>
        <P>Chaque publication crée une version (v1, v2…). Restaurer une version crée une nouvelle version : rien n’est jamais perdu.</P>
      </>
    ),
  },
  {
    id: 'integration',
    title: 'Intégration',
    body: (
      <>
        <P>Le même agent s’utilise partout : widget sur un site déjà en ligne, API REST depuis un back-end, SDK JavaScript ou Python, ou serveur MCP pour d’autres agents.</P>
        <CodeBlock snippets={agentSnippets('agt_8f3k2')} />
        <H2>Site déjà en ligne</H2>
        <P>
          Ajoutez le domaine dans <C>Projets › Domaines autorisés</C>, collez le script avant <C>{'</body>'}</C>, puis cliquez sur Vérifier dans <C>Agent › Site externe</C>. La console mesure la latence et peut envoyer des événements de test au site.
        </P>
      </>
    ),
  },
  {
    id: 'backend',
    title: 'Brancher le back-end',
    body: (
      <>
        <P>
          Toute la communication passe par une seule interface TypeScript, <C>ForgeApi</C>, définie dans <C>src/api/client.ts</C>. Deux implémentations existent : <C>src/api/mock</C> (en mémoire, mode démo) et <C>src/api/http.ts</C> (REST).
        </P>
        <CodeBlock title=".env.local" snippets={`VITE_API_URL=http://localhost:8787\n# absent ⇒ mode démo (données fictives)`} />
        <P>
          Les écrans n’appellent jamais <C>fetch</C> : ils utilisent les hooks de <C>src/api/hooks.ts</C> (TanStack Query). Pour brancher une ressource, implémentez la route correspondante côté serveur en renvoyant les types de <C>src/api/types.ts</C>.
        </P>
        <H2>Règles côté serveur</H2>
        <ul className="mb-4 grid max-w-[68ch] list-disc gap-2 pl-5 text-[15.5px]">
          <li>Authentification par cookie de session (le front envoie credentials: include) ; jamais de clé API dans le navigateur.</li>
          <li>Secrets chiffrés au repos, jamais renvoyés en clair (sauf à la création d’une clé).</li>
          <li>Validation humaine, permissions par outil, plafonds de coût et arrêt d’urgence appliqués côté serveur.</li>
          <li>Journal d’audit en ajout seul ; traces OpenTelemetry pour chaque exécution.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'api',
    title: 'API REST',
    body: (
      <>
        <P>Contrat attendu par src/api/http.ts. Toutes les routes sont préfixées par /v1 et renvoient du JSON (204 sans corps pour les suppressions).</P>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="text-left text-[12.5px] text-muted-foreground">
                <th className="pb-2 font-medium">Méthodes</th>
                <th className="pb-2 font-medium">Route</th>
                <th className="pb-2 font-medium">Rôle</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(([m, r, d]) => (
                <tr key={r} className="border-t align-top">
                  <td className="py-2.5 pr-4 font-mono text-[12.5px] whitespace-nowrap">{m}</td>
                  <td className="py-2.5 pr-4 font-mono text-[12.5px]">{r}</td>
                  <td className="py-2.5">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Sécurité',
    body: (
      <>
        <P>Garde-fous par agent et globaux : protection contre l’injection de prompt, masquage des données personnelles, validation humaine des actions sensibles, liste d’actions interdites, limitation du débit.</P>
        <P>L’arrêt d’urgence (Sécurité › Tout arrêter) met en pause tous les agents de tous les projets. Le plafond mensuel bascule les agents en « suggère seulement » une fois atteint.</P>
      </>
    ),
  },
  {
    id: 'shortcuts',
    title: 'Raccourcis clavier',
    body: (
      <ul className="grid max-w-md gap-2 text-[15px]">
        {[
          [['Ctrl', 'K'], 'Palette de commandes'],
          [['C'], 'Créer un agent'],
          [['T'], 'Basculer le thème'],
          [['G', 'D'], 'Tableau de bord'],
          [['G', 'A'], 'Agents'],
          [['G', 'T'], 'Environnement de test'],
          [['?'], 'Tous les raccourcis'],
        ].map(([k, l]) => (
          <li key={l as string} className="flex items-center justify-between">
            <span>{l}</span>
            <span className="flex gap-1">
              {(k as string[]).map((x) => (
                <Kbd key={x}>{x}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    ),
  },
]

export default function Docs() {
  const { section = 'start' } = useParams()
  const navigate = useNavigate()
  const i = Math.max(0, SECTIONS.findIndex((s) => s.id === section))
  const current = SECTIONS[i]
  const prev = SECTIONS[i - 1]
  const next = SECTIONS[i + 1]

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 bg-background/95">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 text-[18px] font-extrabold tracking-[-0.04em]">
            <LogoMark /> ForgeAgent <span className="font-semibold text-muted-foreground">Docs</span>
          </Link>
          <LinkButton to="/app" size="sm">
            Ouvrir la console
          </LinkButton>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 pt-8 pb-24 sm:px-8 lg:grid-cols-[220px_1fr]">
        <aside>
          <NativeSelect value={current.id} onChange={(e) => navigate(`/docs/${e.target.value}`)} aria-label="Section" className="lg:hidden">
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </NativeSelect>
          <nav aria-label="Documentation" className="sticky top-24 hidden lg:block">
            <ul className="grid gap-0.5">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <NavLink to={`/docs/${s.id}`} className={() => `flex h-9 items-center rounded-md px-3 text-[14.5px] transition-colors ${s.id === current.id ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
                    {s.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <main>
          <h1 className="mb-8 text-[36px] leading-tight font-extrabold tracking-[-0.04em]">{current.title}</h1>
          {current.body}
          <div className="mt-16 flex justify-between gap-4">
            {prev ? (
              <LinkButton to={`/docs/${prev.id}`} variant="outline">
                <ArrowLeft /> {prev.title}
              </LinkButton>
            ) : (
              <span />
            )}
            {next && (
              <LinkButton to={`/docs/${next.id}`} variant="outline">
                {next.title} <ArrowRight />
              </LinkButton>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
