import { ArrowUp, Moon, Sun } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { LogoMark } from '@/components/brand/logo'
import { HeatShimmer, Sparks } from '@/components/brand/sparks'
import { CodeBlock } from '@/components/common/code-block'
import { Item, Shutter, Stagger } from '@/components/landing/reveal'
import { RunDemo } from '@/components/landing/run-demo'
import { useTheme } from '@/lib/theme'
import { AGENT_TYPE_ORDER, AGENT_TYPES } from '@/labels'
import { cn } from '@/lib/utils'

const GITHUB = 'https://github.com/forgeagent/forgeagent'

/* ---------- Nav ---------- */
function Nav() {
  const { resolved, toggle } = useTheme()
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.045em]">
          <LogoMark className="size-8" /> ForgeAgent
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
          <a href="#fonctionnalites" className="hidden rounded-md px-3 py-2 text-[15px] font-semibold hover:bg-secondary md:block">
            Fonctionnalités
          </a>
          <Link to="/docs" className="hidden rounded-md px-3 py-2 text-[15px] font-semibold hover:bg-secondary md:block">
            Documentation
          </Link>
          <a href={GITHUB} target="_blank" rel="noreferrer" className="rounded-md px-3 py-2 text-[15px] font-semibold hover:bg-secondary">
            GitHub
          </a>
          <button onClick={toggle} className="rounded-md p-2.5 hover:bg-secondary" aria-label={`Thème ${resolved === 'dark' ? 'clair' : 'sombre'}`}>
            {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <Link to="/login" className="hidden rounded-md px-3 py-2 text-[15px] font-semibold hover:bg-secondary sm:block">
            Connexion
          </Link>
        </nav>
      </div>
    </header>
  )
}

/* ---------- Hero: the ingot at enormous scale ---------- */
function HexButton({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'hex-x inline-flex h-14 items-center justify-center bg-foreground px-9 text-[17px] font-bold text-background transition-[background-color,transform] duration-200 hover:bg-ember hover:text-ember-ink active:scale-[0.98]',
        className,
      )}
    >
      {children}
    </Link>
  )
}

function Hero() {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 140])
  const rotate = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 8])

  return (
    <section ref={ref} className="relative overflow-hidden lg:h-[100svh] lg:min-h-[720px]">
      {/* Desktop: giant cropped hexagon entering from the right */}
      <motion.div
        aria-hidden
        style={{ y, rotate }}
        className="hex hero-ingot absolute hidden bg-ember lg:block"
        initial={reduce ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Heat over the ingot and sparks rising from it (decorative, off under reduced motion) */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[55%] lg:block">
        <HeatShimmer />
        <Sparks count={22} />
      </div>

      <div className="relative mx-auto grid h-full max-w-[1440px] gap-10 px-4 pt-28 sm:px-8 lg:grid-cols-12 lg:items-center lg:pt-0">
        <Stagger className="min-w-0 lg:col-span-6">
          <Item>
            <h1 className="text-[clamp(52px,6.4vw,104px)] leading-[0.9] font-extrabold tracking-[-0.05em]">
              Forgez vos
              <br />
              agents IA.
            </h1>
          </Item>
          <Item>
            <p className="mt-8 max-w-[34ch] text-[19px] leading-[1.45] lg:mt-10 lg:text-[21px]">
              La console open source pour forger, tester, intégrer et superviser des agents propulsés par Claude. Chaque agent est un espace scellé : ses données, ses clés et ses coûts n’appartiennent qu’à lui.
            </p>
          </Item>
          <Item className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <HexButton to="/app">Ouvrir la console</HexButton>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="text-[16px] font-semibold underline decoration-2 underline-offset-[6px] hover:text-ember">
              Code source sur GitHub
            </a>
          </Item>
        </Stagger>

        {/* The live run sits on the ingot */}
        <div className="relative min-w-0 lg:col-span-5 lg:col-start-8">
          <div aria-hidden className="hex absolute top-[-6%] left-1/2 aspect-square w-[130vw] -translate-x-1/2 bg-ember sm:w-[110vw] lg:hidden" />
          <motion.div
            className="relative py-[14vw] sm:py-24 lg:py-0"
            initial={reduce ? false : { opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="mb-3 w-fit rounded-md bg-ember px-2.5 py-1 text-[15px] font-semibold text-ember-ink">Choisissez un incident, regardez l’agent travailler</p>
            <RunDemo />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Features: close-ups on a board ---------- */
function Tile({ className, title, text, children, tone = 'card' }: { className?: string; title?: string; text?: string; children?: React.ReactNode; tone?: 'card' | 'ink' | 'ember' | 'secondary' }) {
  const toneCls = { card: 'bg-card', ink: 'bg-foreground text-background', ember: 'bg-ember text-ember-ink', secondary: 'bg-secondary' }[tone]
  return (
    <Item className={cn('relative overflow-hidden rounded-lg', toneCls, className)}>
      {children}
      {title && (
        <div className="absolute bottom-5 left-5 right-5">
          <div className="text-[18px] font-semibold">{title}</div>
          {text && <div className={cn('text-[15px]', tone === 'card' || tone === 'secondary' ? 'text-muted-foreground' : 'opacity-80')}>{text}</div>}
        </div>
      )}
    </Item>
  )
}

function Features() {
  return (
    <section id="fonctionnalites" className="mx-auto max-w-[1440px] scroll-mt-6 px-2.5 py-[120px] sm:px-8 lg:pt-[96px] lg:pb-[180px]">
      <Stagger className="grid auto-rows-[28vw] grid-cols-2 gap-1.5 sm:auto-rows-[104px] sm:grid-cols-12 sm:gap-2">
        <Tile className="col-span-2 row-span-2 sm:col-span-6" tone="secondary">
          <h2 className="absolute top-5 left-5 max-w-[12ch] text-[clamp(36px,4vw,60px)] leading-[0.95] font-extrabold tracking-[-0.045em]">Gardez la main.</h2>
        </Tile>
        <Tile className="col-span-2 row-span-2 sm:col-span-6" title="Plafond de coût par agent" text="L’agent se met en pause en l’atteignant.">
          <div data-ui className="absolute top-7 -right-10 left-[30%] text-[280%] sm:top-6 sm:text-[300%]" aria-hidden>
            <div className="relative h-[0.18em] rounded-full bg-secondary">
              <div className="absolute inset-y-0 left-0 w-[62%] rounded-full bg-ember" />
              <div className="absolute top-1/2 left-[62%] size-[0.7em] -translate-1/2 rounded-full bg-foreground" />
            </div>
            <div className="mt-[0.35em] text-[40%] font-semibold tabular">30 $ / jour</div>
          </div>
        </Tile>
        <Tile className="col-span-2 row-span-3 sm:col-span-6 sm:row-span-4" tone="ink" title="Trois niveaux d’autonomie" text="Suggérer, agir après validation, ou agir seul sur les cas simples.">
          <div data-ui className="absolute top-8 right-6 left-6 flex flex-wrap gap-[0.2em] text-[220%] sm:top-10 lg:right-auto lg:flex-nowrap lg:text-[300%]" aria-hidden>
            {['Suggère seulement', 'Après validation', 'Agit seul'].map((x, i) => (
              <div key={x} className={cn('w-fit rounded-[0.2em] px-[0.4em] py-[0.12em] text-[55%] font-bold whitespace-nowrap', i === 1 ? 'bg-ember text-ember-ink' : 'bg-background/10')}>
                {x}
              </div>
            ))}
          </div>
        </Tile>
        <Tile className="col-span-1 row-span-2 sm:col-span-3 sm:row-span-4" title="Arrêt d’urgence" text="Tous les agents en pause, en un geste.">
          <div data-ui className="absolute top-8 -right-6 text-[300%] sm:top-10 sm:-right-4 sm:text-[420%]" aria-hidden>
            <div className="flex h-[0.9em] w-[1.6em] items-center rounded-full bg-danger p-[0.1em]">
              <div className="ml-auto size-[0.7em] rounded-full bg-white" />
            </div>
          </div>
        </Tile>
        <Tile className="col-span-1 row-span-2 sm:col-span-3 sm:row-span-4" tone="secondary" title="Versions" text="Chaque modification publie une version restaurable.">
          <div data-ui className="absolute top-6 -left-2 flex gap-[0.3em] text-[230%] font-extrabold tracking-[-0.04em] whitespace-nowrap sm:top-8 sm:text-[300%]" aria-hidden>
            <span>v4</span>
            <span className="text-muted-foreground">v3</span>
            <span className="text-muted-foreground/60">v2</span>
          </div>
        </Tile>
        <Tile className="col-span-1 row-span-2 sm:col-span-3" title="Palette ⌘K" text="Tout est au clavier.">
          <div data-ui className="absolute -top-3 right-3 flex gap-[0.15em] text-[300%] sm:-top-4" aria-hidden>
            {['⌘', 'K'].map((k) => (
              <kbd key={k} className="flex size-[1.1em] items-center justify-center rounded-[0.18em] bg-secondary font-sans text-[60%] font-bold">
                {k}
              </kbd>
            ))}
          </div>
        </Tile>
        <Tile className="col-span-1 row-span-2 sm:col-span-3" tone="ember" title="Statut en direct" text="Actif, en pause ou en erreur.">
          <div data-ui className="absolute -top-2 right-4 flex items-center gap-[0.25em] text-[300%] font-extrabold tracking-[-0.04em]" aria-hidden>
            <span className="hex size-[0.5em] bg-ember-ink" /> Actif
          </div>
        </Tile>
        <Tile className="col-span-2 row-span-2 sm:col-span-6" tone="secondary" title="Rôles et accès" text="Administrateur, éditeur, lecteur, et accès nominatifs par agent.">
          <div data-ui className="absolute -top-4 right-6 flex text-[300%] sm:-top-6 sm:text-[360%]" aria-hidden>
            {['AK', 'ID', 'TM'].map((x, i) => (
              <span key={x} className={cn('hex -ml-[0.2em] flex size-[1.1em] items-center justify-center text-[38%] font-extrabold', i === 0 ? 'bg-foreground text-background' : i === 1 ? 'bg-ember text-ember-ink' : 'bg-card')}>
                {x}
              </span>
            ))}
          </div>
        </Tile>
      </Stagger>
    </section>
  )
}

/* ---------- Showcase: square plate, spare text ---------- */
const SHOW = {
  create: {
    tab: 'Créer',
    title: 'Un agent en sept étapes',
    text: 'Identité, type et modèle Claude, déclencheurs et outils MCP, actions autorisées et interdites, skills, intégration. Le brouillon s’enregistre tout seul.',
  },
  test: {
    tab: 'Tester',
    title: 'Un bac à sable honnête',
    text: 'Scénarios prêts à jouer, appels d’outils détaillés, coût de chaque réponse et vérification de la connexion au site avant la mise en ligne.',
  },
  ship: {
    tab: 'Intégrer',
    title: 'Sur un site déjà en ligne',
    text: 'Une balise script, une API REST, un SDK JavaScript ou Python, ou un serveur MCP. Le même agent, partout où vous en avez besoin.',
  },
} as const
type ShowId = keyof typeof SHOW

function ShowFragment({ id }: { id: ShowId }) {
  if (id === 'create')
    return (
      <div data-ui className="grid h-full content-center gap-3 p-[7%] text-[15px]">
        <div className="text-[13px] font-semibold opacity-70">Actions et permissions</div>
        <div className="flex flex-wrap gap-2">
          {['Lire les journaux', 'Créer un ticket', 'Envoyer une alerte'].map((x) => (
            <span key={x} className="rounded-md bg-foreground px-3 py-1.5 text-[14px] font-medium text-background">
              {x}
            </span>
          ))}
          {['Suspendre un compte', 'Redémarrer un service'].map((x) => (
            <span key={x} className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-medium">
              {x}
            </span>
          ))}
        </div>
        <div className="mt-3 text-[13px] font-semibold opacity-70">Interdit</div>
        <div className="flex flex-wrap gap-2">
          {['Supprimer des données', 'Modifier les paiements'].map((x) => (
            <span key={x} className="rounded-md bg-danger/15 px-3 py-1.5 text-[14px] font-medium text-danger">
              {x}
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[13px] font-semibold">
          {['Suggère', 'Après validation', 'Seul'].map((x, i) => (
            <span key={x} className={cn('rounded-md px-2 py-2.5 text-center', i === 1 ? 'bg-foreground text-background' : 'bg-secondary')}>
              {x}
            </span>
          ))}
        </div>
      </div>
    )
  if (id === 'test')
    return (
      <div data-ui className="grid h-full content-center gap-3 p-[7%] text-[14.5px]">
        <div className="ml-auto max-w-[80%] rounded-lg bg-foreground px-4 py-3 text-background">Erreur 500 sur /api/invoices</div>
        <div className="max-w-[88%] rounded-lg bg-secondary px-4 py-3">
          Pool de connexions épuisé depuis 14:02. Je propose de redémarrer search-api : en attente de votre validation.
          <code className="mt-2 block rounded-md bg-background/70 px-3 py-2 text-[12px]">logs.query · 214 lignes</code>
          <div className="mt-2 text-[12.5px] text-muted-foreground">2,1 s · 3 120 tokens · 0,011 $</div>
        </div>
        <div className="grid gap-1.5 text-[13.5px]">
          {['Clé Anthropic et modèle', 'Connexion aux outils (MCP)', 'Site externe : app.bonaco.pro'].map((x) => (
            <span key={x} className="flex items-center gap-2">
              <span className="hex size-2 bg-ok" /> {x}
            </span>
          ))}
        </div>
      </div>
    )
  return (
    <div className="grid h-full content-center p-[6%]">
      <CodeBlock
        snippets={[
          {
            id: 'w',
            label: 'index.html',
            code: `<script
  src="https://forge.bonaco.pro/widget.js"
  data-agent="agt_8f3k2"
  data-project="bonaco-pro"
  defer
></script>`,
          },
        ]}
      />
    </div>
  )
}

function Showcase() {
  const [tab, setTab] = useState<ShowId>('create')
  const s = SHOW[tab]
  return (
    <section className="bg-card">
      <div className="mx-auto grid max-w-[1440px] lg:min-h-[88svh] lg:grid-cols-2">
        <div className="flex items-center px-4 py-10 sm:px-10 lg:py-20">
          <Shutter className="aspect-square w-full overflow-hidden rounded-lg bg-background">
            <ShowFragment id={tab} />
          </Shutter>
        </div>
        <Stagger className="flex flex-col justify-between gap-12 px-4 pb-12 sm:px-10 lg:py-20">
          <Item>
            <div role="tablist" aria-label="Étapes du produit" className="flex gap-6">
              {(Object.keys(SHOW) as ShowId[]).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cn('text-[18px] font-semibold transition-colors', tab === k ? 'text-foreground underline decoration-ember decoration-[3px] underline-offset-[10px]' : 'text-muted-foreground hover:text-foreground')}
                >
                  {SHOW[k].tab}
                </button>
              ))}
            </div>
          </Item>
          <Item>
            <h2 className="text-[clamp(30px,3vw,42px)] leading-[1.02] font-extrabold tracking-[-0.04em]">{s.title}</h2>
            <p className="mt-6 max-w-[38ch] text-[18px] leading-[1.5]">{s.text}</p>
          </Item>
          <Item className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link to={tab === 'create' ? '/app/agents/new' : tab === 'test' ? '/app/test' : '/app/integration'} className="flex h-[72px] items-center rounded-lg bg-foreground px-6 text-[17px] font-bold text-background transition-colors hover:bg-ember hover:text-ember-ink">
              Essayer dans la console
            </Link>
            <Link to="/docs" className="flex h-[72px] items-center rounded-lg bg-secondary px-6 text-[17px] font-bold transition-colors hover:bg-input">
              Lire la documentation
            </Link>
          </Item>
        </Stagger>
      </div>
    </section>
  )
}

/* ---------- How it works: tiles that grow ---------- */
function HowItWorks() {
  const stages = [
    {
      name: 'Configuré',
      text: 'Mission, permissions et outils, relus avant création.',
      h: 'sm:h-[30vh]',
      span: 'sm:col-span-3',
      tone: 'bg-secondary',
      body: (
        <div data-ui className="grid gap-2 p-5 text-[13px]">
          <div className="rounded-md bg-background px-3 py-2">Gardien technique</div>
          <div className="rounded-md bg-background px-3 py-2">Surveillance · Performance</div>
        </div>
      ),
    },
    {
      name: 'Testé',
      text: 'Scénarios en bac à sable, vérifications au vert.',
      h: 'sm:h-[44vh]',
      span: 'sm:col-span-4',
      tone: 'bg-card',
      body: (
        <div data-ui className="grid gap-2 p-6 text-[14px]">
          {['Modèle', 'Outils MCP', 'Permissions', 'Garde-fous', 'Site externe'].map((x) => (
            <span key={x} className="flex items-center gap-2">
              <span className="hex size-2.5 bg-ok" /> {x}
            </span>
          ))}
        </div>
      ),
    },
    {
      name: 'En production',
      text: 'Traces, coûts et journal en direct, arrêt d’urgence à portée.',
      h: 'sm:h-[60vh]',
      span: 'sm:col-span-5',
      tone: 'bg-foreground text-background',
      body: (
        <div data-ui className="grid gap-5 p-7">
          <div className="grid grid-cols-2 gap-4">
            {[
              ['1 248', 'exécutions'],
              ['99,2 %', 'succès'],
              ['4,20 $', 'aujourd’hui'],
              ['2,1 s', 'p50'],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="text-[30px] leading-none font-extrabold tracking-[-0.04em] tabular">{v}</div>
                <div className="text-[13px] opacity-70">{l}</div>
              </div>
            ))}
          </div>
          <code className="block text-[12px] leading-[1.8] opacity-85">
            <span className="block">14:02:11 info cron */5 · 3 services vérifiés</span>
            <span className="block">14:02:40 warn p95 /search 2 140 ms</span>
            <span className="block">14:03:02 info alerte envoyée à #incidents</span>
          </code>
        </div>
      ),
    },
  ]
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-[120px] sm:px-8 lg:py-[200px]">
      <Stagger className="grid gap-7 sm:grid-cols-12 sm:items-end sm:gap-2.5">
        <Item className="sm:col-span-7 sm:row-start-1 sm:self-start">
          <h2 className="text-[clamp(30px,3.6vw,52px)] leading-[1] font-extrabold tracking-[-0.045em]">
            De l’idée
            <br />à la production.
          </h2>
        </Item>
        {stages.map((s) => (
          <Item key={s.name} className={cn('sm:row-start-2', s.span)}>
            <div data-ui className={cn('h-[46vw] overflow-hidden rounded-lg', s.h, s.tone)}>{s.body}</div>
            <div className="mt-4">
              <div className="text-[20px] font-semibold">{s.name}</div>
              <p className="mt-1 max-w-[34ch] text-[16px] text-muted-foreground">{s.text}</p>
            </div>
          </Item>
        ))}
      </Stagger>
    </section>
  )
}

/* ---------- The band: one full-width field of ember ---------- */
function TypesBand() {
  return (
    <section className="bg-ember text-ember-ink" style={{ clipPath: 'polygon(0 48px, 48px 0, calc(100% - 48px) 0, 100% 48px, 100% 100%, 0 100%)' }}>
      <div className="mx-auto grid max-w-[1440px] gap-12 px-4 py-[120px] sm:px-8 lg:grid-cols-12 lg:py-[160px]">
        <Stagger className="min-w-0 lg:col-span-5">
          <Item>
            <h2 className="text-[clamp(32px,3.6vw,52px)] leading-[1] font-extrabold tracking-[-0.045em]">Pas seulement des chatbots.</h2>
          </Item>
          <Item>
            <p className="mt-6 max-w-[36ch] text-[18px] leading-[1.5]">Dix familles d’agents et leurs sous-catégories, du gardien qui surveille vos serveurs au chef d’orchestre qui coordonne une équipe d’agents.</p>
          </Item>
          <Item className="mt-10">
            <CodeBlock
              title="Terminal"
              snippets={`git clone https://github.com/forgeagent/forgeagent
cd forgeagent && docker compose up
# Console prête sur http://localhost:3000`}
            />
          </Item>
        </Stagger>
        <Stagger className="min-w-0 lg:col-span-6 lg:col-start-7">
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {AGENT_TYPE_ORDER.map((t) => (
              <Item as="li" key={t} className="flex items-baseline gap-3 py-3">
                <span className="hex size-3 shrink-0 translate-y-[-2px] bg-ember-ink" aria-hidden />
                <span>
                  <span className="block text-[22px] font-bold tracking-[-0.03em]">{AGENT_TYPES[t].label}</span>
                  <span className="block text-[15px] opacity-85">{AGENT_TYPES[t].hint}</span>
                </span>
              </Item>
            ))}
          </ul>
        </Stagger>
      </div>
    </section>
  )
}

/* ---------- FAQ: accordion of filled tiles ---------- */
const FAQ = [
  ['Faut-il savoir coder ?', 'Non pour configurer, tester et piloter un agent : tout se fait dans la console. Oui si vous voulez écrire vos propres skills ou connecteurs.'],
  ['Quel modèle fait tourner les agents ?', 'L’API Claude d’Anthropic : Haiku pour les tâches simples, Sonnet par défaut, Opus pour le raisonnement complexe. Le routage se règle par agent et par type de tâche.'],
  ['Puis-je brancher un agent sur un site déjà en ligne ?', 'Oui : une balise script suffit pour le widget, ou l’API REST, le SDK et le serveur MCP pour les applications. La console vérifie la connexion et la latence.'],
  ['Où sont stockées mes données ?', 'Chez vous. ForgeAgent est auto-hébergé : conversations, traces et clés restent sur votre infrastructure, avec masquage des données personnelles et durée de conservation réglable.'],
  ['Comment empêcher un agent de faire une bêtise ?', 'Actions autorisées et interdites, validation humaine des actions sensibles, plafond de coût, protection contre l’injection de prompt et arrêt d’urgence global.'],
  ['Est-ce vraiment gratuit ?', 'La plateforme est open source et gratuite. Vous ne payez que votre consommation de l’API Claude, suivie agent par agent dans la console.'],
  ['Y a-t-il une partie client final ?', 'Non. ForgeAgent est un outil pour développeurs et équipes techniques : pas de commandes, pas de comptes clients.'],
]

function Faq() {
  return (
    <section className="mx-auto grid max-w-[1440px] gap-10 px-4 py-[120px] sm:px-8 lg:grid-cols-12 lg:py-[180px]">
      <div className="lg:col-span-4">
        <h2 className="text-[clamp(34px,4vw,56px)] leading-[0.98] font-extrabold tracking-[-0.045em] lg:sticky lg:top-24">Vos questions.</h2>
      </div>
      <Stagger className="grid gap-2 lg:col-span-8">
        {FAQ.map(([q, a], i) => (
          <Item key={q}>
            <details name="faq" open={i === 0} className="group rounded-lg bg-card transition-colors open:bg-ember open:text-ember-ink">
              <summary className="flex min-h-[72px] cursor-pointer list-none items-center justify-between gap-6 px-6 text-[19px] font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <span className="relative size-4 shrink-0" aria-hidden>
                  <span className="absolute top-1/2 left-0 h-[3px] w-4 -translate-y-1/2 rounded-full bg-current" />
                  <span className="absolute top-1/2 left-0 h-[3px] w-4 -translate-y-1/2 rotate-90 rounded-full bg-current transition-transform duration-200 group-open:rotate-0" />
                </span>
              </summary>
              <p className="max-w-[52ch] px-6 pb-6 text-[17px] leading-[1.5]">{a}</p>
            </details>
          </Item>
        ))}
      </Stagger>
    </section>
  )
}

/* ---------- CTA: one word is the button ---------- */
function Cta() {
  return (
    <Link
      to="/app"
      className="group relative block h-[46svh] min-h-[320px] overflow-hidden bg-ember text-ember-ink transition-colors duration-150 hover:bg-foreground hover:text-background focus-visible:bg-foreground focus-visible:text-background lg:h-[60svh]"
      style={{ clipPath: 'polygon(0 48px, 48px 0, calc(100% - 48px) 0, 100% 48px, 100% 100%, 0 100%)' }}
    >
      <span className="absolute top-14 left-4 max-w-[26ch] text-[17px] font-semibold sm:left-8 sm:text-[20px]">Ouvrez la console en mode démo, sans installation ni compte.</span>
      <svg viewBox="0 0 48 48" className="absolute top-14 right-4 size-8 transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-1 sm:right-8 sm:size-12" aria-hidden>
        <path d="M12 36 36 12M16 12h20v20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square" />
      </svg>
      <span className="absolute inset-x-4 bottom-6 text-[clamp(88px,24vw,420px)] leading-[0.78] font-extrabold tracking-[-0.06em] sm:inset-x-8">Forger</span>
    </Link>
  )
}

/* ---------- Footer: the mark, built large ---------- */
function Footer() {
  const letters = 'ForgeAgent'.split('')
  const heights = [100, 72, 84, 64, 90, 100, 70, 88, 62, 80]
  const cols: [string, [string, string][]][] = [
    ['Produit', [['Console', '/app'], ['Forger un agent', '/app/agents/new'], ['Test', '/app/test'], ['La Forge', '/app/forge']]],
    ['Développeurs', [['Documentation', '/docs'], ['Brancher le back-end', '/docs/backend'], ['API REST', '/docs/api'], ['SDK et MCP', '/docs/integration']]],
    ['Projet', [['GitHub', GITHUB], ['Licence Apache 2.0', `${GITHUB}/blob/main/LICENSE`], ['Feuille de route', `${GITHUB}/discussions`], ['Contribuer', `${GITHUB}/blob/main/CONTRIBUTING.md`]]],
    ['Compte', [['Connexion', '/login'], ['Inscription', '/login?mode=signup'], ['Paramètres', '/app/settings'], ['Plateforme', '/app/settings?tab=platform']]],
  ]
  return (
    <footer className="bg-card">
      <div className="mx-auto max-w-[1440px] px-4 pt-16 pb-8 sm:px-8">
        <div className="flex h-[22svh] min-h-[140px] items-end gap-1 lg:h-[34svh]" aria-label="ForgeAgent" role="img">
          {letters.map((l, i) => (
            <span
              key={i}
              className={cn('flex flex-1 items-end justify-center rounded-t-md pb-[0.08em] text-[clamp(28px,7.5vw,128px)] leading-none font-extrabold tracking-[-0.04em]', i === 5 ? 'bg-ember text-ember-ink' : i % 2 ? 'bg-secondary' : 'bg-foreground text-background')}
              style={{ height: `${heights[i]}%` }}
              aria-hidden
            >
              {l}
            </span>
          ))}
        </div>
        <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
          {cols.map(([title, links]) => (
            <div key={title} className="lg:col-span-2">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <ul className="mt-3 grid gap-2">
                {links.map(([l, href]) => (
                  <li key={l}>
                    {href.startsWith('http') ? (
                      <a href={href} target="_blank" rel="noreferrer" className="text-[15px] text-muted-foreground hover:text-foreground">
                        {l}
                      </a>
                    ) : (
                      <Link to={href} className="text-[15px] text-muted-foreground hover:text-foreground">
                        {l}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="text-[15px] lg:col-span-4 lg:col-start-9">
            <p>Premier projet propulsé : Bonaco Pro.</p>
            <p className="mt-2 text-muted-foreground">Agents de surveillance technique, d’anti-abus et d’administration.</p>
          </div>
        </div>
        <div className="mt-14 flex items-center justify-between gap-4 text-[14px] text-muted-foreground">
          <span>© 2026 ForgeAgent · logiciel libre</span>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 font-semibold text-background hover:bg-ember hover:text-ember-ink">
            <ArrowUp className="size-4" /> Haut de page
          </button>
        </div>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className="min-h-svh overflow-x-clip bg-background">
      <Nav />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <HowItWorks />
        <TypesBand />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}
